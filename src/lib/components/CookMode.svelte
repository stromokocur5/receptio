<script lang="ts">
	import { onMount } from 'svelte';
	import { formatAmount, formatGrams, formatPiece } from '$lib/amounts';
	import { useCatalog } from '$lib/catalog';
	import { scaleStep, splitStep, stepActivity, stepGuides, stepLines } from '$lib/cooking';
	import CookScene from '$lib/components/CookScene.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import RecipeFeedback from '$lib/components/RecipeFeedback.svelte';
	import TimerDock from '$lib/components/TimerDock.svelte';
	import type { PantryUse } from '$lib/pantry';
	import {
		RATING_LABELS,
		markCooked,
		undoCooked,
		type CookUndo,
		pantry,
		rateLastCooked,
		type Rating
	} from '$lib/state.svelte';
	import { startTimer } from '$lib/timers.svelte';
	import {
		createListener,
		recognitionSupported,
		speak,
		speechSupported,
		type VoiceCommand
	} from '$lib/voice';
	import type { RecipeLine } from '$lib/types';

	let {
		recipeId,
		title,
		steps,
		lines,
		servings,
		recipeServings,
		variant,
		tools = [],
		guides = [],
		onclose
	}: {
		recipeId: string;
		title: string;
		steps: string[];
		lines: RecipeLine[];
		/** Servings being cooked; amounts are scaled from `recipeServings`. */
		servings: number;
		recipeServings: number;
		variant?: string;
		/** Equipment names, shown with the ingredients so everything is ready before starting. */
		tools?: string[];
		/** The recipe's beginner guides; each step shows the ones it needs. */
		guides?: { slug: string; title: string }[];
		onclose: () => void;
	} = $props();

	const catalog = useCatalog();
	const factor = $derived(servings / recipeServings);

	let index = $state(0);
	let direction = $state(1);
	let showAll = $state(false);
	let screenLock = $state<'on' | 'off' | 'unsupported'>('off');
	let cooked = $state<PantryUse[] | null>(null);
	let started = $state<string[]>([]);
	let rated = $state<Rating | null>(null);
	let voiceOn = $state(false);
	let voiceNote = $state('');
	let listener: ReturnType<typeof createListener> | null = null;
	let dialog: HTMLDialogElement;
	let guide = $state<{ slug: string; title: string; html: string | null; failed: boolean } | null>(
		null
	);
	const guideCache = new Map<string, string>();

	const done = $derived(index >= steps.length);
	/** The step as written for the servings being cooked. */
	const stepText = $derived(done ? '' : scaleStep(steps[index], factor));
	const segments = $derived(done ? [] : splitStep(stepText));
	const needed = $derived(done ? [] : stepLines(steps[index], lines, catalog.ingredientsById));
	const hasPantry = $derived(Object.keys(pantry.current).length > 0);
	const guideTitles = $derived(
		new Map([...catalog.wiki, ...guides].map((g) => [g.slug, g.title] as const))
	);
	const neededGuides = $derived(
		done
			? []
			: stepGuides(
					steps[index],
					needed,
					catalog.ingredientsById,
					guides.map((g) => g.slug)
				).flatMap((slug) => {
					const title = guideTitles.get(slug);
					return title ? [{ slug, title }] : [];
				})
	);

	async function loadGuide(slug: string): Promise<string> {
		const cached = guideCache.get(slug);
		if (cached !== undefined) return cached;
		const res = await fetch(`/wiki/${slug}/obsah.json`);
		if (!res.ok) throw new Error(`guide ${slug}: ${res.status}`);
		const { html } = (await res.json()) as { html: string };
		guideCache.set(slug, html);
		return html;
	}

	/** Opens a guide in a sheet, so the cook doesn't lose their place in the recipe. */
	async function openGuide(slug: string, title: string) {
		showAll = false;
		guide = { slug, title, html: guideCache.get(slug) ?? null, failed: false };
		if (guide.html !== null) return;
		try {
			const html = await loadGuide(slug);
			if (guide?.slug === slug) guide = { ...guide, html };
		} catch {
			if (guide?.slug === slug) guide = { ...guide, failed: true };
		}
	}

	function go(to: number) {
		const next = Math.max(0, Math.min(steps.length, to));
		direction = next >= index ? 1 : -1;
		index = next;
		showAll = false;
		guide = null;
	}

	function amount(line: RecipeLine) {
		return formatAmount(line.amount === null ? null : line.amount * factor, line.unit);
	}

	function timer(label: string, seconds: number, key: string) {
		startTimer(`${title} · ${label}`, recipeId, seconds);
		started = [...started, key];
	}

	function finish() {
		const result = markCooked(
			recipeId,
			variant,
			servings,
			lines,
			recipeServings,
			catalog.ingredientsById
		);
		cooked = result.used;
		cookUndo = result.undo;
	}

	let cookUndo: CookUndo | null = null;
	/** A mis-tap on "cooked": back to before it, the button shows again. */
	function uncook() {
		if (cookUndo) undoCooked(cookUndo);
		cookUndo = null;
		cooked = null;
		rated = null;
	}

	/** Reads the current step aloud; the mic pauses meanwhile so it doesn't hear itself. */
	function readStep() {
		const text = done
			? 'Hotovo. Dobrú chuť!'
			: `Krok ${index + 1}. ${stepText}${segments.some((s) => 'timer' in s) ? ' Povedz časovač a spustím ho.' : ''}`;
		listener?.pause();
		speak(text, () => listener?.resume());
	}

	function runCommand(command: VoiceCommand) {
		if (command === 'next') go(index + 1);
		else if (command === 'prev') go(index - 1);
		else if (command === 'repeat') readStep();
		else if (command === 'ingredients') showAll = !showAll;
		else if (command === 'stop') toggleVoice();
		else if (command === 'timer') {
			const i = segments.findIndex((s) => 'timer' in s);
			const segment = segments[i];
			if (segment && 'timer' in segment) {
				timer(segment.timer.label, segment.timer.seconds, `${index}:${i}`);
				listener?.pause();
				speak(`Časovač ${segment.timer.label} beží.`, () => listener?.resume());
			}
		}
	}

	function toggleVoice() {
		if (voiceOn) {
			voiceOn = false;
			listener?.stop();
			listener = null;
			speechSynthesis.cancel();
			return;
		}
		if (!speechSupported()) {
			voiceNote = 'Tento prehliadač nevie čítať nahlas.';
			return;
		}
		voiceOn = true;
		voiceNote = recognitionSupported()
			? 'Povedz „ďalej“, „späť“, „zopakuj“, „časovač“ alebo „suroviny“. Rozpoznávanie reči robí prehliadač (v Chrome cez Google).'
			: 'Tento prehliadač nevie počúvať povely, kroky ti len prečítam.';
		if (recognitionSupported()) {
			listener = createListener(runCommand, (reason) => {
				voiceNote = `${reason} Kroky ti aspoň prečítam.`;
				listener = null;
			});
			listener.start();
		}
		readStep();
	}

	$effect(() => {
		// Read each new step aloud while voice mode is on.
		void index;
		if (voiceOn) readStep();
	});

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowRight') go(index + 1);
		else if (event.key === 'ArrowLeft') go(index - 1);
	}

	/** Escape: close the ingredient sheet first, then cooking (through history, like Back). */
	function oncancel(event: Event) {
		event.preventDefault();
		if (guide) guide = null;
		else if (showAll) showAll = false;
		else onclose();
	}

	let swipeStart: { x: number; y: number } | null = null;
	function onpointerdown(event: PointerEvent) {
		if (event.pointerType !== 'mouse') swipeStart = { x: event.clientX, y: event.clientY };
	}
	function onpointerup(event: PointerEvent) {
		if (!swipeStart) return;
		const dx = event.clientX - swipeStart.x;
		const dy = event.clientY - swipeStart.y;
		swipeStart = null;
		if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(index + (dx < 0 ? 1 : -1));
	}

	onMount(() => {
		// A modal <dialog> sits in the top layer, above the sticky header and any stacking context.
		dialog.showModal();

		// Fetch every guide the recipe's steps link now, while there's signal – the service
		// worker keeps them, so they open in a cellar kitchen too.
		const slugs = new Set(
			steps.flatMap((step) =>
				stepGuides(
					step,
					stepLines(step, lines, catalog.ingredientsById),
					catalog.ingredientsById,
					guides.map((g) => g.slug)
				)
			)
		);
		for (const slug of slugs) loadGuide(slug).catch(() => {});

		// Keep the screen on while cooking; the lock drops whenever the tab is hidden.
		let lock: WakeLockSentinel | null = null;
		async function acquire() {
			if (!('wakeLock' in navigator)) {
				screenLock = 'unsupported';
				return;
			}
			try {
				lock = await navigator.wakeLock.request('screen');
				screenLock = 'on';
				lock.addEventListener('release', () => (screenLock = 'off'));
			} catch {
				screenLock = 'off';
			}
		}
		function onvisible() {
			if (document.visibilityState === 'visible') void acquire();
		}
		void acquire();
		document.addEventListener('visibilitychange', onvisible);

		const overflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			listener?.stop();
			if (speechSupported()) speechSynthesis.cancel();
			document.removeEventListener('visibilitychange', onvisible);
			void lock?.release();
			document.body.style.overflow = overflow;
		};
	});
</script>

<dialog class="cook" bind:this={dialog} {onkeydown} {oncancel} aria-label="Varenie: {title}">
	<header>
		<button class="icon-btn" onclick={onclose} aria-label="Zavrieť varenie">
			<Icon name="x" size={20} />
		</button>
		<div class="head-text">
			<strong>{title}</strong>
			<span class="muted">
				{servings}
				{servings === 1 ? 'porcia' : servings < 5 ? 'porcie' : 'porcií'}
				{#if screenLock === 'on'}· <Icon name="sun" size={13} /> displej nezhasne{/if}
			</span>
		</div>
		<div class="head-btns">
			<button
				class="icon-btn"
				class:on={voiceOn}
				onclick={toggleVoice}
				aria-pressed={voiceOn}
				aria-label="Hlasové ovládanie"
				title="Čítať kroky nahlas a počúvať povely"
			>
				<Icon name="mic" size={20} />
			</button>
			<button
				class="icon-btn"
				class:on={showAll}
				onclick={() => {
					guide = null;
					showAll = !showAll;
				}}
				aria-label="Všetky suroviny"
				aria-expanded={showAll}
			>
				<Icon name="basket" size={20} />
			</button>
		</div>
	</header>
	{#if voiceNote}
		<p class="voice-note" role="status">{voiceNote}</p>
	{/if}

	<nav class="progress" aria-label="Kroky">
		{#each steps as _, i (i)}
			<button
				class:past={i < index}
				class:current={i === index}
				onclick={() => go(i)}
				aria-label="Krok {i + 1}"
				aria-current={i === index ? 'step' : undefined}
			></button>
		{/each}
	</nav>

	<main {onpointerdown} {onpointerup}>
		{#key index}
			<section class="slide" style:--dir={direction}>
				{#if !done}
					<CookScene activity={stepActivity(steps[index])} />
					<p class="num">Krok {index + 1} <span class="muted">/ {steps.length}</span></p>
					<p class="text">
						{#each segments as segment, i (i)}
							{#if 'timer' in segment}
								{@const key = `${index}:${i}`}
								<button
									class="timer-chip"
									class:started={started.includes(key)}
									onclick={() => timer(segment.timer.label, segment.timer.seconds, key)}
									aria-label="Spustiť časovač {segment.timer.label}"
								>
									<Icon name={started.includes(key) ? 'check' : 'play'} size={16} />
									{segment.text}
								</button>
							{:else}{segment.text}{/if}
						{/each}
					</p>
					{#if needed.length}
						<ul class="need" aria-label="Suroviny v tomto kroku">
							{#each needed as line, lineIndex (lineIndex)}
								<li>
									<strong>{amount(line)}</strong>
									{catalog.ingredientsById.get(line.ingredientId)?.name}
								</li>
							{/each}
						</ul>
					{/if}
					{#if neededGuides.length}
						<div class="guides" aria-label="Ako na to">
							{#each neededGuides as g (g.slug)}
								<button class="guide-chip" onclick={() => openGuide(g.slug, g.title)}>
									<Icon name="book" size={16} />
									{g.title}
								</button>
							{/each}
						</div>
					{/if}
				{:else}
					<div class="finish">
						<p class="big">Dobrú chuť!</p>
						{#if cooked === null}
							<p class="muted">
								{hasPantry
									? 'Zapíšem to do histórie a odpočítam suroviny zo špajze. Ak bol recept v pláne, ubudne aj odtiaľ.'
									: 'Zapíšem to do histórie. Ak bol recept v pláne, ubudne aj odtiaľ.'}
							</p>
							<button class="btn leaf" onclick={finish}>
								<Icon name="check" size={18} /> Uvarené
							</button>
						{:else}
							<p>
								<Icon name="check" size={18} /> Zapísané do histórie.
								<button class="btn ghost small" onclick={uncook}>Späť – ešte nie je uvarené</button>
							</p>
							<div class="rate" role="group" aria-label="Ako chutilo?">
								<span>Ako chutilo?</span>
								{#each [3, 2, 1] as const as r (r)}
									<button
										class="chip"
										aria-pressed={rated === r}
										onclick={() => {
											rated = r;
											rateLastCooked(recipeId, r);
										}}
									>
										{RATING_LABELS[r]}
									</button>
								{/each}
							</div>
							{#if rated === 1}
								<p class="muted">
									Čo zmeniť nabudúce? Zapíš si to do poznámok pod postupom receptu.
								</p>
							{/if}
							<RecipeFeedback {recipeId} />
							{#if cooked.length}
								<ul class="used">
									{#each cooked as use (use.ingredient.id)}
										<li>
											{use.ingredient.name}: −{formatGrams(use.grams)}
											{#if use.usedUp}<span class="muted">(minulo sa)</span>{/if}
										</li>
									{/each}
								</ul>
							{/if}
						{/if}
					</div>
				{/if}
			</section>
		{/key}
	</main>

	<div class="timers"><TimerDock /></div>

	<footer>
		<button class="btn ghost" onclick={() => go(index - 1)} disabled={index === 0}>
			<Icon name="arrow-left" size={18} /> Späť
		</button>
		{#if !done}
			<button class="btn leaf" onclick={() => go(index + 1)}>
				{index === steps.length - 1 ? 'Hotovo' : 'Ďalej'}
				<Icon name="arrow-right" size={18} />
			</button>
		{:else}
			<!-- Same spot as "Hotovo", so a double tap doesn't jump back a step. -->
			<button class="btn ghost" onclick={onclose}>Zavrieť <Icon name="x" size={18} /></button>
		{/if}
	</footer>

	{#if guide}
		<aside class="sheet guide" aria-label={guide.title}>
			<div class="guide-head">
				<h2>{guide.title}</h2>
				<button class="icon-btn" onclick={() => (guide = null)} aria-label="Zavrieť návod">
					<Icon name="x" size={20} />
				</button>
			</div>
			{#if guide.html !== null}
				<div class="prose">
					<!-- eslint-disable-next-line svelte/no-at-html-tags -- markdown from the repo's own content/ -->
					{@html guide.html}
				</div>
				<a class="guide-full" href="/wiki/{guide.slug}" target="_blank" rel="noopener">
					Otvoriť návod na samostatnej stránke
				</a>
			{:else if guide.failed}
				<p class="muted">Návod sa nepodarilo načítať. Si offline?</p>
			{:else}
				<p class="muted">Načítavam…</p>
			{/if}
		</aside>
	{/if}

	{#if showAll}
		<aside class="sheet" aria-label="Všetky suroviny">
			<h2>Suroviny <span class="muted">· {servings} porc.</span></h2>
			<ul>
				{#each lines as line, i (i)}
					{@const piece = catalog.ingredientsById.get(line.ingredientId)?.piece}
					<li class:now={needed.includes(line)}>
						<strong>{amount(line)}</strong>
						<span>
							{catalog.ingredientsById.get(line.ingredientId)?.name}
							{#if piece && line.grams && line.unit !== 'g'}<small
									>{formatPiece(line.grams * factor, piece)}</small
								>{/if}
							{#if line.note}<small>{line.note}</small>{/if}
						</span>
					</li>
				{/each}
			</ul>
			{#if tools.length}
				<h2 class="tools-title">Náradie</h2>
				<p class="tools">{tools.join(' · ')}</p>
			{/if}
		</aside>
	{/if}
</dialog>

<style>
	.cook {
		position: fixed;
		inset: 0;
		width: 100%;
		height: 100%;
		max-width: none;
		max-height: none;
		margin: 0;
		border: 0;
		display: flex;
		flex-direction: column;
		background: var(--paper);
		color: var(--ink);
		padding: env(safe-area-inset-top) 0 env(safe-area-inset-bottom);
		animation: rise 0.3s var(--ease-out);
	}
	header {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: 12px;
		padding: 12px 16px 8px;
	}
	.head-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
		text-align: center;
	}
	.head-text strong {
		font-family: var(--font-display);
		font-size: 1.1rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.head-text span {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 4px;
		font-size: 0.8rem;
	}
	.head-btns {
		display: flex;
		gap: 6px;
	}
	.voice-note {
		margin: 0 16px 6px;
		font-size: 0.8rem;
		color: var(--muted);
		text-align: center;
	}
	.icon-btn.on {
		background: var(--leaf);
		color: var(--paper);
	}
	.progress {
		display: flex;
		gap: 4px;
		padding: 0 16px;
	}
	.progress button {
		flex: 1;
		height: 6px;
		border: 0;
		padding: 0;
		border-radius: 3px;
		background: var(--line);
		transition: background 0.3s;
	}
	.progress button.past {
		background: var(--leaf-2);
	}
	.progress button.current {
		background: var(--leaf);
	}
	main {
		flex: 1;
		min-height: 0;
		position: relative;
		overflow-y: auto;
		overflow-x: hidden;
		touch-action: pan-y;
	}
	.slide {
		max-width: 760px;
		margin: 0 auto;
		padding: 28px 20px 20px;
		animation: slide 0.35s var(--ease-out);
	}
	@keyframes slide {
		from {
			opacity: 0;
			transform: translateX(calc(var(--dir) * 40px));
		}
	}
	.num {
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 1rem;
		color: var(--leaf);
		margin: 0 0 12px;
	}
	.text {
		font-size: clamp(1.4rem, 5.2vw, 2.1rem);
		line-height: 1.45;
		margin: 0;
	}
	.timer-chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 0.05em 0.5em;
		margin: 0 0.1em;
		border: 0;
		border-radius: 12px;
		background: var(--turmeric-soft);
		color: inherit;
		font: inherit;
		font-weight: 700;
		vertical-align: baseline;
		transition: transform 0.25s var(--ease-spring);
	}
	.timer-chip:active {
		transform: scale(0.95);
	}
	.timer-chip.started {
		background: var(--leaf-soft);
	}
	.need {
		list-style: none;
		margin: 24px 0 0;
		padding: 14px 16px;
		display: grid;
		gap: 6px;
		border-radius: var(--radius-sm);
		background: var(--card);
		border: 1px solid var(--line);
		font-size: 1.1rem;
	}
	.need strong {
		display: inline-block;
		min-width: 5.5em;
		color: var(--leaf);
	}
	.finish {
		display: grid;
		gap: 16px;
		justify-items: start;
	}
	.big {
		font-family: var(--font-display);
		font-size: 2.4rem;
		font-weight: 700;
		margin: 0;
	}
	.finish p {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0;
	}
	.rate {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}
	.rate span {
		font-weight: 650;
		margin-right: 4px;
	}
	.used {
		margin: 0;
		padding-left: 1.2em;
	}
	.timers {
		padding: 0 16px;
		max-width: 760px;
		width: 100%;
		margin: 0 auto;
	}
	footer {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		padding: 12px 16px 16px;
		max-width: 760px;
		width: 100%;
		margin: 0 auto;
	}
	footer .btn {
		flex: 1;
		justify-content: center;
		padding: 0.95em 1.2em;
		font-size: 1.05rem;
	}
	.sheet {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		max-width: 760px;
		margin: 0 auto;
		max-height: 75%;
		overflow-y: auto;
		padding: 20px 20px calc(24px + env(safe-area-inset-bottom));
		background: var(--card);
		border-radius: var(--radius) var(--radius) 0 0;
		box-shadow: var(--shadow-lift);
		animation: sheet 0.3s var(--ease-out);
	}
	@keyframes sheet {
		from {
			transform: translateY(100%);
		}
	}
	.guides {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 16px;
	}
	.guide-chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 8px 12px;
		border: 0;
		border-radius: 12px;
		background: var(--leaf-soft);
		color: var(--leaf);
		font: inherit;
		font-size: 0.9rem;
		font-weight: 600;
	}
	.guide-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
	}
	.sheet.guide {
		max-height: 85%;
	}
	.guide-full {
		display: inline-block;
		margin-top: 12px;
		font-weight: 600;
	}
	.sheet h2 {
		font-size: 1.3rem;
		margin: 0 0 10px;
	}
	.sheet > ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.sheet > ul > li {
		display: grid;
		grid-template-columns: 6em 1fr;
		gap: 10px;
		padding: 8px 6px;
		border-bottom: 1px dashed var(--line);
		border-radius: 8px;
	}
	.sheet > ul > li.now {
		background: var(--leaf-soft);
	}
	.sheet .tools-title {
		margin-top: 18px;
	}
	.tools {
		margin: 0;
		color: var(--ink-2);
	}
	.sheet > ul strong {
		color: var(--leaf);
	}
	.sheet > ul small {
		display: block;
		color: var(--muted);
	}
	@media (prefers-reduced-motion: reduce) {
		.slide,
		.sheet,
		.cook {
			animation: none;
		}
	}
</style>
