<script lang="ts">
	import { onMount } from 'svelte';
	import { formatAmount, formatGrams } from '$lib/amounts';
	import { useCatalog } from '$lib/catalog';
	import { splitStep, stepLines } from '$lib/cooking';
	import Icon from '$lib/components/Icon.svelte';
	import TimerDock from '$lib/components/TimerDock.svelte';
	import type { PantryUse } from '$lib/pantry';
	import { markCooked, pantry } from '$lib/state.svelte';
	import { startTimer } from '$lib/timers.svelte';
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
	let dialog: HTMLDialogElement;

	const done = $derived(index >= steps.length);
	const segments = $derived(done ? [] : splitStep(steps[index]));
	const needed = $derived(done ? [] : stepLines(steps[index], lines, catalog.ingredientsById));
	const hasPantry = $derived(Object.keys(pantry.current).length > 0);

	function go(to: number) {
		const next = Math.max(0, Math.min(steps.length, to));
		direction = next >= index ? 1 : -1;
		index = next;
		showAll = false;
	}

	function amount(line: RecipeLine) {
		return formatAmount(line.amount === null ? null : line.amount * factor, line.unit);
	}

	function timer(label: string, seconds: number, key: string) {
		startTimer(`${title} · ${label}`, recipeId, seconds);
		started = [...started, key];
	}

	function finish() {
		cooked = markCooked(
			recipeId,
			variant,
			servings,
			lines,
			recipeServings,
			catalog.ingredientsById
		);
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowRight') go(index + 1);
		else if (event.key === 'ArrowLeft') go(index - 1);
	}

	/** Escape: close the ingredient sheet first, then cooking (through history, like Back). */
	function oncancel(event: Event) {
		event.preventDefault();
		if (showAll) showAll = false;
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
		<button
			class="icon-btn"
			class:on={showAll}
			onclick={() => (showAll = !showAll)}
			aria-label="Všetky suroviny"
			aria-expanded={showAll}
		>
			<Icon name="basket" size={20} />
		</button>
	</header>

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
							{#each needed as line (line.ingredientId)}
								<li>
									<strong>{amount(line)}</strong>
									{catalog.ingredientsById.get(line.ingredientId)?.name}
								</li>
							{/each}
						</ul>
					{/if}
				{:else}
					<div class="finish">
						<p class="big">Dobrú chuť!</p>
						{#if cooked === null}
							<p class="muted">
								{hasPantry
									? 'Zapíšem, že si to uvaril, a odpočítam suroviny zo špajze. Ak bol recept v pláne, ubudne aj odtiaľ.'
									: 'Zapíšem, že si to uvaril. Ak bol recept v pláne, ubudne aj odtiaľ.'}
							</p>
							<button class="btn leaf" onclick={finish}>
								<Icon name="check" size={18} /> Uvarené
							</button>
						{:else}
							<p><Icon name="check" size={18} /> Zapísané do histórie.</p>
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

	{#if showAll}
		<aside class="sheet" aria-label="Všetky suroviny">
			<h2>Suroviny <span class="muted">· {servings} porc.</span></h2>
			<ul>
				{#each lines as line, i (i)}
					<li class:now={needed.includes(line)}>
						<strong>{amount(line)}</strong>
						<span>
							{catalog.ingredientsById.get(line.ingredientId)?.name}
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
		display: grid;
		grid-template-rows: auto auto 1fr auto auto;
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
	.sheet h2 {
		font-size: 1.3rem;
		margin: 0 0 10px;
	}
	.sheet ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.sheet li {
		display: grid;
		grid-template-columns: 6em 1fr;
		gap: 10px;
		padding: 8px 6px;
		border-bottom: 1px dashed var(--line);
		border-radius: 8px;
	}
	.sheet li.now {
		background: var(--leaf-soft);
	}
	.sheet .tools-title {
		margin-top: 18px;
	}
	.tools {
		margin: 0;
		color: var(--ink-2);
	}
	.sheet strong {
		color: var(--leaf);
	}
	.sheet small {
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
