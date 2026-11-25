<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { formatAmount, formatMinutes } from '$lib/amounts';
	import { findDish, useCatalog } from '$lib/catalog';
	import { scaleStep, splitStep } from '$lib/cooking';
	import Icon from '$lib/components/Icon.svelte';
	import BuiltPlate from '$lib/components/BuiltPlate.svelte';
	import { placeParts } from '$lib/plate-art';
	import TimelineChart, { laneColor } from '$lib/components/TimelineChart.svelte';
	import KitchenScene from '$lib/components/KitchenScene.svelte';
	import TimerDock from '$lib/components/TimerDock.svelte';
	import { APPLIANCE_LABELS, buildFromParams, buildToParams, type Build } from '$lib/dish';
	import { consumeFromPantry } from '$lib/pantry';
	import { composePlate } from '$lib/plate';
	import { kitchen, pantry, plan, removeFromPlan, ui } from '$lib/state.svelte';
	import type { TimedStep } from '$lib/timeline';
	import { startTimer } from '$lib/timers.svelte';
	import { toast } from '$lib/toast.svelte';

	const catalog = useCatalog();
	const dish = $derived(findDish(catalog(), page.params.id!)!);

	let build = $state<Build>({ servings: 2, choice: {}, methods: {} });
	let ready = $state(false);
	/** When cooking started (ms), null before the start screen is left. */
	let startedAt = $state<number | null>(null);
	let done = $state<number[]>([]);
	let now = $state(Date.now());

	const storageKey = $derived(`receptio:varim:${dish.id}`);
	const query = $derived(buildToParams(dish, build).toString());

	onMount(() => {
		build = buildFromParams(dish, new URLSearchParams(location.search), catalog().partsById);
		try {
			const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
			// Picking up where the phone went to sleep, only for the same plate and the same day.
			if (
				saved?.query === buildToParams(dish, build).toString() &&
				typeof saved.startedAt === 'number' &&
				Date.now() - saved.startedAt < 6 * 3600_000 &&
				Array.isArray(saved.done)
			) {
				startedAt = saved.startedAt;
				done = saved.done.filter((n: unknown) => Number.isInteger(n));
			}
		} catch {
			// Nothing worth resuming.
		}
		ready = true;
		const clock = setInterval(() => (now = Date.now()), 15_000);
		return () => clearInterval(clock);
	});

	$effect(() => {
		if (!ready) return;
		try {
			if (startedAt === null) localStorage.removeItem(storageKey);
			else localStorage.setItem(storageKey, JSON.stringify({ query, startedAt, done }));
		} catch {
			// Storage blocked: progress lasts until the tab closes.
		}
	});

	// The screen stays on while cooking; phones dim it after half a minute otherwise.
	$effect(() => {
		if (startedAt === null || !('wakeLock' in navigator)) return;
		let lock: WakeLockSentinel | undefined;
		const acquire = () =>
			navigator.wakeLock
				.request('screen')
				.then((l) => (lock = l))
				.catch(() => {});
		const onVisible = () => document.visibilityState === 'visible' && acquire();
		void acquire();
		document.addEventListener('visibilitychange', onVisible);
		return () => {
			document.removeEventListener('visibilitychange', onVisible);
			void lock?.release();
		};
	});

	const plate = $derived(
		composePlate(dish, build, kitchen.current, catalog().partsById, catalog().ingredientsById)
	);
	const steps = $derived(plate.timeline.steps);
	const laneOf = (step: TimedStep) => plate.parts.findIndex((p) => p.part.id === step.partId);
	const colorOf = (step: TimedStep) =>
		step.partId === null ? 'var(--ink-2)' : laneColor(laneOf(step));
	function textOf(step: TimedStep): string {
		const part = step.partId ? catalog().partsById.get(step.partId) : undefined;
		return part ? scaleStep(step.text, build.servings / part.servings) : step.text;
	}

	const currentIndex = $derived(steps.findIndex((_, i) => !done.includes(i)));
	const current = $derived(currentIndex >= 0 ? steps[currentIndex] : undefined);
	const upcoming = $derived(
		steps
			.map((s, i) => ({ s, i }))
			.filter(({ i }) => i !== currentIndex && !done.includes(i))
			.slice(0, 3)
	);
	const finished = $derived(ready && startedAt !== null && currentIndex === -1);
	const elapsed = $derived(startedAt === null ? 0 : Math.max(0, (now - startedAt) / 60_000));
	const servedAt = $derived(
		new Date((startedAt ?? now) + plate.timeline.total * 60_000).toLocaleTimeString('sk-SK', {
			hour: '2-digit',
			minute: '2-digit'
		})
	);
	/** Behind the plan by more than a few minutes: worth saying, not worth nagging about. */
	const lateBy = $derived(current && startedAt !== null ? Math.round(elapsed - current.start) : 0);

	const lanes = $derived([
		...plate.parts.map(({ part }) => ({ id: part.id, name: part.name })),
		...(dish.finish.length ? [{ id: null, name: 'Na tanier' }] : [])
	]);
	const backHref = $derived(`/jedlo/${dish.id}${query ? `?${query}` : ''}`);

	function start() {
		startedAt = Date.now();
		now = startedAt;
		done = [];
	}

	function complete(index: number) {
		done = [...done, index];
	}

	/** A step that cooks on its own: time it and go on with the next thing. */
	function timeAndContinue(index: number) {
		const step = steps[index];
		startTimer(
			`${step.partName}: ${step.text.split(/[.–]/)[0].slice(0, 40)}`,
			dish.id,
			(step.end - step.start) * 60
		);
		complete(index);
	}

	function undo() {
		done = done.slice(0, -1);
	}

	function restart() {
		startedAt = null;
		done = [];
	}

	const planned = $derived(
		ui.loaded ? plan.current.find((p) => p.dish === dish.id && p.query === query) : undefined
	);
	function crossOff() {
		if (!planned) return;
		const before = plan.current;
		removeFromPlan(planned.id);
		toast('Odškrtnuté z týždňa', () => (plan.current = before));
	}

	let usedUp = $state(false);
	function takeFromPantry() {
		const { pantry: next, used } = consumeFromPantry(
			pantry.current,
			plate.lines,
			1,
			catalog().ingredientsById
		);
		pantry.current = next;
		usedUp = true;
		toast(
			used.length
				? `Zo špajze ubudlo ${used.length} ${used.length === 1 ? 'vec' : used.length < 5 ? 'veci' : 'vecí'}`
				: 'V špajzi nebolo nič odvážené'
		);
	}
</script>

<svelte:head>
	<title>Varím: {plate.name} – Receptio</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="cook">
	<header class="bar">
		<a class="icon-btn plain" href={backHref} aria-label="Späť na jedlo"
			><Icon name="x" size={22} /></a
		>
		<div class="title">
			<strong>{plate.name}</strong>
			<span class="muted">
				{build.servings}
				{build.servings === 1 ? 'porcia' : build.servings < 5 ? 'porcie' : 'porcií'} · {formatMinutes(
					plate.timeline.total
				)}{startedAt !== null ? ` · na stole asi o ${servedAt}` : ''}
			</span>
		</div>
		{#if startedAt !== null}
			<button
				class="icon-btn plain"
				onclick={undo}
				disabled={!done.length}
				aria-label="Vrátiť posledný krok"
			>
				<Icon name="undo" size={20} />
			</button>
		{/if}
	</header>

	{#if startedAt !== null && !finished}
		<div class="progress" aria-hidden="true">
			<span style:width="{(done.length / steps.length) * 100}%"></span>
		</div>
	{/if}

	<div class="wrap body">
		{#if !ready}
			<p class="muted">Načítavam…</p>
		{:else if startedAt === null}
			<section class="intro">
				<div class="intro-plate">
					<BuiltPlate filled={placeParts(plate.parts)} byId={catalog().ingredientsById} />
				</div>
				<h1>Priprav si</h1>
				{#if plate.ahead.length}
					<div class="notice warn">
						<Icon name="calendar" size={18} />
						<div>
							<strong>Malo byť spravené deň vopred</strong>
							{#each plate.ahead as a (a.part)}<p>{a.part}: {a.text}</p>{/each}
						</div>
					</div>
				{/if}
				<ul class="mise">
					{#each plate.lines.filter((l) => l.ingredientId !== 'voda') as line (`${line.ingredientId}${line.unit}${line.notEaten}`)}
						{@const ingredient = catalog().ingredientsById.get(line.ingredientId)!}
						<li>
							<span class="swatch" style:--c={ingredient.color}></span>
							<span>{ingredient.name}</span>
							<span class="amount">{formatAmount(line.amount, line.unit)}</span>
						</li>
					{/each}
				</ul>
				<p class="hint">
					Kroky idú v poradí, v akom ich robíš – aj keď sa varí viac vecí naraz. Keď sa niečo varí
					samo, spustíš časovač a ideš ďalej.
				</p>
				<button class="btn leaf start" onclick={start}
					><Icon name="play" size={20} /> Začať variť</button
				>
			</section>
		{:else if finished}
			<section class="end">
				<div class="intro-plate">
					<BuiltPlate filled={placeParts(plate.parts)} byId={catalog().ingredientsById} />
				</div>
				<h1>Dobrú chuť!</h1>
				<p class="lede">Hotovo za {formatMinutes(Math.round(elapsed))}.</p>
				<div class="end-actions">
					{#if ui.loaded && Object.keys(pantry.current).length && !usedUp}
						<button class="btn leaf" onclick={takeFromPantry}>
							<Icon name="jar" size={18} /> Odpočítať suroviny zo špajze
						</button>
					{/if}
					{#if planned}
						<button class="btn leaf" onclick={crossOff}>
							<Icon name="calendar" size={18} /> Odškrtnúť z týždňa
						</button>
					{/if}
					<a class="btn ghost" href="/"><Icon name="pot" size={18} /> Čo ďalej</a>
					<button class="btn-link" onclick={restart}>Variť znova</button>
				</div>
			</section>
		{:else if current}
			{@const segments = splitStep(textOf(current))}
			{#if steps.some((s) => s.on === 'platna' || s.on === 'rura')}
				<KitchenScene
					{steps}
					at={current.start}
					burners={kitchen.current.burners}
					oven={kitchen.current.tools.includes('rura') && steps.some((s) => s.on === 'rura')}
					{colorOf}
				/>
			{/if}
			<section class="now-card card" style:--c={colorOf(current)}>
				<p class="who">
					<span class="dot"></span>
					{current.partName}
					{#if current.on}<span class="badge"
							>{APPLIANCE_LABELS[current.on]}{current.temp ? ` ${current.temp} °C` : ''}</span
						>{/if}
					{#if current.free}<span class="badge sky">ruky voľné</span>{/if}
				</p>
				{#key currentIndex}
					<p class="step-text">
						{#each segments as seg, i (i)}
							{#if 'timer' in seg}
								<button
									class="inline-timer"
									onclick={() =>
										startTimer(`${current.partName}: ${seg.text}`, dish.id, seg.timer.seconds)}
								>
									<Icon name="timer" size={16} />{seg.text}
								</button>
							{:else}{seg.text}{/if}
						{/each}
					</p>
				{/key}
				<div class="actions">
					{#if current.free && current.end - current.start >= 3}
						<button class="btn leaf big" onclick={() => timeAndContinue(currentIndex)}>
							<Icon name="timer" size={20} /> Časovač {current.end - current.start} min a ďalej
						</button>
						<button class="btn ghost" onclick={() => complete(currentIndex)}>Bez časovača</button>
					{:else}
						<button class="btn leaf big" onclick={() => complete(currentIndex)}>
							<Icon name="check" size={20} /> Hotovo
						</button>
					{/if}
				</div>
				{#if lateBy >= 5}
					<p class="hint">Si asi {lateBy} min za plánom – nevadí, len jedlo bude neskôr.</p>
				{/if}
			</section>

			<TimerDock />

			{#if upcoming.length}
				<section class="next">
					<h2 class="eyebrow">Potom</h2>
					<ol>
						{#each upcoming as { s, i } (i)}
							<li style:--c={colorOf(s)}>
								<span class="dot"></span>
								<span>
									<strong>{s.partName}</strong>
									<span class="muted">{textOf(s)}</span>
								</span>
							</li>
						{/each}
					</ol>
				</section>
			{/if}

			<details class="disclosure whole">
				<summary>Celý plán</summary>
				<TimelineChart timeline={plate.timeline} {lanes} now={elapsed} />
			</details>
		{/if}
	</div>
</div>

<style>
	.cook {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
	}
	.bar {
		position: sticky;
		top: 0;
		z-index: 10;
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--sp-2) var(--gutter);
		background: color-mix(in srgb, var(--paper) 94%, transparent);
		backdrop-filter: blur(14px);
		border-bottom: 1px solid var(--line);
	}
	.title {
		display: grid;
		flex: 1;
		min-width: 0;
	}
	.title strong {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.title .muted {
		font-size: var(--fs-sm);
	}
	.progress {
		height: 4px;
		background: var(--line);
	}
	.progress span {
		display: block;
		height: 100%;
		background: var(--leaf);
		transition: width 0.5s var(--ease-out);
	}
	.body {
		display: grid;
		gap: var(--sp-4);
		align-content: start;
		max-width: 720px;
		padding-top: var(--sp-5);
		padding-bottom: var(--sp-7);
	}
	.intro,
	.end {
		display: grid;
		gap: var(--sp-3);
		justify-items: start;
	}
	.end {
		justify-items: center;
		text-align: center;
	}
	.intro-plate {
		justify-self: center;
		width: min(220px, 60vw);
	}
	.intro h1,
	.end h1 {
		margin: 0;
	}
	.mise {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr));
		gap: 0 var(--sp-4);
		width: 100%;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.mise li {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--sp-2) 0;
		border-bottom: 1px dashed var(--line);
	}
	.amount {
		font-weight: 650;
		white-space: nowrap;
	}
	.start {
		justify-self: stretch;
		justify-content: center;
		padding: 1em;
		font-size: var(--fs-lg);
	}
	.end-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--sp-2);
	}
	.now-card {
		display: grid;
		gap: var(--sp-3);
		padding: var(--sp-5);
		border-top: 6px solid var(--c);
	}
	.who {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sp-2);
		margin: 0;
		font-weight: 700;
	}
	.dot {
		width: 12px;
		height: 12px;
		flex: none;
		border-radius: 50%;
		background: var(--c);
	}
	.step-text {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(1.35rem, 4.6vw, 1.75rem);
		line-height: 1.35;
		animation: slide 0.45s var(--ease-out);
	}
	@keyframes slide {
		from {
			opacity: 0;
			transform: translateX(16px);
		}
	}
	.inline-timer {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 0 0.35em;
		border: 0;
		border-radius: 8px;
		background: var(--sky-soft);
		color: var(--ink);
		font: inherit;
		cursor: pointer;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}
	.big {
		flex: 1 1 220px;
		justify-content: center;
		padding: 0.95em 1.2em;
		font-size: var(--fs-base);
	}
	.next ol {
		display: grid;
		gap: var(--sp-2);
		margin: var(--sp-2) 0 0;
		padding: 0;
		list-style: none;
	}
	.next li {
		display: grid;
		grid-template-columns: auto 1fr;
		align-items: start;
		gap: var(--sp-2);
		font-size: var(--fs-sm);
	}
	.next .dot {
		margin-top: 4px;
	}
	.next strong {
		display: block;
	}
	.whole :global(.chart) {
		margin-top: var(--sp-3);
	}
	@media (prefers-reduced-motion: reduce) {
		.step-text {
			animation: none;
		}
	}
</style>
