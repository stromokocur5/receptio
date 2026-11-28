<script lang="ts">
	import { useCatalog } from '$lib/catalog';
	import Icon from '$lib/components/Icon.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import { CATEGORY_ICONS } from '$lib/ingredient-icons';
	import { CATEGORY_LABELS, ingredientSearchText, pluralRecipes, searchMatcher } from '$lib/labels';
	import { INGREDIENT_CATEGORIES } from '$lib/types';

	const catalog = useCatalog();
	const month = new Date().getMonth() + 1;

	let q = $state('');
	let onlySeason = $state(false);
	let onlyHomemade = $state(false);

	const recipeCount = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const r of catalog.recipes) {
			for (const id of new Set(r.lines.map((l) => l.ingredientId))) {
				counts.set(id, (counts.get(id) ?? 0) + 1);
			}
		}
		return counts;
	});

	const ingredientNames = catalog.ingredients.map(ingredientSearchText);

	const groups = $derived.by(() => {
		const matchesName = searchMatcher(ingredientNames, q);
		const visible = catalog.ingredients
			.filter((i) => i.id !== 'voda')
			.filter((i) => matchesName(ingredientSearchText(i)))
			.filter((i) => !onlySeason || i.season.includes(month))
			.filter((i) => !onlyHomemade || i.homemade)
			.sort((a, b) => a.name.localeCompare(b.name, 'sk'));
		return INGREDIENT_CATEGORIES.map(
			(c) => [c, visible.filter((i) => i.category === c)] as const
		).filter(([, list]) => list.length);
	});
</script>

<Seo
	title="Suroviny"
	description="Všetko o surovinách: ako vybrať dobrú, ako ju skladovať, čím ju nahradiť a čo z nej uvariť."
/>

<div class="wrap page">
	<header class="rise">
		<p class="eyebrow">Objavuj</p>
		<h1>Čo je čo</h1>
		<p class="lede">
			Všetky suroviny z receptov – aké druhy existujú, ako vybrať, ako skladovať, čím nahradiť a
			kedy sú v sezóne.
		</p>
	</header>

	<div class="tools" role="group" aria-label="Hľadať a filtrovať">
		<label class="field search">
			<Icon name="search" size={20} />
			<span class="sr-only">Hľadať surovinu</span>
			<input type="search" bind:value={q} placeholder="Cícer, tahini, kaleráb…" />
		</label>
		<button class="chip" aria-pressed={onlySeason} onclick={() => (onlySeason = !onlySeason)}>
			<Icon name="leaf" size={14} /> Práve v sezóne
		</button>
		<button class="chip" aria-pressed={onlyHomemade} onclick={() => (onlyHomemade = !onlyHomemade)}>
			<Icon name="chef" size={14} /> Dá sa urobiť doma
		</button>
	</div>

	{#each groups as [category, list] (category)}
		<section class="cat">
			<h2 class="section-title">
				<Icon name={CATEGORY_ICONS[category]} size={22} />
				{CATEGORY_LABELS[category]}
			</h2>
			<ul>
				{#each list as i (i.id)}
					<li>
						<a href="/suroviny/{i.id}" class="item draw-host" style:--c={i.color}>
							<span class="swatch" aria-hidden="true"></span>
							<span class="name">{i.name}</span>
							{#if i.season.includes(month)}<span class="season" title="Práve v sezóne"
									><Icon name="leaf" size={14} /></span
								>{/if}
							<span class="count muted"
								>{recipeCount.get(i.id) ?? 0} {pluralRecipes(recipeCount.get(i.id) ?? 0)}</span
							>
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{:else}
		<div class="empty">
			<Icon name="search" size={28} />
			<p>Takú surovinu nemáme. Skús iné slovo alebo vypni filtre.</p>
		</div>
	{/each}
</div>

<style>
	.tools {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sp-3);
		margin: var(--sp-2) 0 var(--sp-3);
	}
	.search {
		flex: 1;
		min-width: 240px;
		max-width: 480px;
	}
	.cat {
		margin-top: var(--sp-6);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: 6px;
	}
	.item {
		/* Same height across a row, even when a long name wraps. */
		height: 100%;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 9px 12px;
		border-radius: var(--radius-sm);
		background: var(--card);
		border: 1px solid var(--line);
		color: var(--ink);
		text-decoration: none;
		font-weight: 600;
		transition:
			transform 0.25s var(--ease-spring),
			border-color 0.2s;
	}
	.item:hover {
		transform: translateY(-2px);
		border-color: var(--c);
	}
	.item .swatch {
		width: 14px;
		height: 14px;
	}
	.name {
		flex: 1;
		min-width: 0;
		line-height: 1.3;
	}
	.season {
		display: inline-flex;
		color: var(--leaf);
	}
	.count {
		font-size: var(--fs-xs);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
</style>
