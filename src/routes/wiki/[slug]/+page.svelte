<script lang="ts">
	import '$lib/styles/wiki-art.css';
	import Seo from '$lib/components/Seo.svelte';
	import { SITE_ORIGIN } from '$lib/site';
	import { articleJsonLd, breadcrumbJsonLd } from '$lib/structured-data';
	import { useCatalog } from '$lib/catalog';
	import Icon, { isIconName } from '$lib/components/Icon.svelte';
	import RecipeGrid from '$lib/components/RecipeGrid.svelte';
	import type { NutrientKey } from '$lib/types';

	let { data } = $props();
	const catalog = useCatalog();

	const page = $derived(data.page);

	/** Supplement pages show the recipes richest in that nutrient. */
	const NUTRIENT_FOR: Record<string, NutrientKey> = {
		zelezo: 'iron',
		vapnik: 'calcium',
		zinok: 'zinc',
		'omega-3': 'ala',
		bielkoviny: 'protein',
		'jedlo-a-cvicenie': 'protein'
	};

	/** Guides that collect recipes by tag, with the heading above them. */
	const BY_TAG: Record<string, { tag: string; title: string }> = {
		'pizzeria-doma': { tag: 'pizza', title: 'Pizze na vyskúšanie' },
		'varenie-pre-vela-ludi': { tag: 'pre-vela-ludi', title: 'Recepty pre 20 a viac ľudí' },
		'ranajky-v-tortille': { tag: 'tortilla-na-tyzden', title: 'Tortilly na celý týždeň' },
		jogurty: { tag: 'jogurt', title: 'Jogurty a čo z nich' }
	};
	const passataGrams = (r: (typeof catalog.recipes)[number]) =>
		r.lines.filter((l) => l.ingredientId === 'passata').reduce((sum, l) => sum + l.grams, 0);

	const related = $derived.by(() => {
		const byTag = BY_TAG[page.slug];
		if (byTag) return catalog.recipes.filter((r) => r.tags.includes(byTag.tag));
		if (page.slug === 'zvysna-passata') {
			// Least passata first: what fits the rest of an opened bottle.
			return catalog.recipes
				.filter((r) => passataGrams(r) > 0 && passataGrams(r) <= 600)
				.sort((a, b) => passataGrams(a) - passataGrams(b))
				.slice(0, 9);
		}
		if (page.slug === 'lacne-bielkoviny') {
			return [...catalog.recipes]
				.filter((r) => r.showNutrition)
				.sort(
					(a, b) =>
						b.perServing.protein / b.costPerServing - a.perServing.protein / a.costPerServing
				)
				.slice(0, 3);
		}
		if (['desiata-do-skoly', 'vysokoskolak', 'jedlo-na-cesty'].includes(page.slug)) {
			return catalog.recipes
				.filter((r) =>
					page.slug !== 'jedlo-na-cesty'
						? r.tags.includes('do-krabicky')
						: r.categories.includes('snacky/na-cesty')
				)
				.slice(0, 6);
		}
		const nutrient = NUTRIENT_FOR[page.slug];
		if (nutrient) {
			return [...catalog.recipes]
				.sort((a, b) => b.perServing[nutrient] - a.perServing[nutrient])
				.slice(0, 3);
		}
		if (page.section === 'zaklady') {
			return catalog.recipes
				.filter((r) =>
					r.lines.some((l) =>
						catalog.ingredientsById.get(l.ingredientId)?.howto.includes(page.slug)
					)
				)
				.slice(0, 3);
		}
		return [];
	});

	function relatedTitle(): string {
		if (BY_TAG[page.slug]) return BY_TAG[page.slug].title;
		if (page.slug === 'zvysna-passata') return 'Recepty na zvyšok passaty';
		if (page.slug === 'desiata-do-skoly' || page.slug === 'vysokoskolak') return 'Do krabičky';
		if (page.slug === 'jedlo-na-cesty') return 'Na cesty';
		if (page.section === 'zaklady') return 'Precvič si to v receptoch';
		return 'Recepty, ktoré pomôžu';
	}

	/** The section in the wiki's own order; this article's neighbours come from it. */
	const section = $derived(catalog.wiki.filter((w) => w.section === page.section));
	const at = $derived(section.findIndex((w) => w.slug === page.slug));
	/** Previous and next read on within the group, as the wiki's index lists it. */
	const series = $derived(section.filter((w) => w.group === page.group));
	const inSeries = $derived(series.findIndex((w) => w.slug === page.slug));
	const prev = $derived(inSeries > 0 ? series[inSeries - 1] : undefined);
	const next = $derived(inSeries >= 0 ? series[inSeries + 1] : undefined);
	/**
	 * A handful of the closest articles (same group first), not the whole section: some
	 * sections have fifty, and a wall of links is no help in choosing one.
	 */
	const nearby = $derived(
		section
			.map((w, i) => ({ w, distance: Math.abs(i - at) + (w.group === page.group ? 0 : 100) }))
			.filter(({ w }) => w.slug !== page.slug && w !== prev && w !== next)
			.sort((a, b) => a.distance - b.distance)
			.slice(0, 5)
			.map(({ w }) => w)
	);
</script>

<Seo
	title={page.title}
	description={page.summary}
	type="article"
	jsonLd={[
		articleJsonLd(
			{ title: page.title, summary: page.summary, path: `/wiki/${page.slug}` },
			SITE_ORIGIN
		),
		breadcrumbJsonLd(
			[
				{ name: 'Wiki', path: '/wiki' },
				{ name: page.title, path: `/wiki/${page.slug}` }
			],
			SITE_ORIGIN
		)
	]}
/>

<article class="wrap page">
	<div class="top" data-noprint>
		<a class="back" href="/wiki"><Icon name="arrow-left" size={18} /> Wiki</a>
		<button class="btn ghost small" onclick={() => window.print()}>
			<Icon name="printer" size={16} /> Vytlačiť
		</button>
	</div>
	<header class="rise">
		<span class="ico"
			><Icon name={isIconName(page.icon) ? page.icon : 'leaf'} size={34} draw /></span
		>
		<h1>{page.title}</h1>
		<p class="lede">{page.summary}</p>
	</header>

	<div class="layout">
		<div class="prose">
			<!-- eslint-disable-next-line svelte/no-at-html-tags -- markdown from the repo's own content/ -->
			{@html page.html}
			{#if page.section === 'suplementy' || page.section === 'pohyb'}
				<p class="notice health-note">
					<Icon name="info" size={18} />
					<span
						>Všeobecné informácie, nie lekárska rada. Pri zdravotných problémoch, tehotenstve alebo
						liekoch sa pred zmenou poraď s lekárom.</span
					>
				</p>
			{/if}
			{#if prev || next}
				<nav class="pager" aria-label="Predchádzajúci a ďalší návod" data-noprint>
					{#if prev}
						<a class="card prev" href="/wiki/{prev.slug}" rel="prev">
							<span class="dir"><Icon name="arrow-left" size={14} /> Predchádzajúci</span>
							<strong>{prev.title}</strong>
						</a>
					{/if}
					{#if next}
						<a class="card next" href="/wiki/{next.slug}" rel="next">
							<span class="dir">Ďalší <Icon name="arrow-right" size={14} /></span>
							<strong>{next.title}</strong>
						</a>
					{/if}
				</nav>
			{/if}
		</div>
		{#if nearby.length}
			<aside class="side" data-noprint>
				<h2>Ďalej v sekcii</h2>
				<ul>
					{#each nearby as s (s.slug)}
						<li><a href="/wiki/{s.slug}">{s.title}</a></li>
					{/each}
				</ul>
				<a class="all" href="/wiki#{page.section}">
					Všetky návody v sekcii ({section.length})
					<Icon name="arrow-right" size={14} />
				</a>
			</aside>
		{/if}
	</div>

	{#if related.length}
		<section class="related" data-noprint>
			<h2>{relatedTitle()}</h2>
			<RecipeGrid recipes={related} preview={6} />
		</section>
	{/if}
</article>

<style>
	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	/* On paper the guide is a kitchen card: full width, drawings kept, no page chrome. */
	@media print {
		.page {
			padding-top: 0;
		}
		.layout {
			display: block !important;
		}
		:global(.tech-art) {
			break-inside: avoid;
			max-width: 12cm;
		}
		:global(.prose table) {
			break-inside: avoid;
		}
	}
	.health-note {
		margin-top: var(--sp-5);
	}
	header {
		margin: var(--sp-4) 0 var(--sp-2);
	}
	.ico {
		display: inline-grid;
		place-items: center;
		width: 64px;
		height: 64px;
		border-radius: var(--radius);
		background: var(--leaf-soft);
		color: var(--leaf);
		transform: rotate(-5deg);
		margin-bottom: 14px;
	}
	.layout {
		display: grid;
		/* minmax(0, …) lets a wide table scroll inside the column instead of widening the page. */
		grid-template-columns: minmax(0, 1fr);
		gap: 30px;
	}
	.side h2 {
		font-size: var(--fs-lg);
	}
	.side ul {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	/* Each title is a whole row to tap, not just its words. */
	.side li a {
		display: flex;
		align-items: center;
		min-height: var(--tap);
		padding: var(--sp-1) 0;
		line-height: 1.3;
	}
	.all {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		min-height: var(--tap);
		margin-top: var(--sp-2);
		color: var(--ink-2);
		font-weight: 650;
		font-size: var(--fs-sm);
	}
	/* Previous on the left, next on the right, also when only one of them exists. */
	.pager {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--sp-3);
		margin-top: var(--sp-6);
	}
	.pager a {
		display: grid;
		gap: 2px;
		padding: var(--sp-3) var(--sp-4);
		border-radius: var(--radius-sm);
		color: inherit;
		text-decoration: none;
		transition:
			transform 0.3s var(--ease-spring),
			box-shadow 0.3s;
	}
	.pager a:hover {
		transform: translateY(-2px);
		box-shadow: var(--shadow-lift);
	}
	.pager .next {
		text-align: right;
	}
	@media (min-width: 600px) {
		.pager {
			grid-template-columns: 1fr 1fr;
		}
		.pager .next {
			grid-column: 2;
		}
	}
	.dir {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: var(--fs-sm);
		color: var(--muted);
	}
	.next .dir {
		justify-content: flex-end;
	}
	.related {
		margin-top: var(--sp-7);
	}
	@media (min-width: 960px) {
		.layout {
			grid-template-columns: minmax(0, 1fr) 260px;
		}
		.side {
			position: sticky;
			top: calc(var(--header-h) + var(--sp-5));
			align-self: start;
		}
	}
</style>
