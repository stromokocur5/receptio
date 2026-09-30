<script lang="ts">
	import { onMount } from 'svelte';
	import { avoidFilter } from '$lib/avoid';
	import { avoid } from '$lib/state.svelte';
	import { useCatalog } from '$lib/catalog';
	import Icon from '$lib/components/Icon.svelte';
	import RecipeCard from '$lib/components/RecipeCard.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import { ingredientSearchText, searchMatcher } from '$lib/labels';
	import { isAssumedAtHome, rankByLeftovers } from '$lib/pantry';

	const catalog = useCatalog();
	const MAX_CHOSEN = 5;
	const SHOWN = 12;

	let q = $state('');
	let chosen = $state<string[]>([]);

	const ingredientNames = catalog.ingredients.map(ingredientSearchText);

	const suggestions = $derived.by(() => {
		if (!q.trim()) return [];
		const matchesName = searchMatcher(ingredientNames, q);
		return catalog.ingredients
			.filter((i) => !isAssumedAtHome(i) && !chosen.includes(i.id) && i.id !== 'voda')
			.filter((i) => matchesName(ingredientSearchText(i)))
			.slice(0, 8);
	});
	const matches = $derived(
		chosen.length
			? rankByLeftovers(
					catalog.recipes.filter(avoidFilter(avoid.current, catalog.ingredientsById)),
					chosen,
					catalog.ingredientsById
				).slice(0, SHOWN)
			: []
	);

	function add(id: string) {
		if (chosen.length < MAX_CHOSEN) chosen = [...chosen, id];
		q = '';
	}
	function remove(id: string) {
		chosen = chosen.filter((c) => c !== id);
	}
	const nameOf = (id: string) => catalog.ingredientsById.get(id)?.name ?? id;

	// Špajza links here with what should be used up soon: /zvysky?s=spenat,tofu-natural.
	onMount(() => {
		const ids = (new URLSearchParams(location.search).get('s') ?? '')
			.split(',')
			.filter((id) => catalog.ingredientsById.has(id));
		chosen = [...new Set(ids)].slice(0, MAX_CHOSEN);
	});
</script>

<Seo
	title="Čo uvariť zo zvyškov"
	description="Pol cukety, ryža zo včera, zvyšok cíceru? Zadaj, čo treba minúť, a nájdeme recept, ktorý to spotrebuje."
/>

<div class="wrap page">
	<header class="rise">
		<p class="eyebrow">Nič nevyhodiť</p>
		<h1>Čo uvariť zo zvyškov</h1>
		<p class="lede">
			Vyber 1 až {MAX_CHOSEN} vecí, ktoré treba minúť. Hore budú recepty, ktoré ich použijú čo najviac
			a potrebujú čo najmenej ďalšieho. Na celú špajzu je <a href="/spajza">Špajza</a>.
		</p>
	</header>

	<div class="picker card">
		<label class="field">
			<Icon name="search" size={20} />
			<span class="sr-only">Pridať surovinu</span>
			<input
				type="search"
				bind:value={q}
				placeholder={chosen.length >= MAX_CHOSEN ? 'Viac už netreba' : 'Cuketa, ryža, cícer…'}
				disabled={chosen.length >= MAX_CHOSEN}
				onkeydown={(e) => {
					if (e.key === 'Enter' && suggestions[0]) add(suggestions[0].id);
				}}
			/>
		</label>
		{#if suggestions.length}
			<ul class="suggest">
				{#each suggestions as i (i.id)}
					<li>
						<button onclick={() => add(i.id)} style:--c={i.color}>
							<span class="dot"></span>{i.name}
						</button>
					</li>
				{/each}
			</ul>
		{/if}
		{#if chosen.length}
			<div class="chosen">
				{#each chosen as id (id)}
					<button class="chip on" onclick={() => remove(id)} aria-label="Odobrať {nameOf(id)}">
						{nameOf(id)}
						<Icon name="x" size={12} stroke={2.4} />
					</button>
				{/each}
			</div>
		{/if}
	</div>

	{#if chosen.length}
		<section class="results">
			{#if matches.length}
				{#each matches as m, i (m.recipe.id)}
					<div class="match">
						<RecipeCard recipe={m.recipe} index={i} />
						<p class="why">
							<strong>Použije:</strong>
							{m.uses.map((u) => u.name).join(', ')}
							{#if m.others.length}
								<br /><span class="muted">Ešte treba: {m.others.map((o) => o.name).join(', ')}</span
								>
							{:else}
								<br /><span class="ok">Nič ďalšie netreba.</span>
							{/if}
						</p>
					</div>
				{/each}
			{:else}
				<p class="muted">Žiadny recept tieto suroviny nepoužíva.</p>
			{/if}
		</section>
	{/if}
</div>

<style>
	.page {
		padding-top: 28px;
	}
	.lede {
		color: var(--ink-2);
		max-width: 44em;
	}
	.picker {
		position: relative;
		padding: 16px;
		display: grid;
		gap: 10px;
		max-width: 640px;
	}
	.suggest {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.suggest button {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		border-radius: 999px;
		border: 1.5px solid var(--line);
		background: var(--paper);
		color: var(--ink);
		font-weight: 600;
	}
	.dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--c);
	}
	.chosen {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.results {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
		gap: 18px;
		margin-top: 24px;
	}
	.match {
		display: grid;
		gap: 8px;
		align-content: start;
	}
	.why {
		margin: 0;
		font-size: 0.86rem;
	}
	.ok {
		color: var(--leaf);
		font-weight: 650;
	}
</style>
