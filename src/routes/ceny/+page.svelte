<script lang="ts">
	import { formatEur, formatGrams, formatNumber } from '$lib/amounts';
	import { useCatalog } from '$lib/catalog';
	import Icon from '$lib/components/Icon.svelte';
	import { CATEGORY_LABELS, normalizeSearch } from '$lib/labels';
	import { proteinEnergyShare } from '$lib/nutrition';
	import {
		BULK_PACK_GRAMS,
		STALE_AFTER_DAYS,
		ageInDays,
		bestPrice,
		isSaleActive,
		isStale,
		pricePerKg
	} from '$lib/pricing';
	import { INGREDIENT_CATEGORIES, type IngredientCategory } from '$lib/types';

	const catalog = useCatalog();
	const today = new Date();

	let search = $state('');
	let category = $state<IngredientCategory | ''>('');

	const rows = $derived(
		catalog.ingredients
			.filter((i) => i.id !== 'voda')
			.filter((i) => !category || i.category === category)
			.filter((i) => normalizeSearch(i.name).includes(normalizeSearch(search.trim())))
			.map((ingredient) => ({
				ingredient,
				best: bestPrice(ingredient, catalog.prices, today),
				entries: catalog.prices
					.filter((p) => p.ingredientId === ingredient.id)
					.sort((a, b) => pricePerKg(a) - pricePerKg(b))
			}))
			.sort((a, b) => a.ingredient.name.localeCompare(b.ingredient.name, 'sk'))
	);

	const proteinPerEuro = $derived(
		catalog.ingredients
			// Protein must be a meaningful share of energy, otherwise cheap starches (flour) top the chart.
			// Protein must be a meaningful share of energy, otherwise cheap starches (flour) top the chart;
			// free leftovers (okara, aquafaba) would divide by ~0.
			.filter(
				(i) => !i.byproduct && i.category !== 'koreniny' && proteinEnergyShare(i.per100g) >= 0.15
			)
			.map((i) => {
				const best = bestPrice(i, catalog.prices, today);
				return { ingredient: i, best, gramsPerEuro: (i.per100g.protein * 10) / best.perKg };
			})
			.sort((a, b) => b.gramsPerEuro - a.gramsPerEuro)
			.slice(0, 10)
	);
	const maxProtein = $derived(Math.max(...proteinPerEuro.map((p) => p.gramsPerEuro)));

	const bulk = $derived(catalog.prices.filter((p) => p.packGrams >= BULK_PACK_GRAMS));
	const realCount = $derived(catalog.prices.length);
</script>

<svelte:head><title>Ceny · Receptio</title></svelte:head>

<div class="wrap page">
	<header class="rise">
		<p class="eyebrow">Ceny</p>
		<h1>Čo koľko stojí</h1>
		<p class="lede">
			Ceny porovnávame vždy za kilogram, takže veľké balenie a malé vrecúško sa dajú férovo
			porovnať. Reálne ceny majú obchod a dátum, bežná cena po {STALE_AFTER_DAYS} dňoch zastará. Kde reálnu
			cenu ešte nemáme, ukážeme <span class="badge">odhad</span>.
		</p>
		<p class="muted small">
			{realCount
				? `${realCount} cien z ${catalog.stores.length} obchodov.`
				: 'Reálne ceny z obchodov sa zatiaľ zbierajú, všetko nižšie je hrubý odhad.'}
		</p>
	</header>

	<section class="card box ppe">
		<h2><Icon name="bean" size={24} /> Najviac bielkovín za euro</h2>
		<p class="muted small">
			Gramy bielkovín, ktoré dostaneš za 1 €. Počítané zo suchej váhy, len potraviny, kde bielkoviny
			tvoria aspoň 15 % energie.
		</p>
		<ol>
			{#each proteinPerEuro as p, i (p.ingredient.id)}
				<li style:--w="{(p.gramsPerEuro / maxProtein) * 100}%" style:--i={i}>
					<span class="nm">{p.ingredient.name}</span>
					<span class="bar"><span></span></span>
					<strong>{formatNumber(p.gramsPerEuro, 0)} g</strong>
				</li>
			{/each}
		</ol>
	</section>

	<section class="table-section">
		<div class="filters">
			<div class="field grow">
				<Icon name="search" size={20} />
				<label for="price-q" class="sr-only">Hľadať surovinu</label>
				<input id="price-q" type="search" bind:value={search} placeholder="Hľadať surovinu…" />
			</div>
			<label class="field">
				<span class="sr-only">Kategória</span>
				<select bind:value={category}>
					<option value="">Všetky kategórie</option>
					{#each INGREDIENT_CATEGORIES as c (c)}<option value={c}>{CATEGORY_LABELS[c]}</option
						>{/each}
				</select>
			</label>
		</div>

		<ul class="rows">
			{#each rows as { ingredient, best, entries } (ingredient.id)}
				<li class="row card">
					<div class="main">
						<span class="dot" style:background={ingredient.color}></span>
						<div>
							<strong>{ingredient.name}</strong>
							<span class="muted small">{CATEGORY_LABELS[ingredient.category]}</span>
						</div>
						<div class="best">
							{#if ingredient.byproduct}
								<span class="badge leaf">zvyšok – zadarmo</span>
							{:else}
								{formatEur(best.perKg)}<small>/kg</small>
							{/if}
							{#if ingredient.byproduct}
								<!-- a leftover has no price to label -->
							{:else if best.isEstimate}
								<span class="badge">odhad</span>
							{:else}
								<span class="badge leaf">{catalog.storesById.get(best.storeId!)?.name}</span>
							{/if}
						</div>
					</div>
					{#if entries.length}
						<ul class="entries">
							{#each entries as e, i (i)}
								{@const store = catalog.storesById.get(e.storeId)}
								{@const stale = e.saleUntil ? !isSaleActive(e, today) : isStale(e, today)}
								<li class:stale>
									<span class="sdot" style:background={store?.color}></span>
									<span class="store">{store?.name}</span>
									<span class="prod"
										>{e.product} · {formatGrams(e.packGrams)} za {formatEur(e.price)}</span
									>
									<span class="kg">{formatEur(pricePerKg(e))}/kg</span>
									<span class="tags">
										{#if e.saleUntil && !stale}<span class="badge tomato sticker"
												>akcia do {new Date(e.saleUntil).toLocaleDateString('sk-SK')}</span
											>{/if}
										{#if e.packGrams >= BULK_PACK_GRAMS}<span class="badge sky"
												><Icon name="package" size={12} /> veľké</span
											>{/if}
										{#if stale}<span class="badge">stará · {ageInDays(e.date, today)} dní</span
											>{/if}
									</span>
								</li>
							{/each}
						</ul>
					{/if}
				</li>
			{/each}
		</ul>
	</section>

	{#if bulk.length}
		<section class="card box">
			<h2><Icon name="package" size={24} /> Veľké balenia</h2>
			<ul class="bulk">
				{#each bulk as e, i (i)}
					<li>
						<strong>{catalog.ingredientsById.get(e.ingredientId)?.name}</strong>
						{e.product}, {formatGrams(e.packGrams)} · {catalog.storesById.get(e.storeId)?.name} ·
						{formatEur(pricePerKg(e))}/kg
						{#if e.url}<a href={e.url} rel="noopener noreferrer" target="_blank"
								>odkaz <Icon name="external" size={14} /></a
							>{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<details class="card box how">
		<summary><Icon name="info" size={20} /> Ako sa pridávajú ceny</summary>
		<p>
			Ceny sú v súbore <code>content/prices.yaml</code>, každý záznam je konkrétny produkt v
			konkrétnom obchode a dni. Stačí poslať fotku cenovky alebo letáku a doplníme ich.
		</p>
		<pre><code
				>- ingredient: sosovica-cervena
  store: lidl
  product: červená šošovica
  pack: 500 g
  price: 1.49
  date: 2026-09-20</code
			></pre>
	</details>
</div>

<style>
	.page {
		padding-top: 28px;
	}
	.lede {
		max-width: 46em;
		color: var(--ink-2);
	}
	.small {
		font-size: 0.85rem;
	}
	.box {
		padding: 20px;
		margin-top: 24px;
	}
	.box h2 {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 1.4rem;
		margin-bottom: 4px;
	}
	.ppe ol {
		list-style: none;
		padding: 0;
		margin: 14px 0 0;
		display: grid;
		gap: 8px;
	}
	.ppe li {
		display: grid;
		grid-template-columns: minmax(120px, 1.2fr) 2fr auto;
		gap: 12px;
		align-items: center;
		font-size: 0.92rem;
	}
	.bar {
		height: 12px;
		border-radius: 999px;
		background: var(--paper-2);
		overflow: hidden;
	}
	.bar span {
		display: block;
		height: 100%;
		width: var(--w);
		border-radius: inherit;
		background: linear-gradient(90deg, var(--turmeric), var(--tomato));
		transform-origin: left;
		animation: grow 0.9s var(--ease-out) both;
		animation-delay: calc(var(--i) * 50ms);
	}
	@keyframes grow {
		from {
			transform: scaleX(0);
		}
	}
	.ppe strong {
		font-variant-numeric: tabular-nums;
	}
	.table-section {
		margin-top: 32px;
	}
	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		margin-bottom: 14px;
	}
	.grow {
		flex: 1 1 240px;
	}
	.rows {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 8px;
	}
	.row {
		padding: 12px 16px;
		border-radius: var(--radius-sm);
	}
	.main {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		gap: 12px;
		align-items: center;
	}
	.main > div:nth-child(2) {
		display: flex;
		flex-direction: column;
	}
	.dot {
		width: 14px;
		height: 14px;
		border-radius: 45% 55% 50% 50%;
		box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12);
	}
	.best {
		display: flex;
		align-items: center;
		gap: 8px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.best small {
		font-weight: 500;
		color: var(--muted);
	}
	.entries {
		list-style: none;
		margin: 10px 0 0;
		padding: 0;
		display: grid;
		gap: 4px;
	}
	.entries li {
		display: grid;
		grid-template-columns: auto auto minmax(0, 1fr) auto;
		gap: 4px 10px;
		align-items: center;
		font-size: 0.86rem;
		padding: 6px 8px;
		border-radius: 8px;
		background: var(--paper);
	}
	.entries li.stale {
		opacity: 0.55;
	}
	.sdot {
		width: 10px;
		height: 10px;
		border-radius: 3px;
	}
	.store {
		font-weight: 700;
	}
	.prod {
		color: var(--ink-2);
	}
	.kg {
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.tags {
		grid-column: 2 / -1;
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}
	.tags:empty {
		display: none;
	}
	.bulk {
		padding-left: 1.2em;
	}
	.how summary {
		display: flex;
		align-items: center;
		gap: 8px;
		font-weight: 700;
		cursor: pointer;
	}
	.how pre {
		background: var(--paper);
		border-radius: 12px;
		padding: 14px;
		overflow-x: auto;
		font-size: 0.85rem;
	}
	code {
		font-size: 0.9em;
	}
</style>
