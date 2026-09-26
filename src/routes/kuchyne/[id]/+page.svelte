<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import { useCatalog } from '$lib/catalog';
	import Icon from '$lib/components/Icon.svelte';
	import RecipeCard from '$lib/components/RecipeCard.svelte';

	let { data } = $props();
	const catalog = useCatalog();

	const cuisine = $derived(data.cuisine);
	const recipes = $derived(catalog.recipes.filter((r) => r.cuisine === cuisine.id));
</script>

<Seo title="{cuisine.name} kuchyňa" description={cuisine.tagline} />

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
			<h2><Icon name="jar" size={22} /> Základy</h2>
			<div class="chips">
				{#each cuisine.staples as s (s)}<span class="chip">{s}</span>{/each}
			</div>
		</section>
		<section class="card box">
			<h2><Icon name="bowl" size={22} /> Čo si dať</h2>
			<ul>
				{#each cuisine.dishes as d (d)}<li>{d}</li>{/each}
			</ul>
		</section>
		<section class="card box pitfalls">
			<h2><Icon name="alert" size={22} /> Na čo si dať pozor</h2>
			<ul>
				{#each cuisine.pitfalls as p (p)}<li>{p}</li>{/each}
			</ul>
		</section>
	</div>

	<section class="recipes">
		<h2>Recepty</h2>
		{#if recipes.length}
			<div class="grid">
				{#each recipes as recipe, i (recipe.id)}<RecipeCard {recipe} index={i} />{/each}
			</div>
		{:else}
			<p class="muted">Z tejto kuchyne tu zatiaľ recept nie je. Pridáme čoskoro.</p>
		{/if}
	</section>
</div>

<style>
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
	.hero {
		position: relative;
		padding: 36px 0 24px;
	}
	.deco {
		position: absolute;
		right: 0;
		top: 10px;
		width: min(40vw, 260px);
		aspect-ratio: 1;
		border-radius: 42% 58% 55% 45% / 48% 42% 58% 52%;
		background: color-mix(in srgb, var(--c) 30%, transparent);
		z-index: -1;
		animation: morph 12s ease-in-out infinite alternate;
	}
	@keyframes morph {
		to {
			border-radius: 58% 42% 45% 55% / 42% 58% 42% 58%;
			transform: rotate(20deg);
		}
	}
	.lede {
		font-size: 1.15rem;
		color: var(--ink-2);
		max-width: 34em;
	}
	.cols {
		display: grid;
		gap: 16px;
	}
	.box {
		padding: 20px;
	}
	.box h2 {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 1.3rem;
	}
	.box :global(.icon) {
		color: var(--c);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	ul {
		margin: 0;
		padding-left: 1.2em;
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
	.pitfalls :global(.icon) {
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
