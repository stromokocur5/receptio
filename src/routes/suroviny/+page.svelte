<script lang="ts">
	import { useCatalog } from '$lib/catalog';
	import Icon from '$lib/components/Icon.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import { CATEGORY_ICONS } from '$lib/ingredient-icons';
	import { CATEGORY_LABELS, normalizeSearch } from '$lib/labels';
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

	const groups = $derived.by(() => {
		const term = normalizeSearch(q.trim());
		const visible = catalog.ingredients
			.filter((i) => i.id !== 'voda')
			.filter((i) => !term || normalizeSearch(i.name).includes(term))
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
	description="Encyklopédia surovín – druhy, ako vybrať, skladovanie, náhrady, sezóna a recepty."
/>

<div class="wrap page">
	<header class="rise">
		<p class="eyebrow">Wiki · Suroviny</p>
		<h1>Čo je čo</h1>
		<p class="lede">
			Všetky suroviny z receptov – aké druhy existujú, ako vybrať, ako skladovať, čím nahradiť a
			kedy sú v sezóne.
		</p>
	</header>

	<div class="tools">
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
			<h2><Icon name={CATEGORY_ICONS[category]} size={22} /> {CATEGORY_LABELS[category]}</h2>
			<ul>
				{#each list as i (i.id)}
					<li>
						<a href="/suroviny/{i.id}" class="item draw-host" style:--c={i.color}>
							<span class="dot" aria-hidden="true"></span>
							<span class="name">{i.name}</span>
							{#if i.season.includes(month)}<span class="season" title="Práve v sezóne"
									><Icon name="leaf" size={14} /></span
								>{/if}
							<span class="count muted">{recipeCount.get(i.id) ?? 0}</span>
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{:else}
		<p class="muted">Nič sa nenašlo.</p>
	{/each}
</div>

<style>
	.page {
		padding-top: 28px;
	}
	.lede {
		color: var(--ink-2);
		max-width: 44em;
	}
	.tools {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px;
		margin: 8px 0 12px;
	}
	.search {
		flex: 1;
		min-width: 240px;
		max-width: 480px;
	}
	.cat {
		margin-top: 28px;
	}
	.cat h2 {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 1.3rem;
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
		border-radius: 12px;
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
	.dot {
		flex: none;
		width: 14px;
		height: 14px;
		border-radius: 45% 55% 50% 50%;
		background: var(--c);
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
		font-size: 0.8rem;
		font-variant-numeric: tabular-nums;
	}
</style>
