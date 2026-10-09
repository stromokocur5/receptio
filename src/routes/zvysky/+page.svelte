<script lang="ts">
	import { onMount } from 'svelte';
	import { avoidFilter } from '$lib/avoid';
	import { avoid, ui } from '$lib/state.svelte';
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
	/** What is most often left over, to start with one tap instead of typing. */
	const COMMON = [
		'ryza-basmati',
		'cestoviny',
		'zemiaky',
		'cuketa',
		'mrkva',
		'spenat',
		'brokolica',
		'paprika-cervena',
		'cicer-sterilizovany',
		'tofu-natural',
		'chlieb'
	];
	const common = $derived(
		COMMON.flatMap((id) => catalog.ingredientsById.get(id) ?? []).filter(
			(i) => !chosen.includes(i.id)
		)
	);

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
					ui.loaded
						? catalog.recipes.filter(avoidFilter(avoid.current, catalog.ingredientsById))
						: catalog.recipes,
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
	/** A long shopping list in a card hides the point: the first few, then how many more. */
	function shortList(items: { name: string }[], max = 4): string {
		// Lower case, as in the middle of a sentence – the same as "Chýba: …" on the card.
		const names = items.map((i) => i.name.split(' (')[0].toLowerCase());
		const rest = names.length - max;
		if (rest < 1) return names.join(', ');
		const more = rest === 1 ? 'ďalšia' : rest < 5 ? 'ďalšie' : 'ďalších';
		return `${names.slice(0, max).join(', ')} + ${rest} ${more}`;
	}

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
	description="Pol cukety, ryža zo včera, zvyšok cíceru? Zadaj, čo treba minúť, a nájdeš recept, ktorý to spotrebuje."
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
				placeholder={chosen.length >= MAX_CHOSEN
					? `Najviac ${MAX_CHOSEN} surovín`
					: 'Cuketa, ryža, cícer…'}
				disabled={chosen.length >= MAX_CHOSEN}
				onkeydown={(e) => {
					if (e.key === 'Enter' && suggestions[0]) add(suggestions[0].id);
				}}
			/>
		</label>
		{#if suggestions.length}
			<ul class="chips suggest" aria-label="Návrhy">
				{#each suggestions as i (i.id)}
					<li>
						<button class="chip" onclick={() => add(i.id)}>
							<span class="swatch" style:--c={i.color}></span>{i.name}
						</button>
					</li>
				{/each}
			</ul>
		{:else if !chosen.length && !q.trim()}
			<div class="starters">
				<p class="hint">Často ostáva:</p>
				<ul class="chips suggest">
					{#each common as i (i.id)}
						<li>
							<button class="chip" onclick={() => add(i.id)}>
								<span class="swatch" style:--c={i.color}></span>{i.name.split(' (')[0]}
							</button>
						</li>
					{/each}
				</ul>
			</div>
		{/if}
		{#if chosen.length}
			<div class="chips">
				{#each chosen as id (id)}
					<button class="chip on" onclick={() => remove(id)} aria-label="Odobrať {nameOf(id)}">
						{nameOf(id).split(' (')[0]}
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
					<RecipeCard recipe={m.recipe} index={i}>
						<p class="why">
							<strong>Minie:</strong>
							{shortList(m.uses, 5)}
						</p>
						{#if m.others.length}
							<p class="why">
								<strong>Ešte treba:</strong>
								{shortList(m.others)}
							</p>
						{:else}
							<p class="why ok">Nič ďalšie netreba.</p>
						{/if}
					</RecipeCard>
				{/each}
			{:else}
				<p class="empty">Žiadny recept tieto suroviny nepoužíva. Skús inú.</p>
			{/if}
		</section>
	{/if}
</div>

<style>
	.picker {
		position: relative;
		padding: 16px;
		display: grid;
		gap: 10px;
		max-width: 640px;
	}
	.suggest {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.starters .hint {
		margin: 0 0 var(--sp-2);
	}
	.results {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
		gap: 18px;
		margin-top: 24px;
	}
	.results .empty {
		grid-column: 1 / -1;
	}
	.why {
		margin: 0;
		line-height: 1.4;
	}
	.why + .why {
		margin-top: 2px;
	}
	.ok {
		color: var(--leaf);
		font-weight: 650;
	}
</style>
