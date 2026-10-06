<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { formatEur, formatNumber } from '$lib/amounts';
	import { useCatalog } from '$lib/catalog';
	import Icon from '$lib/components/Icon.svelte';
	import PriceChart from '$lib/components/PriceChart.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import { ingredientSearchText, searchMatcher } from '$lib/labels';
	import {
		ingredientTimeline,
		lowestPrice,
		priceChanges,
		type PriceHistory
	} from '$lib/price-history';
	import { isSaleActive, shelfName, unitPrice } from '$lib/pricing';
	import { SITE_ORIGIN } from '$lib/site';
	import type { PriceEntry } from '$lib/types';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const catalog = useCatalog();
	const today = new Date();
	const shops = catalog.stores.filter((s) => !s.online);
	const shopIds = shops.map((s) => s.id);
	const storeName = (id: string) => catalog.storesById.get(id)?.name ?? id;
	const ingredientName = (id: string) => catalog.ingredientsById.get(id)?.name ?? id;
	const dayFormat = new Intl.DateTimeFormat('sk', {
		day: 'numeric',
		month: 'numeric',
		year: 'numeric'
	});
	const fmtDay = (d: string) => dayFormat.format(new Date(`${d}T00:00:00Z`));
	/** Most shop names already end with the pack size; say it once. */
	const PACK_IN_NAME = /\d\s*(g|kg|ml|l)\b/i;
	const withPack = (product: string, pack: string) =>
		PACK_IN_NAME.test(product) ? shelfName(product) : `${shelfName(product)} · ${pack}`;
	const percent = (n: number) =>
		`${n > 0 ? '+' : n < 0 ? '−' : ''}${formatNumber(Math.abs(n) * 100, 1)} %`;

	interface Community {
		week: {
			liked: { recipe_id: string; count: number }[];
			cooked: { recipe_id: string; count: number }[];
		};
		rated: { recipe_id: string; rating: number; ratings: number }[];
		totals: { likes: number; liking_devices: number; cooked_reports: number; ratings: number };
	}
	let community = $state<Community | null>(null);
	let communityFailed = $state(false);
	const recipeTitle = (id: string) => catalog.recipesById.get(id)?.title;

	async function loadCommunity() {
		try {
			const res = await fetch('/api/statistiky');
			if (!res.ok) throw new Error(String(res.status));
			community = (await res.json()) as Community;
		} catch (err) {
			console.error('data: community stats failed', err);
			communityFailed = true;
		}
	}

	let history = $state<PriceHistory | null>(null);
	let historyFailed = $state(false);
	onMount(async () => {
		// Prerendered page: the query string is only known in the browser.
		chosen = page.url.searchParams.get('s') ?? '';
		loadCommunity();
		try {
			const res = await fetch(`${data.apiBase}/historia-serie.json`);
			if (!res.ok) throw new Error(String(res.status));
			history = await res.json();
		} catch (err) {
			console.error('data: price history failed', err);
			historyFailed = true;
		}
	});

	/** Ingredients with shop prices over time, the most watched first for the default chart. */
	const tracked = $derived.by(() => {
		if (!history) return [];
		const counts = new Map<string, number>();
		for (const s of history.series) {
			if (shopIds.includes(s.storeId))
				counts.set(s.ingredientId, (counts.get(s.ingredientId) ?? 0) + 1);
		}
		return [...counts]
			.filter(([id]) => catalog.ingredientsById.has(id))
			.sort((a, b) => b[1] - a[1])
			.map(([id]) => id);
	});
	const trackedByName = $derived(
		tracked.toSorted((a, b) => ingredientName(a).localeCompare(ingredientName(b), 'sk'))
	);
	let chosen = $state('');
	const selected = $derived(tracked.includes(chosen) ? chosen : (tracked[0] ?? ''));
	const timeline = $derived(
		history && selected ? ingredientTimeline(history, selected, shopIds) : null
	);
	const lowest = $derived(history && selected ? lowestPrice(history, selected, shopIds, 90) : null);

	let windowDays = $state<'7' | '30' | '90' | 'all'>('all');
	const changes = $derived(
		history
			? priceChanges(history, shopIds, windowDays === 'all' ? null : Number(windowDays)).filter(
					(c) => catalog.ingredientsById.has(c.ingredientId) && Math.abs(c.change) >= 0.005
				)
			: []
	);
	const dearer = $derived(changes.filter((c) => c.change > 0).slice(0, 10));
	const cheaper = $derived(
		changes
			.filter((c) => c.change < 0)
			.toReversed()
			.slice(0, 10)
	);

	// ── All current prices ──────────────────────────────────────────────
	let search = $state('');
	let store = $state('');
	let salesOnly = $state(false);
	type SortKey = 'ingredient' | 'store' | 'price' | 'unit' | 'date';
	let sortKey = $state<SortKey>('ingredient');
	let sortDesc = $state(false);
	const PAGE = 50;
	let shown = $state(PAGE);
	$effect(() => {
		void search;
		void store;
		void salesOnly;
		shown = PAGE;
	});
	const ingredientNames = catalog.ingredients.map(ingredientSearchText);
	const rows = $derived.by(() => {
		const matches = searchMatcher(ingredientNames, search);
		const query = search.trim().toLowerCase();
		const value = (p: PriceEntry): string | number => {
			if (sortKey === 'ingredient') return ingredientName(p.ingredientId);
			if (sortKey === 'store') return storeName(p.storeId);
			if (sortKey === 'price') return p.price;
			if (sortKey === 'unit') return unitPrice(p).value;
			return p.date;
		};
		return catalog.prices
			.filter((p) => !store || p.storeId === store)
			.filter((p) => !salesOnly || isSaleActive(p, today))
			.filter((p) => {
				const ingredient = catalog.ingredientsById.get(p.ingredientId);
				return (
					!query ||
					(ingredient && matches(ingredientSearchText(ingredient))) ||
					p.product.toLowerCase().includes(query)
				);
			})
			.toSorted((a, b) => {
				const va = value(a);
				const vb = value(b);
				const order =
					typeof va === 'number' && typeof vb === 'number'
						? va - vb
						: String(va).localeCompare(String(vb), 'sk');
				return sortDesc ? -order : order;
			});
	});
	function sortBy(key: SortKey) {
		if (sortKey === key) sortDesc = !sortDesc;
		else {
			sortKey = key;
			sortDesc = key === 'date';
		}
	}
	const ariaSort = (key: SortKey) =>
		sortKey === key ? (sortDesc ? 'descending' : 'ascending') : undefined;

	const lastPriceDay = catalog.prices.reduce((max, p) => (p.date > max ? p.date : max), '');
	const datasetJsonLd = $derived({
		'@context': 'https://schema.org',
		'@type': 'Dataset',
		name: 'Receptio – recepty, suroviny a ceny potravín na Slovensku',
		description:
			'Vegánske recepty s cenou a živinami na porciu, suroviny s nutričnými hodnotami a ceny potravín v slovenských obchodoch aj s históriou.',
		url: `${SITE_ORIGIN}/data`,
		license: data.license.path,
		isAccessibleForFree: true,
		inLanguage: 'sk',
		spatialCoverage: 'Slovensko',
		creator: { '@type': 'Organization', name: 'Receptio', url: SITE_ORIGIN },
		distribution: data.resources.flatMap((r) => [
			{
				'@type': 'DataDownload',
				name: r.title,
				encodingFormat: 'text/csv',
				contentUrl: `${SITE_ORIGIN}${data.apiBase}/${r.name}.csv`
			},
			{
				'@type': 'DataDownload',
				name: r.title,
				encodingFormat: 'application/json',
				contentUrl: `${SITE_ORIGIN}${data.apiBase}/${r.name}.json`
			}
		])
	});
	const exampleUrl = $derived(`${SITE_ORIGIN}${data.apiBase}/ceny.json`);
</script>

<Seo
	title="Dáta"
	description="Ceny potravín v slovenských obchodoch a ich vývoj, všetky ceny v tabuľke a otvorené dáta Receptia na stiahnutie (CSV, JSON, API)."
	jsonLd={[datasetJsonLd]}
/>

<div class="wrap page">
	<header class="rise">
		<p class="eyebrow">Dáta</p>
		<h1>Všetky čísla na jednom mieste</h1>
		<p class="lede">
			Ako sa menia ceny potravín, všetky ceny, ktoré poznáme, a celé dáta Receptia na stiahnutie –
			pre každého, bez registrácie.
		</p>
		<dl class="tiles">
			<div>
				<dt>Cien v obchodoch</dt>
				<dd>{catalog.prices.length}</dd>
				<dd class="sub">naposledy {fmtDay(lastPriceDay)}</dd>
			</div>
			<div>
				<dt>Obchodov</dt>
				<dd>{new Set(catalog.prices.map((p) => p.storeId)).size}</dd>
				<dd class="sub">aj e-shopy</dd>
			</div>
			<div>
				<dt>Dní histórie</dt>
				<dd>{history ? history.days.length : '…'}</dd>
				<dd class="sub">{history?.days.length ? `od ${fmtDay(history.days[0])}` : ''}</dd>
			</div>
			<div>
				<dt>Receptov</dt>
				<dd>{catalog.recipes.length}</dd>
				<dd class="sub">{catalog.ingredients.length} surovín</dd>
			</div>
		</dl>
		<nav class="jump" aria-label="Na tejto stránke">
			<a class="chip" href="#vyvoj"><Icon name="chart" size={14} /> Vývoj cien</a>
			<a class="chip" href="#zmeny"><Icon name="tag" size={14} /> Zdraželo a zlacnelo</a>
			<a class="chip" href="#vsetky"><Icon name="store" size={14} /> Všetky ceny</a>
			<a class="chip" href="#komunita"><Icon name="heart" size={14} /> Čo varia ostatní</a>
			<a class="chip" href="#api"><Icon name="package" size={14} /> Otvorené dáta a API</a>
		</nav>
	</header>

	<section class="card box" id="vyvoj">
		<h2><Icon name="chart" size={24} /> Vývoj cien</h2>
		{#if historyFailed}
			<p class="muted">Históriu cien sa nepodarilo načítať. Skús stránku obnoviť.</p>
		{:else if !history}
			<p class="muted">Načítavam históriu…</p>
		{:else if !tracked.length}
			<p class="muted">História cien zatiaľ nie je.</p>
		{:else}
			<label class="field pick">
				<span class="sr-only">Surovina</span>
				<select value={selected} onchange={(e) => (chosen = e.currentTarget.value)}>
					{#each trackedByName as id (id)}
						<option value={id}>{ingredientName(id)}</option>
					{/each}
				</select>
			</label>
			{#if timeline}
				<PriceChart {timeline} stores={shops} title={ingredientName(selected)} />
			{/if}
			<p class="small facts">
				{#if lowest}
					Najlacnejšie za posledných 90 dní: <strong>{formatEur(lowest.value)}/{lowest.unit}</strong
					>
					v
					{lowest.stores
						.map(
							(st) => `${storeName(st.storeId)}${st.sale ? ' (akcia)' : ''} od ${fmtDay(st.day)}`
						)
						.join(', ')}.
				{/if}
				<a href="/suroviny/{selected}">Všetko o surovine</a>
			</p>
			{#if history.days.length < 14}
				<p class="muted small">
					Históriu zbierame od {fmtDay(history.days[0])}, zatiaľ {history.days.length}
					{history.days.length < 5 ? 'dni' : 'dní'}. Každý deň pribudne nový bod.
				</p>
			{/if}
		{/if}
	</section>

	<section class="card box" id="zmeny">
		<h2><Icon name="tag" size={24} /> Zdraželo a zlacnelo</h2>
		<p class="muted small">
			Každý produkt porovnaný sám so sebou v tom istom obchode, na začiatku a na konci obdobia.
			Akcie sa nerátajú.
		</p>
		<label class="field pick">
			<span class="sr-only">Obdobie</span>
			<select bind:value={windowDays}>
				<option value="7">Posledných 7 dní</option>
				<option value="30">Posledných 30 dní</option>
				<option value="90">Posledné 3 mesiace</option>
				<option value="all">Odkedy zbierame</option>
			</select>
		</label>
		{#if history && !changes.length}
			<p class="muted">
				Za toto obdobie sa nič nezmenilo, alebo na porovnanie ešte nemáme dosť dní.
			</p>
		{:else if history}
			<p class="muted small">Od {fmtDay(changes[0].since)} do {fmtDay(history.days.at(-1)!)}.</p>
			<div class="two">
				{#each [{ title: 'Zdraželo', list: dearer, cls: 'up' }, { title: 'Zlacnelo', list: cheaper, cls: 'down' }] as group (group.title)}
					<div>
						<h3>{group.title}</h3>
						{#if group.list.length}
							<ol class="moves">
								{#each group.list as c (`${c.storeId}|${c.product}|${c.pack}`)}
									<li>
										<span class="what">
											<a
												href="/data?s={c.ingredientId}#vyvoj"
												onclick={() => (chosen = c.ingredientId)}
												>{ingredientName(c.ingredientId)}</a
											>
											<span class="muted"
												>{storeName(c.storeId)} · {withPack(c.product, c.pack)}</span
											>
										</span>
										<span class="muted">{formatEur(c.from)} → {formatEur(c.to)}</span>
										<strong class={group.cls}>{percent(c.change)}</strong>
									</li>
								{/each}
							</ol>
						{:else}
							<p class="muted small">Nič.</p>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</section>

	<section class="card box" id="vsetky">
		<h2><Icon name="store" size={24} /> Všetky ceny</h2>
		<div class="filters">
			<div class="field grow">
				<Icon name="search" size={20} />
				<label for="all-q" class="sr-only">Hľadať surovinu alebo produkt</label>
				<input id="all-q" type="search" bind:value={search} placeholder="Surovina alebo produkt…" />
			</div>
			<label class="field">
				<span class="sr-only">Obchod</span>
				<select bind:value={store}>
					<option value="">Všetky obchody</option>
					{#each catalog.stores.filter( (s) => catalog.prices.some((p) => p.storeId === s.id) ) as s (s.id)}
						<option value={s.id}>{s.name}</option>
					{/each}
				</select>
			</label>
			<label class="check">
				<input type="checkbox" bind:checked={salesOnly} /> Len akcie
			</label>
		</div>
		<p class="muted small">{rows.length} cien</p>
		<div class="table-wrap">
			<table>
				<thead>
					<tr>
						<th scope="col" aria-sort={ariaSort('ingredient')}
							><button onclick={() => sortBy('ingredient')}>Surovina</button></th
						>
						<th scope="col" aria-sort={ariaSort('store')}
							><button onclick={() => sortBy('store')}>Obchod</button></th
						>
						<th scope="col">Produkt</th>
						<th scope="col" class="num" aria-sort={ariaSort('price')}
							><button onclick={() => sortBy('price')}>Cena</button></th
						>
						<th scope="col" class="num" aria-sort={ariaSort('unit')}
							><button onclick={() => sortBy('unit')}>Za kg / l</button></th
						>
						<th scope="col" aria-sort={ariaSort('date')}
							><button onclick={() => sortBy('date')}>Zistené</button></th
						>
					</tr>
				</thead>
				<tbody>
					{#each rows.slice(0, shown) as p, i (i)}
						{@const unit = unitPrice(p)}
						<tr>
							<td><a href="/suroviny/{p.ingredientId}">{ingredientName(p.ingredientId)}</a></td>
							<td>{storeName(p.storeId)}</td>
							<td class="prod">
								{#if p.url}<a href={p.url} rel="noopener noreferrer" target="_blank"
										>{shelfName(p.product)}</a
									>{:else}{shelfName(p.product)}{/if}
								{#if !PACK_IN_NAME.test(p.product)}<span class="muted">· {p.pack}</span>{/if}
								{#if p.saleUntil && isSaleActive(p, today)}<span class="badge tomato">akcia</span
									>{/if}
							</td>
							<td class="num">{formatEur(p.price)}</td>
							<td class="num">{formatEur(unit.value)}<small>/{unit.unit}</small></td>
							<td>{fmtDay(p.date)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		{#if rows.length > shown}
			<div class="more">
				<button class="btn ghost" onclick={() => (shown += PAGE)}>
					Zobraziť ďalšie ({rows.length - shown})
				</button>
			</div>
		{/if}
	</section>

	<section class="card box" id="komunita">
		<h2><Icon name="heart" size={24} /> Čo varia ostatní</h2>
		<p class="muted small">
			Anonymne a len súhrnne: lajky a hlásenia „uvarené“ pri receptoch. Recept sa ukáže, až keď to
			isté urobili aspoň dvaja ľudia. Kto čo robí, nevidí nikto – ani my.
		</p>
		{#if communityFailed}
			<p class="muted">Teraz sa to nepodarilo načítať.</p>
		{:else if !community}
			<p class="muted">Načítavam…</p>
		{:else}
			<dl class="tiles small-tiles">
				<div>
					<dt>Lajkov</dt>
					<dd>{community.totals.likes}</dd>
					<dd class="sub">od {community.totals.liking_devices} ľudí</dd>
				</div>
				<div>
					<dt>Uvarené podľa receptu</dt>
					<dd>{community.totals.cooked_reports}×</dd>
				</div>
				<div>
					<dt>Hodnotení</dt>
					<dd>{community.totals.ratings}</dd>
				</div>
			</dl>
			<div class="two">
				{#each [{ title: 'Tento týždeň obľúbené', list: community.week.liked, unit: '♥' }, { title: 'Tento týždeň uvarené', list: community.week.cooked, unit: '×' }] as group (group.title)}
					<div>
						<h3>{group.title}</h3>
						{#if group.list.some((r) => recipeTitle(r.recipe_id))}
							<ol class="moves">
								{#each group.list.filter((r) => recipeTitle(r.recipe_id)) as r (r.recipe_id)}
									<li>
										<a href="/recepty/{r.recipe_id}">{recipeTitle(r.recipe_id)}</a>
										<span></span>
										<strong>{r.count}{group.unit}</strong>
									</li>
								{/each}
							</ol>
						{:else}
							<p class="muted small">
								Zatiaľ nič – keď to isté urobia aspoň dvaja, objaví sa to tu.
							</p>
						{/if}
					</div>
				{/each}
				<div>
					<h3>Najlepšie hodnotené</h3>
					{#if community.rated.some((r) => recipeTitle(r.recipe_id))}
						<ol class="moves">
							{#each community.rated.filter((r) => recipeTitle(r.recipe_id)) as r (r.recipe_id)}
								<li>
									<a href="/recepty/{r.recipe_id}">{recipeTitle(r.recipe_id)}</a>
									<span class="muted">{r.ratings} hodnotení</span>
									<strong>{formatNumber(r.rating, 1)} ★</strong>
								</li>
							{/each}
						</ol>
					{:else}
						<p class="muted small">Recept sa sem dostane s aspoň tromi hodnoteniami.</p>
					{/if}
				</div>
			</div>
		{/if}
	</section>

	<section class="card box" id="api">
		<h2><Icon name="package" size={24} /> Otvorené dáta a API</h2>
		<p>
			Všetko, čo Receptio vie, je voľne na stiahnutie a na použitie vo vlastných aplikáciách,
			tabuľkách či výskume – len na čítanie, bez kľúča a bez registrácie. Ceny sa obnovujú denne.
		</p>
		<ul class="standards">
			<li>
				<strong>JSON a CSV</strong> pre každú tabuľku (CSV podľa RFC 4180, UTF-8, prvý riadok je hlavička).
			</li>
			<li>
				<a href="{data.apiBase}/openapi.json">openapi.json</a> – popis API vo formáte
				<a href="https://spec.openapis.org/oas/v3.1.0" rel="noopener">OpenAPI 3.1</a>.
			</li>
			<li>
				<a href="{data.apiBase}/datapackage.json">datapackage.json</a> – popis tabuliek, stĺpcov a
				väzieb ako
				<a href="https://specs.frictionlessdata.io/data-package/" rel="noopener"
					>Frictionless Data Package</a
				>.
			</li>
			<li>
				<strong>CORS</strong> je povolený pre každú stránku, dáta sa dajú čítať priamo z prehliadača.
			</li>
			<li>
				<a href="/api/statistiky">/api/statistiky</a> – živé súhrnné čísla o lajkoch a varení (popis v
				openapi.json).
			</li>
			<li>
				<strong>Verzia v adrese</strong> ({data.apiBase}): zmena, ktorá by rozbila existujúce
				použitie, pôjde na novú adresu.
			</li>
			<li>
				Licencia <a href={data.license.path} rel="noopener">{data.license.title}</a> – uveď Receptio
				ako zdroj. Ceny pochádzajú z
				<a href="https://www.cenyslovensko.sk/" rel="noopener">cenyslovensko.sk</a> a zo stránok e-shopov.
			</li>
		</ul>

		<div class="table-wrap">
			<table class="resources">
				<thead>
					<tr>
						<th scope="col">Tabuľka</th>
						<th scope="col" class="num">Riadkov</th>
						<th scope="col">Stiahnuť</th>
					</tr>
				</thead>
				<tbody>
					{#each data.resources as r (r.name)}
						<tr>
							<td>
								<strong>{r.title}</strong>
								<span class="muted small desc">{r.description}</span>
								<details>
									<summary>Stĺpce ({r.fields.length})</summary>
									<dl class="fields">
										{#each r.fields as f (f.name)}
											<dt>
												<code>{f.name}</code>
												<span class="muted">{f.type}{f.optional ? ', môže chýbať' : ''}</span>
											</dt>
											<dd>{f.description}</dd>
										{/each}
									</dl>
								</details>
							</td>
							<td class="num">{r.count}</td>
							<td class="dl">
								<a href="{data.apiBase}/{r.name}.csv" download>CSV</a>
								<a href="{data.apiBase}/{r.name}.json">JSON</a>
							</td>
						</tr>
					{/each}
					<tr>
						<td>
							<strong>História cien ako časové rady</strong>
							<span class="muted small desc"
								>Každý produkt raz, s cenou len v dni, keď sa zmenila – na grafy. Popis je v
								openapi.json.</span
							>
						</td>
						<td class="num"></td>
						<td class="dl"><a href="{data.apiBase}/historia-serie.json">JSON</a></td>
					</tr>
				</tbody>
			</table>
		</div>

		<h3>Príklad</h3>
		<pre><code
				>{`curl ${exampleUrl}

const { data } = await fetch('${exampleUrl}').then((r) => r.json());
const akcie = data.filter((p) => p.sale_until);`}</code
			></pre>
		<p class="muted small">
			Používaš dáta na niečo zaujímavé alebo ti niečo chýba? <a href="/navrhni">Napíš nám</a>.
		</p>
	</section>
</div>

<style>
	.tiles {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
		gap: 10px;
		margin: 18px 0 0;
	}
	.tiles div {
		padding: 12px 14px;
		border-radius: var(--radius-sm);
		background: var(--card);
		border: 1px solid var(--line);
	}
	.tiles dt {
		font-size: 0.8rem;
		color: var(--ink-2);
	}
	.tiles dd {
		margin: 2px 0;
		font-family: var(--font-display);
		font-size: 1.7rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.tiles .sub {
		margin: 2px 0 0;
		font-family: inherit;
		font-weight: 400;
		color: var(--muted);
		font-size: 0.78rem;
	}
	.jump {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 16px;
	}
	.box {
		margin-top: 20px;
		padding: 18px 20px;
	}
	@media (max-width: 599px) {
		.box {
			padding: 16px 14px;
		}
		.tiles {
			grid-template-columns: repeat(2, 1fr);
		}
	}
	.box h2 {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 0;
	}
	.small {
		font-size: 0.86rem;
	}
	.pick {
		display: inline-flex;
		margin-bottom: 12px;
		max-width: 100%;
	}
	.facts {
		margin: 12px 0 0;
	}
	.two {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		gap: 8px 24px;
	}
	.two h3 {
		font-size: 1rem;
		margin: 8px 0 6px;
	}
	.moves {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 6px;
	}
	.moves li {
		display: grid;
		grid-template-columns: 1fr auto auto;
		gap: 10px;
		align-items: baseline;
		font-size: 0.92rem;
		font-variant-numeric: tabular-nums;
	}
	.moves .muted {
		font-size: 0.8rem;
	}
	.what {
		display: grid;
		min-width: 0;
	}
	.what .muted {
		overflow-wrap: anywhere;
	}
	.up {
		color: color-mix(in srgb, var(--tomato) 70%, var(--ink));
	}
	.down {
		color: var(--leaf);
	}
	.filters {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
		margin-bottom: 8px;
	}
	.grow {
		flex: 1 1 240px;
	}
	.check {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-weight: 600;
	}
	.table-wrap {
		overflow-x: auto;
		margin: 0 -4px;
	}
	table {
		border-collapse: collapse;
		width: 100%;
		font-size: 0.88rem;
	}
	th,
	td {
		text-align: left;
		padding: 7px 8px;
		border-bottom: 1px solid var(--line);
		vertical-align: top;
	}
	th {
		font-size: 0.8rem;
		color: var(--ink-2);
		white-space: nowrap;
	}
	th button {
		border: 0;
		background: none;
		padding: 0;
		font: inherit;
		font-weight: 700;
		color: inherit;
		cursor: pointer;
	}
	th[aria-sort='ascending'] button::after {
		content: ' ↑';
	}
	th[aria-sort='descending'] button::after {
		content: ' ↓';
	}
	.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.prod {
		min-width: 200px;
	}
	.more {
		display: flex;
		justify-content: center;
		margin-top: 14px;
	}
	.standards {
		display: grid;
		gap: 6px;
		padding-left: 1.2em;
	}
	.resources .desc {
		display: block;
		margin: 2px 0 4px;
	}
	.resources summary {
		cursor: pointer;
		font-size: 0.82rem;
		color: var(--plum);
	}
	.fields {
		margin: 6px 0 0;
		font-size: 0.82rem;
	}
	.fields dt {
		margin-top: 6px;
	}
	.fields dd {
		margin: 0 0 0 12px;
		color: var(--ink-2);
	}
	.dl {
		white-space: nowrap;
	}
	.dl a {
		margin-right: 10px;
		font-weight: 700;
	}
	/* Wrapped instead of scrolling sideways: a scroll box would need keyboard focus too. */
	pre {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		padding: 12px 14px;
		border-radius: var(--radius-sm);
		background: var(--paper-2);
		font-size: 0.82rem;
	}
</style>
