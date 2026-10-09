<script lang="ts">
	import { afterNavigate, replaceState } from '$app/navigation';
	import Seo from '$lib/components/Seo.svelte';
	import { formatEur, formatNumber } from '$lib/amounts';
	import { useCatalog } from '$lib/catalog';
	import Icon from '$lib/components/Icon.svelte';
	import JumpNav, { type JumpLink } from '$lib/components/JumpNav.svelte';
	import {
		CATEGORY_LABELS,
		ingredientSearchText,
		normalizeSearch,
		searchMatcher
	} from '$lib/labels';
	import { proteinEnergyShare } from '$lib/nutrition';
	import {
		activeSales,
		ageInDays,
		bestOnlinePrice,
		bestPrice,
		BULK_PACK_GRAMS,
		isSaleActive,
		isStale,
		isUsable,
		nameWithPack,
		pricePerKg,
		recipesOnSale,
		STALE_AFTER_DAYS,
		storeStandings,
		unitPrice
	} from '$lib/pricing';
	import StorePicker from '$lib/components/StorePicker.svelte';
	import { settings } from '$lib/state.svelte';
	import {
		INGREDIENT_CATEGORIES,
		type Ingredient,
		type IngredientCategory,
		type PriceEntry
	} from '$lib/types';

	const catalog = useCatalog();
	const today = new Date();

	const formatDate = (iso: string) =>
		new Date(iso).toLocaleDateString('sk-SK', { day: 'numeric', month: 'numeric' });

	let search = $state('');
	let category = $state<IngredientCategory | ''>('');
	/** One shop's whole price list instead of every shop's. */
	let shop = $state('');
	type Sort = 'name' | 'cheap' | 'spread';
	let sort = $state<Sort>('name');
	const SORT_LABELS: Record<Sort, string> = {
		name: 'Podľa názvu',
		cheap: 'Najlacnejšie za kg',
		spread: 'Kde sa oplatí porovnávať'
	};
	/** The whole list is hundreds of rows; it opens a page at a time. */
	const PAGE = 30;
	let shown = $state(PAGE);
	$effect(() => {
		void search;
		void category;
		void shop;
		void sort;
		shown = PAGE;
	});

	// Filters live in the URL, so "Lidl, tofu" can be shared and Back returns to it.
	let urlRead = $state(false);
	// After the first navigation, so the router is ready when the effect below writes the URL.
	afterNavigate(() => {
		if (urlRead) return;
		const p = new URLSearchParams(location.search);
		search = p.get('q')?.slice(0, 60) ?? '';
		const s = p.get('obchod');
		if (s && catalog.storesById.has(s)) shop = s;
		const c = p.get('kategoria');
		if (c && (INGREDIENT_CATEGORIES as readonly string[]).includes(c)) {
			category = c as IngredientCategory;
		}
		const o = p.get('zoradit');
		if (o && o in SORT_LABELS) sort = o as Sort;
		urlRead = true;
	});
	$effect(() => {
		const p = new URLSearchParams();
		if (search.trim()) p.set('q', search.trim());
		if (shop) p.set('obchod', shop);
		if (category) p.set('kategoria', category);
		if (sort !== 'name') p.set('zoradit', sort);
		const query = p.toString();
		if (!urlRead || query === new URLSearchParams(location.search).toString()) return;
		replaceState(`${location.pathname}${query ? `?${query}` : ''}${location.hash}`, {});
	});

	const perUnit = (e: PriceEntry) => {
		const { value, unit } = unitPrice(e);
		return `${formatEur(value)}/${unit}`;
	};
	/** A shop's price in the unit the bulk offer is shown in, converting kg ↔ l by density. */
	function sameUnit(shop: PriceEntry, offer: PriceEntry, ingredient: Ingredient): string {
		const want = unitPrice(offer).unit;
		const have = unitPrice(shop);
		if (have.unit === want) return perUnit(shop);
		const perKg = pricePerKg(shop);
		const value = want === 'l' ? perKg * ingredient.density : perKg;
		return `${formatEur(value)}/${want}`;
	}
	const withPack = (e: PriceEntry) => nameWithPack(e.product, e.pack);
	const dayWord = (n: number) => (n === 1 ? 'deň' : n < 5 ? 'dni' : 'dní');

	const myStores = $derived(settings.current.myStores);
	/** Prices in the shops the user picked; e-shops stay, they're compared on their own. */
	const prices = $derived(
		catalog.prices.filter((p) => p.online || !myStores.length || myStores.includes(p.storeId))
	);

	const ingredientNames = catalog.ingredients.map(ingredientSearchText);
	const matchesName = $derived(searchMatcher(ingredientNames, search));
	/** "alpro", "lidl tofu": product names and shop names find prices too. */
	const searchWords = $derived(normalizeSearch(search).split(/\s+/).filter(Boolean));
	const storeWords = $derived(
		new Map(catalog.stores.map((s) => [s.id, normalizeSearch(s.name)] as const))
	);
	const matchesEntry = (e: PriceEntry) => {
		const text = `${normalizeSearch(e.product)} ${storeWords.get(e.storeId) ?? ''}`;
		return searchWords.length > 0 && searchWords.every((w) => text.includes(w));
	};
	/** A shop named in the search ("lidl tofu") narrows like the shop filter; the rest finds the food. */
	const searchedStore = $derived(
		catalog.stores.find((s) => searchWords.includes(normalizeSearch(s.name)))?.id ?? ''
	);
	const foodWords = $derived(
		searchedStore
			? searchWords.filter((w) => w !== storeWords.get(searchedStore)).join(' ')
			: search
	);
	const matchesFood = $derived(searchMatcher(ingredientNames, foodWords));
	/** "lidl tofu" when Lidl has no tofu price: show tofu everywhere rather than nothing. */
	const storeHasFood = $derived(
		!!searchedStore &&
			prices.some((p) => {
				const ingredient = catalog.ingredientsById.get(p.ingredientId);
				return (
					p.storeId === searchedStore &&
					!!ingredient &&
					(!foodWords.trim() || matchesFood(ingredientSearchText(ingredient)))
				);
			})
	);
	const searchStore = $derived(storeHasFood ? searchedStore : '');
	const rows = $derived.by(() => {
		const inShop = shop || searchStore;
		const list = catalog.ingredients
			.filter((i) => i.id !== 'voda')
			.filter((i) => !category || i.category === category)
			.map((ingredient) => {
				const all = prices
					.filter((p) => p.ingredientId === ingredient.id)
					.sort((a, b) => pricePerKg(a) - pricePerKg(b));
				const current = all.filter((p) => !p.online && isUsable(p, today));
				const low = current.length ? Math.min(...current.map(pricePerKg)) : null;
				const high = current.length ? Math.max(...current.map(pricePerKg)) : null;
				return {
					ingredient,
					best: bestPrice(ingredient, prices, today),
					online: bestOnlinePrice(ingredient, prices, today),
					entries: inShop ? all.filter((p) => p.storeId === inShop) : all,
					/** How much dearer the dearest shop is than the cheapest (0.5 = +50 %). */
					spread: low && high && current.length > 1 ? high / low - 1 : 0,
					cheapestHere:
						inShop && low !== null
							? current.some((p) => p.storeId === inShop && pricePerKg(p) === low)
							: false,
					lowElsewhere: inShop
						? current
								.filter((p) => p.storeId !== inShop)
								.reduce<PriceEntry | null>(
									(a, b) => (!a || pricePerKg(b) < pricePerKg(a) ? b : a),
									null
								)
						: null
				};
			})
			.filter((row) => !inShop || row.entries.length)
			.filter(
				(row) =>
					!search.trim() ||
					(searchedStore
						? (!foodWords.trim() && !!searchStore) ||
							(!!foodWords.trim() && matchesFood(ingredientSearchText(row.ingredient)))
						: matchesName(ingredientSearchText(row.ingredient))) ||
					row.entries.some(matchesEntry)
			)
			.map((row) => ({
				...row,
				// Liquids read per litre, like on the shelf label.
				bestEntry: row.best.isEstimate
					? undefined
					: row.entries.find(
							(e) => e.storeId === row.best.storeId && pricePerKg(e) === row.best.perKg
						)
			}));
		const byName = (a: (typeof list)[number], b: (typeof list)[number]) =>
			a.ingredient.name.localeCompare(b.ingredient.name, 'sk');
		if (sort === 'cheap') {
			const perKg = (r: (typeof list)[number]) =>
				inShop && r.entries.length ? pricePerKg(r.entries[0]) : r.best.perKg;
			return list.sort((a, b) => perKg(a) - perKg(b) || byName(a, b));
		}
		if (sort === 'spread') return list.sort((a, b) => b.spread - a.spread || byName(a, b));
		return list.sort(byName);
	});
	const shopName = $derived(
		(shop || searchStore) && catalog.storesById.get(shop || searchStore)?.name
	);

	const standings = $derived(storeStandings(catalog.prices, catalog.stores, today));

	let dealSearch = $state('');
	let dealSort = $state<'discount' | 'ending' | 'name'>('discount');
	const DEALS_PAGE = 8;
	let dealsShown = $state(DEALS_PAGE);

	/** Sales running now, each with a few everyday recipes that use the ingredient. */
	const allDeals = $derived(
		activeSales(prices, today)
			.filter((d) => catalog.ingredientsById.has(d.entry.ingredientId))
			.map((deal) => {
				const ingredient = catalog.ingredientsById.get(deal.entry.ingredientId)!;
				const group = ingredient.group;
				const recipes = catalog.recipes
					.filter(
						(r) =>
							r.treat.length === 0 &&
							r.lines.some((l) => catalog.ingredientsById.get(l.ingredientId)?.group === group)
					)
					.sort((a, b) => a.costPerServing - b.costPerServing)
					.slice(0, 3);
				return { ...deal, ingredient, recipes };
			})
	);
	const saleRecipes = $derived(
		recipesOnSale(
			catalog.recipes.filter((r) => r.treat.length === 0),
			allDeals
		).slice(0, 6)
	);
	const deals = $derived.by(() => {
		const matches = searchMatcher(ingredientNames, dealSearch);
		const found = allDeals.filter(
			(d) =>
				matches(ingredientSearchText(d.ingredient)) ||
				d.entry.product.toLowerCase().includes(dealSearch.trim().toLowerCase())
		);
		if (dealSort === 'ending') return found.toSorted((a, b) => a.daysLeft - b.daysLeft);
		if (dealSort === 'name')
			return found.toSorted((a, b) => a.ingredient.name.localeCompare(b.ingredient.name, 'sk'));
		return found;
	});

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

	/**
	 * The cheapest big pack or e-shop offer of each ingredient, next to what it costs in a shop
	 * you walk into (your shops, if picked), biggest saving first. Other e-shops are no "shop".
	 */
	const bulk = $derived.by(() => {
		const cheapest = new Map<string, PriceEntry>();
		for (const p of prices) {
			if (!(p.online || p.packGrams >= BULK_PACK_GRAMS) || isStale(p, today)) continue;
			const seen = cheapest.get(p.ingredientId);
			if (!seen || pricePerKg(p) < pricePerKg(seen)) cheapest.set(p.ingredientId, p);
		}
		const inShops = prices.filter((p) => !p.online);
		return [...cheapest.values()]
			.map((entry) => {
				const ingredient = catalog.ingredientsById.get(entry.ingredientId)!;
				// The shop's own product, so its price reads in the same unit (per l for liquids).
				const shop = inShops
					.filter((p) => p.ingredientId === entry.ingredientId && p !== entry && isUsable(p, today))
					.reduce<PriceEntry | null>((a, b) => (!a || pricePerKg(b) < pricePerKg(a) ? b : a), null);
				// Without a real shop price there is nothing to compare with.
				const saving = shop ? 1 - pricePerKg(entry) / pricePerKg(shop) : null;
				return { entry, ingredient, shop, saving };
			})
			.sort(
				(a, b) =>
					(b.saving ?? -1) - (a.saving ?? -1) ||
					a.ingredient.name.localeCompare(b.ingredient.name, 'sk')
			);
	});
	const onlineStoreNames = $derived(
		catalog.stores
			.filter((s) => s.online && catalog.prices.some((p) => p.storeId === s.id))
			.map((s) => s.name)
			.join(', ')
	);
	/** Only places on this page: the data page is a link of its own in the header. */
	const jumpLinks = $derived<JumpLink[]>([
		...(allDeals.length
			? [{ id: 'akcie', label: 'Akcie', icon: 'tag' as const, count: allDeals.length }]
			: []),
		{ id: 'suroviny', label: 'Všetky ceny', icon: 'euro' },
		...(standings.length
			? [{ id: 'obchody', label: 'Najlacnejší obchod', icon: 'store' as const }]
			: []),
		{ id: 'bielkoviny', label: 'Bielkoviny za euro', icon: 'bean' },
		...(bulk.length ? [{ id: 'vo-velkom', label: 'Vo veľkom', icon: 'package' as const }] : []),
		{ id: 'pokrytie', label: 'Koľko je z obchodov', icon: 'chart' },
		{ id: 'odkial', label: 'Odkiaľ ceny berieme', icon: 'info' }
	]);
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
			Ceny porovnávame vždy za kilogram (tekutiny za liter), takže veľké balenie a malé vrecúško sa
			dajú férovo porovnať. Reálne ceny majú obchod a dátum. Všetko ostatné je <span class="badge"
				>odhad</span
			>
			a tak to aj označujeme.
		</p>
		<p class="muted small">
			{realCount
				? `${realCount} cien z ${storesWithPrices} obchodov.`
				: 'Reálne ceny z obchodov zatiaľ nemáme, všetko nižšie je hrubý odhad.'}
			Ako sa ceny menia v čase a index košíka nájdeš v <a href="/data">Dátach</a>.
		</p>
		<div class="card box picker"><StorePicker /></div>
	</header>

	<JumpNav links={jumpLinks} />

	{#if allDeals.length}
		<section class="card box deals" id="akcie">
			<h2 class="section-title">
				<Icon name="tag" size={24} /> Teraz v akcii <span class="count">{allDeals.length}</span>
			</h2>
			<p class="muted small">
				Akciové ceny z obchodov (cenyslovensko.sk) a čo z tej suroviny uvariť. Rátajú sa aj do cien
				receptov a nákupu, kým akcia trvá.
			</p>
			{#if saleRecipes.length}
				<div class="sale-recipes">
					<h3>Uvar z akcií</h3>
					<div class="deal-recipes">
						{#each saleRecipes as { recipe, onSale, saving } (recipe.id)}
							<a
								class="chip"
								href="/recepty/{recipe.id}"
								title="V akcii: {onSale
									.map((id) => catalog.ingredientsById.get(id)?.name)
									.join(', ')}"
								>{recipe.title}{#if saving >= 0.05}<span class="saved"
										>−{formatEur(saving)}/porcia</span
									>{/if}</a
							>
						{/each}
					</div>
				</div>
			{/if}
			<div class="filters deal-filters">
				<div class="field grow">
					<Icon name="search" size={20} />
					<label for="deal-q" class="sr-only">Hľadať v akciách</label>
					<input
						id="deal-q"
						type="search"
						bind:value={dealSearch}
						oninput={() => (dealsShown = DEALS_PAGE)}
						placeholder="Hľadať v akciách…"
					/>
				</div>
				<label class="field">
					<span class="sr-only">Zoradiť</span>
					<select bind:value={dealSort}>
						<option value="discount">Najväčšia zľava</option>
						<option value="ending">Končí najskôr</option>
						<option value="name">Podľa názvu</option>
					</select>
				</label>
			</div>
			<ul>
				{#each deals.slice(0, dealsShown) as deal (`${deal.entry.ingredientId}|${deal.entry.storeId}`)}
					{@const store = catalog.storesById.get(deal.entry.storeId)}
					{@const was =
						deal.storeRegularPerKg !== null && deal.discount
							? (deal.storeRegularPerKg * deal.entry.packGrams) / 1000
							: null}
					<li>
						<span class="off" class:plain={!deal.discount || deal.discount < 0.05}>
							{deal.discount && deal.discount >= 0.05
								? `−${Math.round(deal.discount * 100)}\u00a0%`
								: 'akcia'}
						</span>
						<div class="deal-body">
							<div class="deal-head">
								<a href="/suroviny/{deal.ingredient.id}"><strong>{deal.ingredient.name}</strong></a>
								<span class="deal-price">
									<strong>{formatEur(deal.entry.price)}</strong>
									{#if was}<s>{formatEur(was)}</s>{/if}
								</span>
							</div>
							<p class="small deal-where">
								<span class="sdot" style:background={store?.color}></span>
								<strong>{store?.name ?? deal.entry.storeId}</strong>
								· {withPack(deal.entry)} ·
								<span class="muted">{perUnit(deal.entry)}</span>
							</p>
							<p class="small deal-meta">
								<span class="ends" class:soon={deal.daysLeft <= 1}>
									<Icon name="clock" size={14} />
									{deal.daysLeft === 0
										? 'posledný deň'
										: `ešte ${deal.daysLeft} ${dayWord(deal.daysLeft)}`}
									· do {formatDate(deal.entry.saleUntil!)}
								</span>
								{#if deal.discount && deal.discount >= 0.05 && !deal.discountInStore}
									<span class="muted">o {Math.round(deal.discount * 100)} % lacnejšie ako inde</span
									>
								{/if}
							</p>
							{#if deal.recipes.length}
								<div class="deal-recipes">
									{#each deal.recipes as r (r.id)}
										<a class="chip" href="/recepty/{r.id}">{r.title}</a>
									{/each}
									<a class="chip more" href="/recepty?s={deal.ingredient.id}">Všetky recepty →</a>
								</div>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
			{#if !deals.length}
				<p class="muted">V akcii taká surovina teraz nie je.</p>
			{:else if deals.length > dealsShown}
				<div class="more">
					<button class="btn ghost" onclick={() => (dealsShown = deals.length)}>
						Zobraziť všetky akcie ({deals.length})
					</button>
				</div>
			{/if}
		</section>
	{:else if myStores.length}
		<p class="muted no-deals">
			V tvojich obchodoch teraz nemáme žiadnu akciu na suroviny z receptov.
		</p>
	{/if}

	<section class="table-section" id="suroviny">
		<h2 class="section-title"><Icon name="euro" size={24} /> Všetky ceny surovín</h2>
		<div class="filters">
			<div class="field grow">
				<Icon name="search" size={20} />
				<label for="price-q" class="sr-only">Hľadať surovinu</label>
				<input
					id="price-q"
					type="search"
					bind:value={search}
					placeholder="Napr. tofu alebo „lidl tofu“"
				/>
			</div>
			<label class="field">
				<span class="sr-only">Obchod</span>
				<select bind:value={shop}>
					<option value="">Všetky obchody</option>
					{#each catalog.stores.filter( (st) => catalog.prices.some((p) => p.storeId === st.id) ) as st (st.id)}
						<option value={st.id}>{st.name}{st.online ? ' (e-shop)' : ''}</option>
					{/each}
				</select>
			</label>
			<label class="field">
				<span class="sr-only">Zoradiť</span>
				<select bind:value={sort}>
					{#each Object.entries(SORT_LABELS) as [value, text] (value)}
						<option {value}>{text}</option>
					{/each}
				</select>
			</label>
			<label class="field">
				<span class="sr-only">Kategória</span>
				<select bind:value={category}>
					<option value="">Všetky kategórie</option>
					{#each INGREDIENT_CATEGORIES as c (c)}<option value={c}>{CATEGORY_LABELS[c]}</option
						>{/each}
				</select>
			</label>
		</div>

		<p class="muted small result-count" role="status">
			{rows.length}
			{rows.length === 1
				? 'surovina'
				: rows.length < 5 && rows.length > 1
					? 'suroviny'
					: 'surovín'}{shopName ? ` v obchode ${shopName}` : ''}{sort === 'spread'
				? ' – navrchu tie, kde je medzi obchodmi najväčší rozdiel'
				: ''}.
		</p>
		<ul class="rows">
			{#each rows.slice(0, shown) as { ingredient, best, bestEntry, online, entries, spread, cheapestHere, lowElsewhere } (ingredient.id)}
				<li class="row card">
					<div class="main">
						<span class="swatch" style:--c={ingredient.color}></span>
						<div class="who">
							<strong><a class="ing" href="/suroviny/{ingredient.id}">{ingredient.name}</a></strong>
							<span class="muted small">{CATEGORY_LABELS[ingredient.category]}</span>
						</div>
						<div class="best">
							{#if ingredient.byproduct}
								<span class="badge leaf">zvyšok – zadarmo</span>
							{:else}
								{@const shown = bestEntry
									? unitPrice(bestEntry)
									: { value: best.perKg, unit: 'kg' }}
								<span class="price">{formatEur(shown.value)}<small>/{shown.unit}</small></span>
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
					{#if shopName && entries.length}
						<p class="shop-verdict small">
							{#if cheapestHere}
								<span class="badge leaf"><Icon name="check" size={12} /> tu najlacnejšie</span>
							{:else if lowElsewhere && pricePerKg(lowElsewhere) < pricePerKg(entries[0])}
								<span class="badge"
									>inde od {perUnit(lowElsewhere)} · {catalog.storesById.get(lowElsewhere.storeId)
										?.name} (−{Math.round(
										(1 - pricePerKg(lowElsewhere) / pricePerKg(entries[0])) * 100
									)} %)</span
								>
							{/if}
						</p>
					{:else if sort === 'spread' && spread >= 0.05}
						<p class="shop-verdict small">
							<span class="badge">medzi obchodmi až +{Math.round(spread * 100)} %</span>
						</p>
					{/if}
					{#if !ingredient.byproduct && online && online.storeId !== best.storeId && pricePerKg(online) < best.perKg}
						<p class="bulk-hint">
							<Icon name="package" size={14} />
							vo veľkom {perUnit(online)} · {catalog.storesById.get(online.storeId)?.name}
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
										<span class="prod">{withPack(e)} za {formatEur(e.price)}</span>
									</span>
									<span class="kg">{perUnit(e)}</span>
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
			<p class="empty">Takú surovinu nemáme. Skús iné slovo alebo kategóriu.</p>
		{:else if rows.length > shown}
			<div class="more">
				<button class="btn ghost" onclick={() => (shown += PAGE)}>
					Zobraziť ďalšie ({rows.length - shown})
				</button>
			</div>
		{/if}
	</section>

	{#if standings.length}
		<section class="card box standings" id="obchody">
			<h2 class="section-title"><Icon name="store" size={24} /> Ktorý obchod je najlacnejší</h2>
			<p class="muted small">
				Porovnávame suroviny, ktoré predávajú aspoň tri obchody, za bežnú cenu za kg (bez akcií).
				„+8 %“ znamená, že tam v priemere zaplatíš o 8 % viac ako v najlacnejšom obchode pri každej
				surovine. Klikni na obchod a uvidíš jeho cenník.
			</p>
			<ol>
				{#each standings as st (st.storeId)}
					{@const store = catalog.storesById.get(st.storeId)}
					<li>
						<button
							class="standing"
							aria-pressed={shop === st.storeId}
							onclick={() => {
								shop = shop === st.storeId ? '' : st.storeId;
								document.getElementById('price-q')?.scrollIntoView({ block: 'center' });
							}}
						>
							<span class="sdot" style:background={store?.color}></span>
							<strong>{store?.name ?? st.storeId}</strong>
							<span class="ratio">+{Math.round((st.ratio - 1) * 100)} %</span>
							<span class="muted small"
								>najlacnejší pri {st.cheapest} z {st.compared}
								surovín</span
							>
						</button>
					</li>
				{/each}
			</ol>
			<p class="muted small">
				Na konkrétny nákup je presnejší <a href="/plan#nakup">nákupný zoznam</a> – porovná obchody len
				pre to, čo naozaj kupuješ.
			</p>
		</section>
	{/if}

	<section class="card box ppe" id="bielkoviny">
		<h2 class="section-title"><Icon name="bean" size={24} /> Najviac bielkovín za euro</h2>
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
			<h2 class="section-title"><Icon name="package" size={24} /> Vo veľkom a z e-shopov</h2>
			<p class="muted small">
				Kilové balenia orechov, strukovín, obilnín a korenín z e-shopov ({onlineStoreNames}) – cena
				je bez dopravy, takže sa oplatia pri väčšej objednávke alebo s kamarátmi. Pri každom je,
				koľko by to isté stálo v obchode.
			</p>
			<ul class="bulk">
				{#each bulk as { entry: e, ingredient, shop, saving }, i (i)}
					<li>
						<strong><a class="ing" href="/suroviny/{ingredient.id}">{ingredient.name}</a></strong>
						<span class="bulk-price">{perUnit(e)}</span>
						{#if saving !== null && saving > 0.05}
							<span class="badge leaf">o {Math.round(saving * 100)} % lacnejšie</span>
						{:else if saving !== null && saving < -0.05}
							<span class="badge">v obchode lacnejšie</span>
						{/if}
						<span class="muted small bulk-detail">
							{withPack(e)} · {catalog.storesById.get(e.storeId)?.name}
							{#if shop}
								· v obchode od {sameUnit(shop, e, ingredient)} ({catalog.storesById.get(
									shop.storeId
								)?.name})
							{:else}
								· v kamenných obchodoch cenu nepoznáme
							{/if}
							{#if e.url}<a href={e.url} rel="noopener noreferrer" target="_blank"
									>do e-shopu <Icon name="external" size={14} /><span class="sr-only">
										(nové okno)</span
									></a
								>{/if}
						</span>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<section class="card box coverage" id="pokrytie">
		<h2 class="section-title"><Icon name="chart" size={24} /> Koľko cien je z obchodov</h2>
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
		<h2 class="section-title"><Icon name="info" size={24} /> Odkiaľ ceny berieme</h2>
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
		font-size: var(--fs-sm);
		text-decoration: none;
		color: var(--ink);
	}
	/* Every block on the page is the same distance from the one before it. */
	.box,
	.table-section {
		margin-top: var(--sp-5);
	}
	.section-title {
		margin-bottom: var(--sp-1);
	}
	.sources p {
		margin: 10px 0 0;
		font-size: var(--fs-md);
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
		font-size: var(--fs-md);
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
	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		margin-bottom: 14px;
	}
	/* The pickers share a row when they fit, instead of each taking a line of its own. */
	.filters > .field {
		flex: 1 1 150px;
	}
	.filters > .grow {
		flex: 3 1 240px;
	}
	.result-count {
		margin: 0 0 10px;
	}
	.shop-verdict {
		margin: 6px 0 0;
	}
	.standings ol {
		display: grid;
		gap: 8px;
		padding: 0;
		margin: 12px 0;
		list-style: none;
	}
	.standing {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 10px;
		width: 100%;
		padding: 10px 14px;
		border: 1.5px solid var(--line);
		border-radius: var(--radius-sm);
		background: var(--paper);
		color: var(--ink);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.standing[aria-pressed='true'] {
		border-color: var(--leaf);
	}
	.standing .ratio {
		margin-left: auto;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.standing .muted {
		flex-basis: 100%;
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
	.main .swatch {
		width: 14px;
		height: 14px;
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
		font-size: var(--fs-xs);
		font-weight: 500;
		color: var(--muted);
	}
	.bulk-hint {
		display: flex;
		align-items: center;
		gap: 6px;
		margin: 6px 0 0 26px;
		font-size: var(--fs-sm);
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
		font-size: var(--fs-sm);
		padding: 7px 10px;
		border-radius: var(--radius-xs);
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
		border-radius: var(--radius-sm);
		padding: 14px;
		overflow-x: auto;
		font-size: var(--fs-sm);
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
	.picker {
		margin-top: var(--sp-4);
	}
	.count {
		font-size: var(--fs-sm);
		font-family: var(--font-body);
		padding: 2px 9px;
		border-radius: 999px;
		background: var(--tomato-soft);
		color: color-mix(in srgb, var(--tomato) 60%, var(--ink));
		vertical-align: middle;
	}
	.sale-recipes {
		margin-top: 12px;
	}
	.sale-recipes h3 {
		font-size: 1rem;
		margin: 0;
	}
	/* Recipe titles are long; on a phone they have to wrap instead of running off the edge. */
	.deal-recipes .chip {
		white-space: normal;
		max-width: 100%;
	}
	.saved {
		color: var(--leaf);
		font-weight: 700;
		margin-left: 2px;
	}
	.deal-filters {
		margin-top: 12px;
	}
	.no-deals {
		margin: var(--sp-5) 0 0;
	}
	.deals ul {
		list-style: none;
		margin: 4px 0 0;
		padding: 0;
		display: grid;
		gap: 14px;
	}
	.deals li {
		display: grid;
		grid-template-columns: 64px 1fr;
		gap: 12px;
		align-items: start;
		padding-bottom: 14px;
		border-bottom: 1px dashed var(--line);
	}
	.deals li:last-child {
		border-bottom: 0;
		padding-bottom: 0;
	}
	/* The discount is the point of the list, so it gets a price-tag of its own. */
	.off {
		display: grid;
		place-items: center;
		min-height: 48px;
		padding: 4px;
		border-radius: 12px 12px 12px 4px;
		background: var(--alert-bg);
		color: var(--alert-ink);
		font-weight: 800;
		font-size: 1.05rem;
		font-variant-numeric: tabular-nums;
		transform: rotate(-4deg);
	}
	.off.plain {
		background: var(--tomato-soft);
		color: color-mix(in srgb, var(--tomato) 60%, var(--ink));
		font-size: var(--fs-sm);
	}
	.deal-body {
		min-width: 0;
	}
	.deal-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 4px 12px;
	}
	.deal-head a {
		font-size: 1.05rem;
	}
	.deal-price {
		display: inline-flex;
		align-items: baseline;
		gap: 8px;
		font-variant-numeric: tabular-nums;
	}
	.deal-price strong {
		font-size: 1.15rem;
		color: color-mix(in srgb, var(--tomato) 70%, var(--ink));
	}
	.deal-price s {
		color: var(--muted);
		font-size: var(--fs-md);
	}
	.deals p {
		margin: 4px 0 0;
		overflow-wrap: anywhere;
	}
	.deal-where {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0 6px;
	}
	.deal-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 12px;
	}
	.ends {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		color: var(--ink-2);
	}
	.ends.soon {
		color: color-mix(in srgb, var(--tomato) 70%, var(--ink));
		font-weight: 700;
	}
	.deal-recipes {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 10px;
	}
	@media (max-width: 480px) {
		.deals li {
			grid-template-columns: 52px 1fr;
			gap: 10px;
		}
		.off {
			font-size: var(--fs-md);
		}
	}
</style>
