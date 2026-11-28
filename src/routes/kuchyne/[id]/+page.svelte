<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import { SITE_ORIGIN } from '$lib/site';
	import { breadcrumbJsonLd } from '$lib/structured-data';
	import { useCatalog } from '$lib/catalog';
	import Icon from '$lib/components/Icon.svelte';
	import RecipeCard from '$lib/components/RecipeCard.svelte';

	let { data } = $props();
	const catalog = useCatalog();

	const cuisine = $derived(data.cuisine);
	const recipes = $derived(catalog.recipes.filter((r) => r.cuisine === cuisine.id));
</script>

<Seo
	title="{cuisine.name} kuchyňa – vegánske recepty"
	description="{cuisine.tagline} {recipes.length} vegánskych receptov na vyskúšanie."
	jsonLd={[
		breadcrumbJsonLd(
			[
				{ name: 'Kuchyne sveta', path: '/kuchyne' },
				{ name: cuisine.name, path: `/kuchyne/${cuisine.id}` }
			],
			SITE_ORIGIN
		)
	]}
/>

<div class="wrap page" style:--c={cuisine.color}>
	<a class="back" href="/kuchyne"><Icon name="arrow-left" size={18} /> Kuchyne</a>

	<header class="hero rise">
		<div class="deco" aria-hidden="true"></div>
		<p class="eyebrow">{cuisine.region}</p>
		<h1>{cuisine.name}</h1>
		<p class="lede">{cuisine.tagline}</p>
	</header>

	<div class="cols">
		<section class="card box">
			<h2 class="section-title"><Icon name="jar" size={22} /> Základy</h2>
			<!-- Badges, not chips: they only name things, there's nothing to tap. -->
			<ul class="chips staples" aria-label="Základné suroviny">
				{#each cuisine.staples as s (s)}<li class="badge">{s}</li>{/each}
			</ul>
		</section>
		<section class="card box">
			<h2 class="section-title"><Icon name="bowl" size={22} /> Čo si dať</h2>
			<ul>
				{#each cuisine.dishes as d (d)}<li>{d}</li>{/each}
			</ul>
		</section>
		<section class="card box pitfalls">
			<h2 class="section-title"><Icon name="alert" size={22} /> Na čo si dať pozor</h2>
			<ul>
				{#each cuisine.pitfalls as p (p)}<li>{p}</li>{/each}
			</ul>
		</section>
	</div>

	<section class="recipes">
		<h2>Recepty</h2>
		{#if recipes.length}
			<div class="grid">
				{#each recipes as recipe, i (recipe.id)}<RecipeCard {recipe} index={i} hideCuisine />{/each}
			</div>
		{:else}
			<p class="empty">Z tejto kuchyne tu zatiaľ recept nie je. Čoskoro pribudne.</p>
		{/if}
	</section>
</div>

<style>
	/* Its own stacking context: the blob sits behind the title, not behind the page. */
	.hero {
		position: relative;
		isolation: isolate;
		padding: var(--sp-5) 0;
	}
	.deco {
		position: absolute;
		right: 0;
		top: 0;
		width: min(30vw, 260px);
		aspect-ratio: 1;
		border-radius: 42% 58% 55% 45% / 48% 42% 58% 52%;
		background: color-mix(in srgb, var(--c) 18%, transparent);
		z-index: -1;
		pointer-events: none;
		animation: morph 12s ease-in-out infinite alternate;
	}
	@keyframes morph {
		to {
			border-radius: 58% 42% 45% 55% / 42% 58% 42% 58%;
			transform: rotate(20deg);
		}
	}
	.cols {
		display: grid;
		gap: 16px;
	}
	.section-title > :global(svg) {
		color: color-mix(in srgb, var(--c) 70%, var(--ink));
	}
	ul {
		margin: 0;
		padding-left: 1.2em;
	}
	.staples {
		padding: 0;
		list-style: none;
	}
	.staples .badge {
		margin: 0;
		font-size: var(--fs-sm);
	}
	li {
		margin: 6px 0;
	}
	li::marker {
		color: var(--c);
	}
	.pitfalls {
		background: var(--turmeric-soft);
		border: 0;
	}
	.pitfalls .section-title > :global(svg) {
		color: color-mix(in srgb, var(--turmeric) 60%, var(--ink));
	}
	.recipes {
		margin-top: 40px;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
		gap: 18px;
	}
	@media (min-width: 900px) {
		.cols {
			grid-template-columns: 1fr 1fr 1.2fr;
		}
	}
</style>
