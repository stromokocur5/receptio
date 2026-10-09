<script lang="ts">
	import { formatEur } from '$lib/amounts';
	import { useCatalog } from '$lib/catalog';
	import { vesselFor } from '$lib/categories';
	import Icon from '$lib/components/Icon.svelte';
	import PlateArt from '$lib/components/PlateArt.svelte';
	import { householdFilter, wishesOf } from '$lib/household';
	import { household, members, setWish, tableNeeds } from '$lib/household.svelte';
	import { localToday } from '$lib/journal';
	import { recipeSeason } from '$lib/season';
	import { addToPlan, plan, swiped } from '$lib/state.svelte';
	import { swipeDeck } from '$lib/swipe';
	import type { RecipeSummary } from '$lib/types';

	/**
	 * "Čo budeme jesť?" – recipes one card at a time, swiped right (would eat it) or left (not
	 * now). What everyone in the household swiped right on is a match, one tap from the plan.
	 */
	let { open = $bindable(false) }: { open?: boolean } = $props();

	const catalog = useCatalog();
	const THROW = 90;

	let dialog = $state<HTMLDialogElement>();
	/** Fixed when opened, so the cards don't reshuffle as the others' swipes arrive. */
	let deck = $state<RecipeSummary[]>([]);
	let at = $state(0);
	let history = $state<{ id: string; yes: boolean }[]>([]);
	let dx = $state(0);
	let dragging = $state(false);
	let leaving = $state<'left' | 'right' | null>(null);
	let match = $state<{ recipe: RecipeSummary; names: string[] } | null>(null);
	let start = 0;
	let startTime = 0;

	const card = $derived(deck[at]);
	const behind = $derived(deck[at + 1]);
	const wishes = $derived(household.doc ? wishesOf(household.doc, members()) : new Map());
	const othersFor = (id: string) =>
		(wishes.get(id) ?? []).filter((m: { id: string }) => m.id !== household.me);

	function build() {
		const needs = tableNeeds();
		const fits = needs ? householdFilter(needs, catalog.ingredientsById) : () => true;
		const month = new Date().getMonth() + 1;
		deck = swipeDeck(
			catalog.recipes.filter((r) => vesselFor(r.categories) === 'plate' && fits(r)),
			wishes,
			household.me ?? '',
			swiped.current,
			new Set(plan.current.map((e) => e.recipeId)),
			localToday(),
			(r) => recipeSeason(r, catalog.ingredientsById, month).inSeason
		);
		at = 0;
		history = [];
	}

	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) {
			build();
			dialog.showModal();
		} else if (!open && dialog.open) dialog.close();
	});

	function decide(yes: boolean) {
		const recipe = card;
		if (!recipe || leaving) return;
		leaving = yes ? 'right' : 'left';
		navigator.vibrate?.(8);
		swiped.current = { ...swiped.current, [recipe.id]: yes ? 'yes' : 'no' };
		if (yes) setWish(recipe.id, true);
		history = [...history, { id: recipe.id, yes }];
		// Everyone else already wants it: that's a match.
		const everyone = members();
		const others = othersFor(recipe.id);
		if (yes && everyone.length > 1 && others.length === everyone.length - 1) {
			match = { recipe, names: others.map((m: { name: string }) => m.name) };
		}
		setTimeout(() => {
			at++;
			dx = 0;
			leaving = null;
		}, 220);
	}

	function undo() {
		const last = history.at(-1);
		if (!last || leaving) return;
		history = history.slice(0, -1);
		const { [last.id]: _, ...rest } = swiped.current;
		swiped.current = rest;
		if (last.yes) setWish(last.id, false);
		at = Math.max(0, at - 1);
	}

	function restart() {
		// What you said yes to stays a wish; the "not now"s get another chance.
		swiped.current = Object.fromEntries(
			Object.entries(swiped.current).filter(([, v]) => v === 'yes')
		);
		build();
	}

	function onpointerdown(e: PointerEvent) {
		if (leaving || (e.target as HTMLElement).closest('button, a')) return;
		dragging = true;
		start = e.clientX;
		startTime = performance.now();
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}
	function onpointermove(e: PointerEvent) {
		if (dragging) dx = e.clientX - start;
	}
	function onpointerup() {
		if (!dragging) return;
		dragging = false;
		// A quick flick counts as much as a long drag.
		const speed = Math.abs(dx) / Math.max(1, performance.now() - startTime);
		if (Math.abs(dx) > THROW || (Math.abs(dx) > 30 && speed > 0.6)) decide(dx > 0);
		else dx = 0;
	}
	function onkeydown(e: KeyboardEvent) {
		if (match) return;
		if (e.key === 'ArrowRight') decide(true);
		else if (e.key === 'ArrowLeft') decide(false);
		else if (e.key === 'Backspace') undo();
	}

	function planMatch() {
		if (!match) return;
		addToPlan(match.recipe.id, match.recipe.servings);
		match = null;
	}
</script>

<dialog
	class="swipe"
	bind:this={dialog}
	{onkeydown}
	onclose={() => (open = false)}
	aria-label="Čo budeme jesť?"
>
	<header>
		<h2>Čo budeme jesť?</h2>
		<button class="icon-btn" aria-label="Zavrieť" onclick={() => (open = false)}>
			<Icon name="x" size={22} />
		</button>
	</header>
	<p class="muted hint">Doprava „chcem“, doľava „teraz nie“. Čo chcete všetci, je zhoda.</p>

	<div class="stack">
		{#if card}
			{#if behind}
				<article class="card-face back" aria-hidden="true">
					<div class="art">
						<PlateArt
							seed={behind.id}
							lines={behind.lines}
							byId={catalog.ingredientsById}
							animate={false}
						/>
					</div>
				</article>
			{/if}
			{#key card.id}
				{@const others = othersFor(card.id)}
				<article
					class="card-face"
					class:dragging
					class:leave-left={leaving === 'left'}
					class:leave-right={leaving === 'right'}
					style:--dx="{dx}px"
					{onpointerdown}
					{onpointermove}
					{onpointerup}
					onpointercancel={onpointerup}
					aria-live="polite"
				>
					<span class="stamp yes" style:opacity={Math.max(0, Math.min(1, dx / THROW))}>Chcem</span>
					<span class="stamp no" style:opacity={Math.max(0, Math.min(1, -dx / THROW))}
						>Teraz nie</span
					>
					<div class="art">
						<PlateArt
							seed={card.id}
							lines={card.lines}
							byId={catalog.ingredientsById}
							animate={false}
						/>
					</div>
					<div class="body">
						{#if others.length}
							<p class="wanted">
								<Icon name="heart" size={15} />
								Chce to aj {others.map((m: { name: string }) => m.name).join(', ')}
							</p>
						{/if}
						<h3>{card.title}</h3>
						<p class="meta">
							<span><Icon name="clock" size={15} /> {card.time} min</span>
							<span>{formatEur(card.costPerServing)} / porcia</span>
						</p>
						<p class="desc">{card.description}</p>
						<a class="more" href="/recepty/{card.id}" target="_blank" rel="noopener">Celý recept</a>
					</div>
				</article>
			{/key}
		{:else}
			<div class="done">
				<Icon name="check" size={32} />
				<p><strong>To sú všetky recepty.</strong></p>
				<p class="muted">Čo si chcel, ostáva ako želanie. Tie „teraz nie“ môžeš prejsť znova.</p>
				<button class="btn" onclick={restart}>Prejsť znova</button>
			</div>
		{/if}
	</div>

	{#if card}
		<div class="actions">
			<button class="round no" aria-label="Teraz nie" onclick={() => decide(false)}>
				<Icon name="x" size={28} />
			</button>
			<button class="round undo" aria-label="Späť" disabled={!history.length} onclick={undo}>
				<Icon name="undo" size={20} />
			</button>
			<button class="round yes" aria-label="Chcem" onclick={() => decide(true)}>
				<Icon name="heart" size={28} />
			</button>
		</div>
	{/if}

	{#if match}
		<div class="match" role="alertdialog" aria-labelledby="match-title">
			<p class="eyebrow">Zhoda!</p>
			<h3 id="match-title">{match.recipe.title}</h3>
			<div class="match-art">
				<PlateArt
					seed={match.recipe.id}
					lines={match.recipe.lines}
					byId={catalog.ingredientsById}
				/>
			</div>
			<p>Chceš to ty aj {match.names.join(', ')}.</p>
			<button class="btn leaf wide" onclick={planMatch}>
				<Icon name="calendar" size={18} /> Do plánu
			</button>
			<button class="btn ghost wide" onclick={() => (match = null)}>Ťahať ďalej</button>
		</div>
	{/if}
</dialog>

<style>
	.swipe {
		width: min(440px, 100vw);
		max-width: 100vw;
		height: min(760px, 100dvh);
		max-height: 100dvh;
		margin: auto;
		padding: 16px;
		border: 0;
		border-radius: 24px;
		background: var(--paper);
		color: var(--ink);
		overflow: hidden;
	}
	.swipe[open] {
		display: flex;
		flex-direction: column;
	}
	.swipe::backdrop {
		background: rgb(0 0 0 / 0.55);
	}
	@media (max-width: 480px) {
		.swipe {
			border-radius: 0;
			height: 100dvh;
		}
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	header h2 {
		margin: 0;
		font-size: 1.4rem;
	}
	.icon-btn {
		border: 0;
		background: none;
		color: inherit;
		padding: 8px;
		cursor: pointer;
	}
	.hint {
		margin: 4px 0 12px;
		font-size: 0.86rem;
	}
	.stack {
		position: relative;
		flex: 1;
		min-height: 0;
	}
	.card-face {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		border: 1px solid var(--line);
		border-radius: 22px;
		background: var(--card);
		box-shadow: var(--shadow-lift);
		overflow: hidden;
		touch-action: pan-y;
		user-select: none;
		transform: translateX(var(--dx)) rotate(calc(var(--dx) / 22));
		transition: transform 0.22s ease;
		cursor: grab;
	}
	.card-face.dragging {
		transition: none;
		cursor: grabbing;
	}
	.card-face.leave-right {
		transform: translateX(130%) rotate(18deg);
	}
	.card-face.leave-left {
		transform: translateX(-130%) rotate(-18deg);
	}
	.card-face.back {
		transform: scale(0.95) translateY(10px);
		opacity: 0.7;
		transition: none;
	}
	.art {
		flex: 1;
		min-height: 0;
		display: grid;
		place-items: center;
		padding: 16px;
		background: color-mix(in srgb, var(--leaf) 8%, transparent);
	}
	.art :global(svg) {
		max-height: 100%;
		width: auto;
		max-width: 80%;
	}
	.body {
		padding: 16px 18px 18px;
	}
	.body h3 {
		margin: 0 0 6px;
		font-size: 1.35rem;
	}
	.wanted {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin: 0 0 8px;
		padding: 4px 10px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--tomato) 15%, transparent);
		color: var(--tomato);
		font-weight: 600;
		font-size: 0.86rem;
	}
	.meta {
		display: flex;
		gap: 14px;
		margin: 0 0 8px;
		color: var(--muted);
		font-size: 0.9rem;
	}
	.meta span {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
	.desc {
		margin: 0 0 8px;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
		font-size: 0.92rem;
	}
	.more {
		font-size: 0.86rem;
	}
	.stamp {
		position: absolute;
		top: 22px;
		z-index: 1;
		padding: 6px 12px;
		border: 3px solid currentColor;
		border-radius: 10px;
		font-weight: 800;
		font-size: 1.1rem;
		text-transform: uppercase;
		pointer-events: none;
	}
	.stamp.yes {
		left: 18px;
		color: var(--leaf);
		transform: rotate(-12deg);
	}
	.stamp.no {
		right: 18px;
		color: var(--tomato);
		transform: rotate(12deg);
	}
	.actions {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 22px;
		padding: 16px 0 4px;
	}
	.round {
		display: grid;
		place-items: center;
		width: 64px;
		height: 64px;
		border: 1px solid var(--line);
		border-radius: 50%;
		background: var(--paper);
		box-shadow: 0 4px 14px rgb(0 0 0 / 0.12);
		cursor: pointer;
	}
	.round.no {
		color: var(--tomato);
	}
	.round.yes {
		color: var(--leaf);
	}
	.round.undo {
		width: 46px;
		height: 46px;
		color: var(--muted);
	}
	.round:disabled {
		opacity: 0.4;
	}
	.done {
		display: grid;
		justify-items: center;
		gap: 6px;
		padding-top: 30%;
		text-align: center;
	}
	.match {
		position: absolute;
		inset: 0;
		z-index: 2;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 10px;
		padding: 24px;
		background: var(--paper);
		text-align: center;
		animation: pop 0.35s ease;
	}
	.match .eyebrow {
		margin: 0;
		color: var(--tomato);
		font-size: 1.6rem;
		font-weight: 800;
	}
	.match h3 {
		margin: 0;
		font-size: 1.5rem;
	}
	.match-art {
		width: 180px;
	}
	@keyframes pop {
		from {
			transform: scale(0.9);
			opacity: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.card-face,
		.match {
			transition: none;
			animation: none;
		}
	}
</style>
