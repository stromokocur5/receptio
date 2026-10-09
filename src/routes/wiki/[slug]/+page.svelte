<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import { SITE_ORIGIN } from '$lib/site';
	import { articleJsonLd, breadcrumbJsonLd } from '$lib/structured-data';
	import { useCatalog } from '$lib/catalog';
	import Icon, { isIconName } from '$lib/components/Icon.svelte';
	import RecipeCard from '$lib/components/RecipeCard.svelte';
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

	const siblings = $derived(
		catalog.wiki.filter((w) => w.section === page.section && w.slug !== page.slug)
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
				<p class="health-note">
					<Icon name="info" size={18} />
					<span
						>Všeobecné informácie, nie lekárska rada. Pri zdravotných problémoch, tehotenstve alebo
						liekoch sa pred zmenou poraď s lekárom.</span
					>
				</p>
			{/if}
		</div>
		{#if siblings.length}
			<aside class="side" data-noprint>
				<h2>Ďalej v sekcii</h2>
				<ul>
					{#each siblings as s (s.slug)}
						<li><a href="/wiki/{s.slug}">{s.title}</a></li>
					{/each}
				</ul>
			</aside>
		{/if}
	</div>

	{#if related.length}
		<section class="related" data-noprint>
			<h2>
				{BY_TAG[page.slug]
					? BY_TAG[page.slug].title
					: page.slug === 'zvysna-passata'
						? 'Recepty na zvyšok passaty'
						: page.slug === 'desiata-do-skoly' || page.slug === 'vysokoskolak'
							? 'Do krabičky'
							: page.slug === 'jedlo-na-cesty'
								? 'Na cesty'
								: page.section === 'zaklady'
									? 'Precvič si to v receptoch'
									: 'Recepty, ktoré pomôžu'}
			</h2>
			<div class="grid">
				{#each related as recipe, i (recipe.id)}<RecipeCard {recipe} index={i} />{/each}
			</div>
		</section>
	{/if}
</article>

<style>
	.page {
		padding-top: 18px;
	}
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
		display: flex;
		gap: 8px;
		align-items: flex-start;
		margin-top: 28px;
		padding: 12px 14px;
		border-radius: var(--radius-sm);
		background: var(--paper-2);
		color: var(--ink-2);
		font-size: 0.92rem;
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: var(--ink-2);
		text-decoration: none;
		font-weight: 600;
	}
	header {
		margin: 24px 0 8px;
	}
	.ico {
		display: inline-grid;
		place-items: center;
		width: 64px;
		height: 64px;
		border-radius: 22px;
		background: var(--leaf-soft);
		color: var(--leaf);
		transform: rotate(-5deg);
		margin-bottom: 14px;
	}
	.lede {
		font-size: 1.15rem;
		color: var(--ink-2);
		max-width: 40em;
	}
	.layout {
		display: grid;
		/* minmax(0, …) lets a wide table scroll inside the column instead of widening the page. */
		grid-template-columns: minmax(0, 1fr);
		gap: 30px;
	}
	.side h2 {
		font-size: 1.1rem;
	}
	.side ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 6px;
	}
	.related {
		margin-top: 48px;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
		gap: 18px;
	}
	@media (min-width: 960px) {
		.layout {
			grid-template-columns: minmax(0, 1fr) 260px;
		}
		.side {
			position: sticky;
			top: 90px;
			align-self: start;
		}
	}
</style>
