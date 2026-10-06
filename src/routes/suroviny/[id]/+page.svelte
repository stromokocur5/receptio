<script lang="ts">
	import { yearsPhrase } from '$lib/garden';
	import { page } from '$app/state';
	import { formatEur } from '$lib/amounts';
	import { useCatalog } from '$lib/catalog';
	import GrowMonths from '$lib/components/GrowMonths.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import NutrientBars from '$lib/components/NutrientBars.svelte';
	import RecipeCard from '$lib/components/RecipeCard.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import { SITE_ORIGIN } from '$lib/site';
	import { breadcrumbJsonLd } from '$lib/structured-data';
	import { CATEGORY_ICONS } from '$lib/ingredient-icons';
	import { CATEGORY_LABELS, pluralRecipes } from '$lib/labels';
	import { ALLERGEN_LABELS, DAILY_REFERENCE } from '$lib/nutrition';
	import { bestPrice, isUsable, pricePerKg, shelfName, unitPrice } from '$lib/pricing';
	import { onMount } from 'svelte';
	import PriceChart from '$lib/components/PriceChart.svelte';
	import { ingredientTimeline, type PriceHistory } from '$lib/price-history';
	import { MONTH_NAMES } from '$lib/season';
	import type { PriceEntry } from '$lib/types';
	import { pantry, removePantryItem, setPantryItem, ui } from '$lib/state.svelte';

	let { data } = $props();
	const catalog = useCatalog();

	const ingredient = $derived(catalog.ingredientsById.get(page.params.id!)!);
	const info = $derived(data.info);
	const month = new Date().getMonth() + 1;

	const recipes = $derived(
		catalog.recipes.filter((r) => r.lines.some((l) => l.ingredientId === ingredient.id))
	);
	const RECIPE_PREVIEW = 6;
	let showAllRecipes = $state(false);

	/** Interchangeable forms tracked together in the pantry (dry vs canned chickpeas). */
	const groupMates = $derived(
		catalog.ingredients.filter((i) => i.group === ingredient.group && i.id !== ingredient.id)
	);
	const howto = $derived(
		ingredient.howto
			.map((slug) => catalog.wiki.find((w) => w.slug === slug))
			.filter((w) => w !== undefined)
	);
	const today = $derived(new Date(catalog.builtAt));
	const price = $derived(bestPrice(ingredient, catalog.prices, today));
	/** Every current price, cheapest per kg first. */
	const storePrices = $derived(
		catalog.prices
			.filter((p) => p.ingredientId === ingredient.id && isUsable(p, today))
			.sort((a, b) => pricePerKg(a) - pricePerKg(b))
	);
	const dayMonth = new Intl.DateTimeFormat('sk', { day: 'numeric', month: 'numeric' });

	/** Liquids compare per litre as on the shelf label, everything else per kg. */
	function perUnit(p: PriceEntry): string {
		const { value, unit } = unitPrice(p);
		return `${formatEur(value)} / ${unit}`;
	}
	/** Shop prices over time, fetched once and shared by every ingredient page visited. */
	let history = $state<PriceHistory | null>(null);
	onMount(async () => {
		try {
			const res = await fetch('/data/v1/historia-serie.json');
			if (res.ok) history = await res.json();
		} catch (err) {
			console.error('ingredient: price history failed', err);
		}
	});
	const walkInShops = catalog.stores.filter((s) => !s.online);
	const timeline = $derived(
		history
			? ingredientTimeline(
					history,
					ingredient.id,
					walkInShops.map((s) => s.id)
				)
			: null
	);
	const atHome = $derived(ui.loaded && ingredient.id in pantry.current);

	function toggleHome() {
		if (atHome) removePantryItem(ingredient.id);
		else setPantryItem(ingredient.id, null);
	}

	const GLUTEN_TEXT = {
		free: 'Bez lepku',
		risk: 'Môže obsahovať lepok – kontroluj etiketu',
		contains: 'Obsahuje lepok'
	} as const;
</script>

<Seo
	title={ingredient.name}
	description={info.about ??
		`${ingredient.name} – ako vybrať, ako skladovať, čím nahradiť a čo z toho uvariť.`}
	type="article"
	jsonLd={[
		breadcrumbJsonLd(
			[
				{ name: 'Suroviny', path: '/suroviny' },
				{ name: ingredient.name, path: `/suroviny/${ingredient.id}` }
			],
			SITE_ORIGIN
		)
	]}
/>

<article class="wrap page" style:--c={ingredient.color}>
	<a class="back" href="/suroviny" data-noprint><Icon name="arrow-left" size={18} /> Suroviny</a>

	<header class="head rise">
		<span class="blob" aria-hidden="true"
			><Icon name={CATEGORY_ICONS[ingredient.category]} size={34} /></span
		>
		<div>
			<p class="eyebrow">{CATEGORY_LABELS[ingredient.category]}</p>
			<h1>{ingredient.name}</h1>
			{#if info.about}<p class="lede">{info.about}</p>{/if}
			<div class="badges">
				<span class="badge {ingredient.gluten === 'free' ? 'leaf' : 'turmeric'}"
					>{GLUTEN_TEXT[ingredient.gluten]}</span
				>
				{#each ingredient.allergens as a (a)}
					<span class="badge turmeric">{ALLERGEN_LABELS[a]}</span>
				{/each}
				{#if ingredient.season.includes(month)}<span class="badge leaf">Práve v sezóne</span>{/if}
				{#if data.grow}<a class="badge leaf" href="#pestuj">Dá sa pestovať doma</a>{/if}
				{#if data.notGrown?.status === 'nie'}<span class="badge sky">U nás nerastie</span>{/if}
			</div>
			<div class="actions" data-noprint>
				<button class="btn {atHome ? 'leaf' : 'ghost'} small" onclick={toggleHome}>
					<Icon name={atHome ? 'check' : 'jar'} size={16} />
					{atHome ? 'Mám doma' : 'Pridať do špajze'}
				</button>
				<span class="muted small">
					{price.isEstimate ? 'odhad' : 'cena'}
					{formatEur(price.perKg)} / kg
				</span>
			</div>
		</div>
	</header>

	<div class="cols">
		<div class="text">
			{#if info.kinds.length}
				<section>
					<h2><Icon name="sparkle" size={20} /> Druhy</h2>
					<ul>
						{#each info.kinds as k, i (i)}<li>{k}</li>{/each}
					</ul>
				</section>
			{/if}
			{#if info.uses.length}
				<section>
					<h2><Icon name="pot" size={20} /> Na čo sa hodí</h2>
					<ul>
						{#each info.uses as u, i (i)}<li>{u}</li>{/each}
					</ul>
				</section>
			{/if}
			{#if info.homemade}
				<section class="homemade">
					<h2><Icon name="chef" size={20} /> Urob si sám</h2>
					{#if info.homemade.steps.length}
						<ol>
							{#each info.homemade.steps as step, i (i)}<li>{step}</li>{/each}
						</ol>
					{/if}
					{#if info.homemade.recipe}
						<a class="btn leaf small" href="/recepty/{info.homemade.recipe.id}">
							<Icon name="arrow-right" size={16} /> Recept: {info.homemade.recipe.title}
						</a>
					{/if}
					{#if info.homemade.note}<p class="muted">{info.homemade.note}</p>{/if}
				</section>
			{/if}
			{#if data.grow}
				<section class="grow" id="pestuj">
					<h2>
						<Icon
							name={data.grow.form === 'strom' || data.grow.form === 'ker'
								? 'tree'
								: data.grow.form === 'huba'
									? 'mushroom'
									: 'sprout'}
							size={20}
						/>
						{data.grow.form === 'strom'
							? `Rastie na strome – ${data.grow.name.toLowerCase()}`
							: data.grow.form === 'ker'
								? `Rastie na kri – ${data.grow.name.toLowerCase()}`
								: data.grow.form === 'popinava'
									? `Popínavá rastlina – ${data.grow.name.toLowerCase()}`
									: data.grow.form === 'huba'
										? 'Pestuj si huby'
										: 'Pestuj si sám'}
					</h2>
					<p class="grow-where">
						{data.grow.where
							.map(
								(w) =>
									({ parapet: 'v byte na okne', balkon: 'na balkóne', zahrada: 'v záhrade' })[w]
							)
							.join(', ')}
						· {['', 'ľahké', 'treba sa starať', 'pre pokročilých'][data.grow.level]}
						{#if data.grow.perennial && !data.grow.form}· trvalka{/if}
						{#if data.grow.heightM}· do {data.grow.heightM} m{/if}
						{#if data.grow.yearsToHarvest}· prvá úroda {yearsPhrase(data.grow.yearsToHarvest)}{/if}
					</p>
					{#if data.grow.pollination}<p class="muted">{data.grow.pollination}</p>{/if}
					<GrowMonths
						indoor={data.grow.indoor}
						sow={data.grow.sow}
						harvest={data.grow.harvest}
						legend
					/>
					<p>{data.grow.how}</p>
					{#if data.grow.tip}<p class="muted">{data.grow.tip}</p>{/if}
					{#if data.grow.problems.length}
						<p><strong>Na čo si dať pozor:</strong> {data.grow.problems.join(' ')}</p>
					{/if}
					<p><strong>Čo s úrodou:</strong> {data.grow.preserve}</p>
					<p class="muted"><strong>Vlastné semená:</strong> {data.grow.seeds}</p>
					<p class="grow-links">
						<a class="btn ghost small" href="/pestuj#p-{ingredient.id}">
							<Icon name="arrow-right" size={16} /> Celý návod a susedia
						</a>
						{#if data.grow.form === 'strom' || data.grow.form === 'ker'}
							<a class="btn ghost small" href="/wiki/ovocne-stromy">
								<Icon name="tree" size={16} /> Výsadba a rez
							</a>
						{:else if data.grow.form === 'huba'}
							<a class="btn ghost small" href="/wiki/huby">
								<Icon name="mushroom" size={16} /> Pestovanie húb
							</a>
						{/if}
						<a class="btn ghost small" href="/wiki/semena">
							<Icon name="seed" size={16} /> Semená
						</a>
					</p>
				</section>
			{:else if data.notGrown}
				<section class="grow">
					<h2><Icon name="globe" size={20} /> Odkiaľ to je</h2>
					<p>
						<strong
							>{data.notGrown.status === 'nie'
								? 'U nás sa pestovať nedá.'
								: 'U nás sa dá pestovať len ťažko.'}</strong
						>
						Pestuje sa hlavne: {data.notGrown.origin}.
					</p>
					{#if data.notGrown.note}<p class="muted">{data.notGrown.note}</p>{/if}
				</section>
			{/if}
			{#if info.choose}
				<section>
					<h2><Icon name="basket" size={20} /> Ako vybrať</h2>
					<p>{info.choose}</p>
				</section>
			{/if}
			{#if info.storage}
				<section>
					<h2><Icon name="fridge" size={20} /> Skladovanie</h2>
					<p>{info.storage}</p>
				</section>
			{/if}
			{#if ingredient.note || ingredient.warn}
				<section>
					{#if ingredient.warn}<p class="warn">
							<Icon name="alert" size={18} />
							{ingredient.warn}
						</p>{/if}
					{#if ingredient.note}<p class="muted">{ingredient.note}</p>{/if}
				</section>
			{/if}
		</div>

		<aside class="side">
			{#if data.swaps.length}
				<section class="card box swaps">
					<h2>Nemáš? Nahraď</h2>
					<ul>
						{#each data.swaps as s, i (i)}
							<li>
								{#if s.to}<a href="/suroviny/{s.to.id}">{s.to.name}</a>{/if}
								{#if s.to && s.note}–{/if}
								{#if s.note}{s.note}{/if}
							</li>
						{/each}
					</ul>
				</section>
			{/if}

			{#if storePrices.length}
				<section class="card box">
					<h2>Ceny v obchodoch</h2>
					<ul class="prices">
						{#each storePrices as p, i (i)}
							{@const store = catalog.storesById.get(p.storeId)}
							<li>
								<span class="sdot" style:background={store?.color}></span>
								<span class="pname">
									<strong>{store?.name ?? p.storeId}</strong>
									{#if p.online}<span class="badge" title="Cena bez dopravy">e-shop</span>{/if}
									{#if p.saleUntil}<span class="badge tomato"
											>akcia do {dayMonth.format(new Date(p.saleUntil))}</span
										>{/if}
									<small>{shelfName(p.product)} · {p.pack}</small>
								</span>
								<span class="pval">
									{formatEur(p.price)}
									<small>{perUnit(p)}</small>
								</span>
							</li>
						{/each}
					</ul>
					<p class="muted small">
						Ceny z {dayMonth.format(new Date(storePrices[0].date))}, väčšinou z
						<a href="/ceny">cenyslovensko.sk</a>. Pri zelenine na váhu je cena za kg.
					</p>
					{#if timeline && timeline.days.length >= 2}
						<div class="history">
							<PriceChart {timeline} stores={walkInShops} title="Vývoj ceny" />
							<p class="muted small">
								<a href="/data?s={ingredient.id}#vyvoj">Viac v dátach o cenách</a>
							</p>
						</div>
					{/if}
				</section>
			{/if}

			{#if ingredient.season.length}
				<section class="card box">
					<h2>Sezóna na Slovensku</h2>
					<ol class="months" aria-label="Mesiace v sezóne">
						{#each MONTH_NAMES as name, i (i)}
							<li
								class:on={ingredient.season.includes(i + 1)}
								class:now={i + 1 === month}
								title={name}
							>
								{name.slice(0, 3)}
							</li>
						{/each}
					</ol>
				</section>
			{/if}

			<section class="card box">
				<h2>Živiny na 100 g</h2>
				<NutrientBars
					values={ingredient.per100g}
					targets={DAILY_REFERENCE}
					keys={['kcal', 'protein', 'carbs', 'fat', 'fiber', 'iron', 'calcium', 'zinc']}
				/>
				<p class="muted small">Percentá z denného odporúčania pre dospelého.</p>
			</section>

			{#if groupMates.length || howto.length}
				<section class="card box">
					{#if groupMates.length}
						<h2>V špajzi sa zamieňa s</h2>
						<p>
							{#each groupMates as m, i (m.id)}{i ? ', ' : ''}<a href="/suroviny/{m.id}">{m.name}</a
								>{/each}
						</p>
					{/if}
					{#if howto.length}
						<h2>Návody</h2>
						<div class="links">
							{#each howto as h (h.slug)}
								<a class="chip" href="/wiki/{h.slug}"><Icon name="book" size={14} /> {h.title}</a>
							{/each}
						</div>
					{/if}
				</section>
			{/if}
		</aside>
	</div>

	<section class="recipes">
		<h2>
			{recipes.length
				? `${recipes.length} ${pluralRecipes(recipes.length)} s touto surovinou`
				: 'Zatiaľ v žiadnom recepte'}
		</h2>
		<div class="grid">
			{#each showAllRecipes ? recipes : recipes.slice(0, RECIPE_PREVIEW) as recipe, i (recipe.id)}
				<RecipeCard {recipe} index={i} />
			{/each}
		</div>
		{#if recipes.length > RECIPE_PREVIEW && !showAllRecipes}
			<button class="btn ghost more" onclick={() => (showAllRecipes = true)}>
				Všetky ({recipes.length})
			</button>
		{/if}
	</section>
</article>

<style>
	.grow-links {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.grow {
		scroll-margin-top: 90px;
	}
	.grow-where {
		color: var(--ink-2);
		font-weight: 600;
	}
	.page {
		padding-top: 18px;
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: var(--ink-2);
		text-decoration: none;
		font-weight: 600;
	}
	.head {
		display: grid;
		gap: 14px;
		align-items: start;
		margin-top: 12px;
	}
	@media (min-width: 600px) {
		.head {
			grid-template-columns: auto 1fr;
			gap: 20px;
		}
	}
	.blob {
		display: grid;
		place-items: center;
		width: 84px;
		height: 84px;
		border-radius: 46% 54% 50% 50% / 55% 45% 55% 45%;
		background: color-mix(in srgb, var(--c) 45%, var(--paper));
		color: color-mix(in srgb, var(--c) 40%, var(--ink));
		transform: rotate(-6deg);
	}
	h1 {
		margin: 0;
	}
	.lede {
		font-size: 1.08rem;
		color: var(--ink-2);
		max-width: 44em;
	}
	.badges {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px;
		margin-top: 14px;
	}
	.small {
		font-size: 0.84rem;
	}
	.cols {
		display: grid;
		gap: 24px;
		margin-top: 28px;
	}
	.text section {
		margin-bottom: 22px;
	}
	h2 {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 1.2rem;
		margin: 0 0 8px;
	}
	.text ul,
	.text ol {
		margin: 0;
		padding-left: 1.2em;
	}
	.cols > * {
		min-width: 0;
	}
	.homemade .btn {
		white-space: normal;
		text-align: left;
	}
	.homemade {
		padding: 16px 18px;
		border-radius: 16px;
		background: var(--leaf-soft);
	}
	.homemade ol + .btn,
	.homemade ol + p,
	.homemade .btn + p {
		margin-top: 12px;
	}
	.text li {
		margin: 5px 0;
	}
	.text p {
		margin: 0;
	}
	.warn {
		display: flex;
		gap: 8px;
		padding: 10px 12px;
		border-radius: 12px;
		background: var(--turmeric-soft);
	}
	.side {
		display: grid;
		gap: 16px;
		align-content: start;
	}
	.box {
		padding: 18px;
	}
	.box h2 + p,
	.box h2 + .links {
		margin-bottom: 14px;
	}
	.swaps {
		background: var(--turmeric-soft);
		border-color: transparent;
	}
	.swaps ul {
		margin: 0;
		padding-left: 1.1em;
	}
	.swaps li {
		margin: 5px 0;
	}
	.prices {
		list-style: none;
		margin: 0 0 10px;
		padding: 0;
	}
	.prices li {
		display: grid;
		grid-template-columns: auto 1fr auto;
		gap: 10px;
		align-items: start;
		padding: 8px 0;
		border-bottom: 1px dashed var(--line);
	}
	.sdot {
		width: 10px;
		height: 10px;
		margin-top: 6px;
		border-radius: 50%;
	}
	.pname small,
	.pval small {
		display: block;
		color: var(--muted);
		font-size: 0.8rem;
	}
	.pname .badge {
		margin-left: 4px;
	}
	.pval {
		text-align: right;
		font-weight: 700;
		white-space: nowrap;
	}
	.months {
		list-style: none;
		display: grid;
		grid-template-columns: repeat(6, 1fr);
		gap: 4px;
		margin: 0;
		padding: 0;
	}
	.months li {
		text-align: center;
		padding: 5px 0;
		border-radius: 8px;
		font-size: 0.78rem;
		font-weight: 650;
		background: var(--paper-2);
		color: var(--muted);
	}
	.months li.on {
		background: var(--leaf-soft);
		color: var(--leaf);
	}
	.months li.now {
		outline: 2px solid var(--ink);
		outline-offset: -2px;
	}
	.links {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.links .chip {
		text-decoration: none;
	}
	.recipes {
		margin-top: 36px;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
		gap: 18px;
	}
	.more {
		margin-top: 16px;
	}
	@media (min-width: 900px) {
		.cols {
			grid-template-columns: 1.2fr 1fr;
			gap: 40px;
		}
	}
	.history {
		margin-top: 18px;
		padding-top: 14px;
		border-top: 1px solid var(--line);
	}
</style>
