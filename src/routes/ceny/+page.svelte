<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import { formatEur, formatGrams, formatNumber } from '$lib/amounts';
	import { useCatalog } from '$lib/catalog';
	import Icon from '$lib/components/Icon.svelte';
	import { CATEGORY_LABELS, ingredientSearchText, searchMatcher } from '$lib/labels';
	import { proteinEnergyShare } from '$lib/nutrition';
	import {
		BULK_PACK_GRAMS,
		STALE_AFTER_DAYS,
		ageInDays,
		bestOnlinePrice,
		bestPrice,
		isSaleActive,
		isStale,
		pricePerKg
	} from '$lib/pricing';
	import { INGREDIENT_CATEGORIES, type IngredientCategory } from '$lib/types';

	const catalog = useCatalog();
	const today = new Date();

	const formatDate = (iso: string) =>
		new Date(iso).toLocaleDateString('sk-SK', { day: 'numeric', month: 'numeric' });

	let search = $state('');
	let category = $state<IngredientCategory | ''>('');
	/** The whole list is hundreds of rows; it opens a page at a time. */
	const PAGE = 30;
	let shown = $state(PAGE);
	$effect(() => {
		void search;
		void category;
		shown = PAGE;
	});

	const ingredientNames = catalog.ingredients.map(ingredientSearchText);
	const matchesName = $derived(searchMatcher(ingredientNames, search));
	const rows = $derived(
		catalog.ingredients
			.filter((i) => i.id !== 'voda')
			.filter((i) => !category || i.category === category)
			.filter((i) => matchesName(ingredientSearchText(i)))
			.map((ingredient) => ({
				ingredient,
				best: bestPrice(ingredient, catalog.prices, today),
				online: bestOnlinePrice(ingredient, catalog.prices, today),
				entries: catalog.prices
					.filter((p) => p.ingredientId === ingredient.id)
					.sort((a, b) => pricePerKg(a) - pricePerKg(b))
			}))
			.sort((a, b) => a.ingredient.name.localeCompare(b.ingredient.name, 'sk'))
	);

	const proteinPerEuro = $derived(
		catalog.ingredients
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

	/** How much of what recipes cost comes from real prices, weighted by cost. */
	const knownShare = $derived.by(() => {
		const total = catalog.recipes.reduce((sum, r) => sum + r.costPerServing, 0);
		const known = catalog.recipes.reduce((sum, r) => sum + r.costPerServing * r.costKnownShare, 0);
		return total ? known / total : 0;
	});
	/** Ingredients without a real price that weigh most in recipe costs – worth collecting next. */
	const missingPrices = $derived.by(() => {
		const weight = new Map<string, number>();
		for (const r of catalog.recipes) {
			for (const l of r.lines) {
				const i = catalog.ingredientsById.get(l.ingredientId);
				if (!i || i.byproduct || i.id === 'voda') continue;
				const best = bestPrice(i, catalog.prices, today);
				if (!best.isEstimate) continue;
				weight.set(i.id, (weight.get(i.id) ?? 0) + (best.perKg * l.grams) / 1000 / r.servings);
			}
		}
		return [...weight]
			.sort((a, b) => b[1] - a[1])
			.slice(0, 12)
			.map(([id]) => catalog.ingredientsById.get(id)!);
	});

	/** Big packs and e-shop prices next to what the same thing costs in a shop, best saving first. */
	const bulk = $derived(
		catalog.prices
			.filter((p) => (p.online || p.packGrams >= BULK_PACK_GRAMS) && !isStale(p, today))
			.map((entry) => {
				const ingredient = catalog.ingredientsById.get(entry.ingredientId)!;
				const shop = bestPrice(ingredient, catalog.prices, today);
				// Without a shop price there is nothing real to compare with.
				const saving =
					shop.isEstimate || shop.storeId === entry.storeId
						? null
						: 1 - pricePerKg(entry) / shop.perKg;
				return { entry, ingredient, shop, saving };
			})
			.sort(
				(a, b) =>
					(b.saving ?? -1) - (a.saving ?? -1) ||
					a.ingredient.name.localeCompare(b.ingredient.name, 'sk')
			)
			// The best offer per ingredient; the rest is in its row of the list above.
			.filter((row, index, all) => all.findIndex((r) => r.ingredient === row.ingredient) === index)
	);
	const onlineStoreNames = $derived(
		catalog.stores
			.filter((s) => s.online && catalog.prices.some((p) => p.storeId === s.id))
			.map((s) => s.name)
			.join(', ')
	);
	const realCount = $derived(catalog.prices.length);
	const storesWithPrices = $derived(new Set(catalog.prices.map((p) => p.storeId)).size);
</script>

<Seo
	title="Ceny"
	description="Koľko stojí cícer, tofu či ryža v slovenských obchodoch – prepočítané na kilogram, aby sa ceny dali férovo porovnať."
/>

<div class="wrap page">
	<header class="rise">
		<p class="eyebrow">Ceny</p>
		<h1>Čo koľko stojí</h1>
		<p class="lede">
			Ceny porovnávame vždy za kilogram, takže veľké balenie a malé vrecúško sa dajú férovo
			porovnať. Reálne ceny majú obchod a dátum. Všetko ostatné je <span class="badge">odhad</span>
			a tak to aj označujeme.
		</p>
		<p class="muted small">
			{realCount
				? `${realCount} cien z ${storesWithPrices} obchodov.`
				: 'Reálne ceny z obchodov zatiaľ nemáme, všetko nižšie je hrubý odhad.'}
			<a href="#odkial">Odkiaľ ich berieme</a>
		</p>
		<nav class="jump" aria-label="Na tejto stránke">
			<a class="chip" href="#bielkoviny"><Icon name="bean" size={14} /> Bielkoviny za euro</a>
			{#if bulk.length}
				<a class="chip" href="#vo-velkom"><Icon name="package" size={14} /> Vo veľkom</a>
			{/if}
			<a class="chip" href="#pokrytie"><Icon name="store" size={14} /> Koľko je z obchodov</a>
		</nav>
	</header>

	<section class="table-section" aria-labelledby="suroviny">
		<h2 id="suroviny" class="sr-only">Suroviny a ich ceny</h2>
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
			{#each rows.slice(0, shown) as { ingredient, best, online, entries } (ingredient.id)}
				<li class="row card">
					<div class="main">
						<span class="dot" style:background={ingredient.color}></span>
						<div class="who">
							<strong><a class="ing" href="/suroviny/{ingredient.id}">{ingredient.name}</a></strong>
							<span class="muted small">{CATEGORY_LABELS[ingredient.category]}</span>
						</div>
						<div class="best">
							{#if ingredient.byproduct}
								<span class="badge leaf">zvyšok – zadarmo</span>
							{:else}
								<span class="price">{formatEur(best.perKg)}<small>/kg</small></span>
								{#if best.isEstimate}
									<span
										class="badge"
										title={best.lastSeen
											? `Podľa ceny, ktorú sme v obchode videli ${formatDate(best.lastSeen)}`
											: 'Hrubý odhad, v obchode sme ju nevideli'}
										>odhad{best.lastSeen ? ` z ${formatDate(best.lastSeen)}` : ''}</span
									>
								{:else}
									<span class="badge leaf">{catalog.storesById.get(best.storeId!)?.name}</span>
								{/if}
							{/if}
						</div>
					</div>
					{#if !ingredient.byproduct && online && online.storeId !== best.storeId && pricePerKg(online) < best.perKg}
						<p class="bulk-hint">
							<Icon name="package" size={14} />
							vo veľkom {formatEur(pricePerKg(online))}/kg · {catalog.storesById.get(online.storeId)
								?.name}
						</p>
					{/if}
					{#if entries.length}
						<ul class="entries">
							{#each entries as e, i (i)}
								{@const store = catalog.storesById.get(e.storeId)}
								{@const stale = e.saleUntil ? !isSaleActive(e, today) : isStale(e, today)}
								<li class:stale>
									<span class="sdot" style:background={store?.color}></span>
									<span class="what">
										<span class="store">{store?.name}</span>
										<span class="prod"
											>{e.product} · {formatGrams(e.packGrams)} za {formatEur(e.price)}</span
										>
									</span>
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
		{#if !rows.length}
			<p class="muted">Takú surovinu nemáme. Skús iné slovo alebo kategóriu.</p>
		{:else if rows.length > shown}
			<div class="more">
				<button class="btn ghost" onclick={() => (shown += PAGE)}>
					Zobraziť ďalšie ({rows.length - shown})
				</button>
			</div>
		{/if}
	</section>

	<section class="card box ppe" id="bielkoviny">
		<h2><Icon name="bean" size={24} /> Najviac bielkovín za euro</h2>
		<p class="muted small">
			Gramy bielkovín, ktoré dostaneš za 1 €. Počítané zo suchej váhy, len potraviny, kde bielkoviny
			tvoria aspoň 15 % energie.
		</p>
		<ol>
			{#each proteinPerEuro as p, i (p.ingredient.id)}
				<li style:--w="{(p.gramsPerEuro / maxProtein) * 100}%" style:--i={i}>
					<a class="nm ing" href="/suroviny/{p.ingredient.id}">{p.ingredient.name}</a>
					<span class="bar"><span></span></span>
					<strong>{formatNumber(p.gramsPerEuro, 0)} g</strong>
				</li>
			{/each}
		</ol>
	</section>

	{#if bulk.length}
		<section class="card box" id="vo-velkom">
			<h2><Icon name="package" size={24} /> Vo veľkom a z e-shopov</h2>
			<p class="muted small">
				Kilové balenia orechov, strukovín, obilnín a korenín z e-shopov ({onlineStoreNames}) – cena
				je bez dopravy, takže sa oplatia pri väčšej objednávke alebo s kamarátmi. Pri každom je,
				koľko by to isté stálo v obchode.
			</p>
			<ul class="bulk">
				{#each bulk as { entry: e, ingredient, shop, saving }, i (i)}
					<li>
						<strong><a class="ing" href="/suroviny/{ingredient.id}">{ingredient.name}</a></strong>
						<span class="bulk-price">{formatEur(pricePerKg(e))}/kg</span>
						{#if saving !== null && saving > 0.05}
							<span class="badge leaf">o {Math.round(saving * 100)} % lacnejšie</span>
						{/if}
						<span class="muted small bulk-detail">
							{e.product} · {catalog.storesById.get(e.storeId)?.name}
							{#if !shop.isEstimate && shop.storeId !== e.storeId}
								· v obchode od {formatEur(shop.perKg)}/kg ({catalog.storesById.get(shop.storeId!)
									?.name})
							{/if}
							{#if e.url}<a href={e.url} rel="noopener noreferrer" target="_blank"
									>odkaz <Icon name="external" size={14} /></a
								>{/if}
						</span>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<section class="card box coverage" id="pokrytie">
		<h2><Icon name="store" size={24} /> Koľko cien je z obchodov</h2>
		<div class="meter" role="img" aria-label="{Math.round(knownShare * 100)} % z obchodov">
			<span style:width="{knownShare * 100}%"></span>
		</div>
		<p class="muted small">
			<strong>{Math.round(knownShare * 100)} %</strong> ceny receptov je z reálnych cien v obchodoch,
			zvyšok je odhad. Najviac v ňom vážia tieto suroviny:
		</p>
		<ul class="missing">
			{#each missingPrices as i (i.id)}
				<li><a href="/suroviny/{i.id}">{i.name}</a></li>
			{/each}
		</ul>
	</section>

	<section class="card box sources" id="odkial">
		<h2><Icon name="info" size={24} /> Odkiaľ ceny berieme</h2>
		<p>
			<strong>Každý deň sa samy obnovujú</strong> ceny základných potravín (zelenina, múka,
			cestoviny, vločky, sójový nápoj…) z Billy, Lidla, Kauflandu, Tesca, Terna a Freshu – preberáme
			ich z
			<a href="https://www.cenyslovensko.sk/" rel="noopener">cenyslovensko.sk</a>, porovnávača
			Ministerstva financií, kam ich reťazce posielajú.
		</p>
		<p>
			<strong>Raz týždenne sa obnovujú</strong> ceny veľkých balení z e-shopov – orechy, semienka,
			strukoviny, obilniny a koreniny. Sú <a href="#vo-velkom">vyššie na stránke</a> aj pri každej surovine;
			do nákupu v obchode ich nerátame, lebo k nim treba pripočítať dopravu.
		</p>
		<p>
			<strong>Ostatné ceny sú orientačné.</strong> Tofu, tahini či koreniny porovnávač nesleduje,
			tak sme ich cenu raz pozreli v obchode. Po {STALE_AFTER_DAYS} dňoch ju už neberieme ako aktuálnu
			– ostane ako odhad s dátumom, kedy sme ju videli naposledy. Kde nemáme ani to, je odhad len hrubý.
		</p>
	</section>

	<details class="card box how">
		<summary><Icon name="info" size={20} /> Ako sa pridávajú ceny</summary>
		<p>
			Ceny sú v súbore <code>content/prices.yaml</code>, každý záznam je konkrétny produkt v
			konkrétnom obchode a dni. Stačí poslať fotku cenovky alebo letáku a doplníme ich. Poznáš
			e-shop, kde je niečo lacnejšie? <a href="/navrhni">Napíš nám</a> odkaz na produkt a pridáme ho medzi
			tie, ktoré sa obnovujú samy.
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
	.ing {
		color: inherit;
		text-decoration: none;
	}
	.ing:hover {
		text-decoration: underline;
	}
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
	.jump {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 4px;
	}
	.meter {
		height: 12px;
		margin: 12px 0 10px;
		border-radius: 999px;
		background: var(--paper-2);
		overflow: hidden;
	}
	.meter span {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: var(--leaf-2);
	}
	.missing {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin: 10px 0;
		padding: 0;
		list-style: none;
	}
	.missing a {
		display: inline-block;
		padding: 3px 10px;
		border: 1.5px solid var(--line);
		border-radius: 999px;
		font-size: 0.86rem;
		text-decoration: none;
		color: var(--ink);
	}
	.box {
		padding: 20px;
		margin-top: 24px;
		scroll-margin-top: 84px;
	}
	.box h2 {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 1.4rem;
		margin-bottom: 4px;
	}
	.box h2 :global(svg) {
		flex: none;
	}
	.sources p {
		margin: 10px 0 0;
		font-size: 0.92rem;
		color: var(--ink-2);
	}
	.ppe ol {
		list-style: none;
		padding: 0;
		margin: 14px 0 0;
		display: grid;
		gap: 10px;
	}
	/* Phones: name and grams on one line, the bar under them at full width. */
	.ppe li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 4px 12px;
		align-items: baseline;
		font-size: 0.92rem;
	}
	.ppe .bar {
		grid-column: 1 / -1;
		grid-row: 2;
	}
	.bar {
		height: 10px;
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
		margin-top: 24px;
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
		padding: 12px 14px;
		border-radius: var(--radius-sm);
	}
	.main {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		gap: 12px;
		align-items: center;
	}
	.who {
		display: flex;
		flex-direction: column;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.who strong {
		line-height: 1.3;
	}
	.dot {
		width: 14px;
		height: 14px;
		border-radius: 45% 55% 50% 50%;
		box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12);
	}
	/* Price over the shop on a phone, so a long name keeps most of the row. */
	.best {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 3px;
	}
	.price {
		font-size: 1.05rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.price small {
		margin-left: 3px;
		font-size: 0.8rem;
		font-weight: 500;
		color: var(--muted);
	}
	.bulk-hint {
		display: flex;
		align-items: center;
		gap: 6px;
		margin: 6px 0 0 26px;
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--leaf);
	}
	.bulk-hint :global(svg) {
		flex: none;
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
		grid-template-columns: auto minmax(0, 1fr) auto;
		gap: 4px 10px;
		align-items: baseline;
		font-size: 0.86rem;
		padding: 7px 10px;
		border-radius: 8px;
		background: var(--paper);
	}
	/* An old price steps back by colour; fading the whole row made it too faint to read. */
	.entries li.stale :is(.store, .kg) {
		color: var(--ink-2);
		font-weight: 600;
	}
	.sdot {
		width: 10px;
		height: 10px;
		border-radius: 3px;
	}
	.what {
		display: flex;
		flex-direction: column;
		min-width: 0;
		overflow-wrap: anywhere;
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
		white-space: nowrap;
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
	.more {
		display: flex;
		justify-content: center;
		margin-top: 16px;
	}
	.bulk-price {
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.bulk-detail {
		flex-basis: 100%;
		overflow-wrap: anywhere;
	}
	.bulk {
		display: grid;
		gap: 10px;
		margin: 14px 0 0;
		padding: 0;
		list-style: none;
	}
	.bulk li {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 2px 10px;
	}
	.bulk-detail a {
		white-space: nowrap;
	}
	.bulk-detail :global(svg) {
		display: inline;
		vertical-align: -2px;
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
	@media (min-width: 640px) {
		.row {
			padding: 12px 16px;
		}
		.best {
			flex-direction: row;
			align-items: center;
			gap: 8px;
		}
		.what {
			flex-flow: row wrap;
			gap: 0 8px;
		}
		.ppe li {
			grid-template-columns: minmax(160px, 1.2fr) 2fr auto;
			align-items: center;
		}
		.ppe .bar {
			grid-column: auto;
			grid-row: auto;
			height: 12px;
		}
	}
</style>
