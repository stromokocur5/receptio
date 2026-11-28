<script lang="ts">
	import { formatEur, formatNumber } from '$lib/amounts';
	import { useCatalog } from '$lib/catalog';
	import { MEAL_LABELS, normalizeSearch, searchMatcher } from '$lib/labels';
	import { addToPlan, servingsInPlan, ui } from '$lib/state.svelte';
	import { MEALS, type Meal } from '$lib/types';
	import Icon from './Icon.svelte';
	import PlateArt from './PlateArt.svelte';
	import { vesselFor } from '$lib/categories';

	const catalog = useCatalog();

	let query = $state('');
	let meal = $state<Meal | ''>('');
	let glutenFree = $state(false);
	let justAdded = $state<string | null>(null);

	const searchIndex = $derived(
		new Map(
			catalog.recipes.map((r) => [
				r.id,
				normalizeSearch(
					[
						r.title,
						catalog.cuisinesById.get(r.cuisine)?.name ?? '',
						...r.lines.map((l) => catalog.ingredientsById.get(l.ingredientId)?.name ?? '')
					].join(' ')
				)
			])
		)
	);

	const results = $derived.by(() => {
		const matchesQuery = searchMatcher([...searchIndex.values()], query);
		return catalog.recipes.filter(
			(r) =>
				matchesQuery(searchIndex.get(r.id)!) &&
				(!meal || r.meals.includes(meal)) &&
				(!glutenFree || r.gluten !== 'contains' || r.gfSwappable)
		);
	});

	/** 450 plates at once made the plan page ~24 000 elements; show a page at a time. */
	const PAGE = 30;
	let limit = $state(PAGE);
	const shown = $derived(results.slice(0, limit));
	$effect(() => {
		void query;
		void meal;
		void glutenFree;
		limit = PAGE;
	});

	function add(recipeId: string, servings: number) {
		addToPlan(recipeId, servings);
		justAdded = recipeId;
		setTimeout(() => {
			if (justAdded === recipeId) justAdded = null;
		}, 1400);
	}
</script>

<div class="picker">
	<div class="field">
		<Icon name="search" size={18} />
		<label for="picker-q" class="sr-only">Hľadať recept na pridanie</label>
		<input
			id="picker-q"
			type="search"
			bind:value={query}
			placeholder="Pridaj recept – hľadaj názov, surovinu…"
		/>
	</div>

	<div class="chips" role="group" aria-label="Filter">
		<button class="chip" aria-pressed={meal === ''} onclick={() => (meal = '')}>Všetko</button>
		{#each MEALS as m (m)}
			<button class="chip" aria-pressed={meal === m} onclick={() => (meal = meal === m ? '' : m)}>
				{MEAL_LABELS[m]}
			</button>
		{/each}
		<button class="chip" aria-pressed={glutenFree} onclick={() => (glutenFree = !glutenFree)}>
			<Icon name="wheat-off" size={14} /> Bezlepkové
		</button>
	</div>

	<ul class="results" aria-live="polite">
		{#each shown as r (r.id)}
			{@const inPlan = ui.loaded ? servingsInPlan(r.id) : 0}
			<li>
				<div class="thumb">
					<PlateArt
						seed={r.id}
						lines={r.lines}
						byId={catalog.ingredientsById}
						vessel={vesselFor(r.categories)}
						animate={false}
					/>
				</div>
				<div class="info">
					<a href="/recepty/{r.id}">{r.title}</a>
					<span class="meta">
						{r.time} min · {formatEur(r.costPerServing)}/porcia{r.showNutrition
							? ` · ${formatNumber(r.perServing.protein, 0)} g bielkovín`
							: ''}
						{#if inPlan}<span class="in">· v pláne {inPlan}×</span>{/if}
					</span>
				</div>
				<button
					class="add"
					class:done={justAdded === r.id}
					aria-label="Pridať {r.title} do plánu ({r.servings} porcie)"
					onclick={() => add(r.id, r.servings)}
				>
					<Icon name={justAdded === r.id ? 'check' : 'plus'} size={18} stroke={2.2} />
				</button>
			</li>
		{:else}
			<li class="none muted">Nič sa nenašlo.</li>
		{/each}
	</ul>
	{#if results.length > shown.length}
		<button class="btn ghost small more" onclick={() => (limit += PAGE)}>
			Ďalšie recepty ({results.length - shown.length})
		</button>
	{/if}
	<p class="hint">
		{results.length} receptov · pridá sa celý recept, porcie upravíš v zozname.
	</p>
</div>

<style>
	.picker {
		display: grid;
		gap: 10px;
	}
	.more {
		justify-self: center;
	}
	.results {
		list-style: none;
		margin: 0;
		padding: 4px;
		max-height: 330px;
		overflow: auto;
		border-radius: var(--radius-sm);
		background: var(--sunk);
	}
	.results li {
		display: grid;
		grid-template-columns: 40px minmax(0, 1fr) auto;
		align-items: center;
		gap: 10px;
		padding: 6px 8px;
		border-radius: var(--radius-xs);
	}
	.results li:hover {
		background: var(--card);
	}
	.thumb {
		width: 40px;
	}
	.info {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.info a {
		color: var(--ink);
		font-weight: 650;
		font-size: var(--fs-md);
		text-decoration: none;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.info a:hover {
		text-decoration: underline;
	}
	.meta {
		font-size: var(--fs-xs);
		color: var(--muted);
	}
	.in {
		color: var(--leaf);
		font-weight: 700;
	}
	.add {
		display: grid;
		place-items: center;
		width: 38px;
		height: 38px;
		border: 0;
		border-radius: 50%;
		background: var(--leaf);
		color: var(--paper);
		transition:
			transform 0.25s var(--ease-spring),
			background 0.2s;
	}
	.add:hover {
		transform: scale(1.1) rotate(90deg);
	}
	.add.done {
		background: var(--turmeric);
		transform: scale(1.15);
	}
	@media (pointer: coarse) {
		.add {
			width: var(--tap);
			height: var(--tap);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.add,
		.add:hover,
		.add.done {
			transition: none;
			transform: none;
		}
	}
	.none {
		display: block !important;
		padding: var(--sp-3);
		text-align: center;
	}
	.hint {
		margin: 0;
	}
</style>
