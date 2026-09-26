<script lang="ts">
	import { useCatalog } from '$lib/catalog';
	import Icon, { isIconName } from '$lib/components/Icon.svelte';
	import RecipeCard from '$lib/components/RecipeCard.svelte';
	import Seo from '$lib/components/Seo.svelte';

	let { data } = $props();
	const catalog = useCatalog();

	const tool = $derived(data.tool);
	const LEVEL_TEXT = {
		zaklad: 'Základná výbava',
		uzitocne: 'Oplatí sa mať',
		specialne: 'Na pár receptov'
	} as const;
	/** Tools the recipe list can filter out ("Nemám doma"). */
	const FILTERABLE = new Set(['rura', 'mixer', 'sekacik', 'teplomer']);

	const recipes = $derived(catalog.recipes.filter((r) => r.equipment.includes(tool.id)));
	const RECIPE_PREVIEW = 6;
	let showAll = $state(false);
</script>

<Seo title={tool.name} description={tool.about} type="article" />

<article class="wrap page">
	<a class="back" href="/vybavenie" data-noprint
		><Icon name="arrow-left" size={18} /> Vybavenie kuchyne</a
	>

	<header class="head rise">
		<span class="ico" aria-hidden="true"
			><Icon name={isIconName(tool.icon) ? tool.icon : 'spoon'} size={40} /></span
		>
		<div>
			<p class="eyebrow">{LEVEL_TEXT[tool.level]}</p>
			<h1>{tool.name}</h1>
			<p class="lede">{tool.about}</p>
		</div>
	</header>

	<div class="cols">
		<div class="text">
			{#if tool.uses.length}
				<section>
					<h2><Icon name="pot" size={20} /> Na čo sa používa</h2>
					<ul>
						{#each tool.uses as u, i (i)}<li>{u}</li>{/each}
					</ul>
				</section>
			{/if}
			{#if tool.kinds.length}
				<section>
					<h2><Icon name="sparkle" size={20} /> Druhy</h2>
					<ul>
						{#each tool.kinds as k, i (i)}<li>{k}</li>{/each}
					</ul>
				</section>
			{/if}
			{#if tool.choose}
				<section>
					<h2><Icon name="basket" size={20} /> Ako vybrať</h2>
					<p>{tool.choose}</p>
				</section>
			{/if}
			{#if tool.care}
				<section>
					<h2><Icon name="drop" size={20} /> Starostlivosť</h2>
					<p>{tool.care}</p>
				</section>
			{/if}
		</div>
		<aside class="card box alt">
			<h2>Nemáš? Toto funguje tiež</h2>
			<ul>
				{#each tool.alternatives as a, i (i)}<li>{a}</li>{/each}
			</ul>
			{#if FILTERABLE.has(tool.id)}
				<a class="filter-link" href="/recepty?nemam={tool.id}">
					Recepty, ktoré ho nepotrebujú <Icon name="arrow-right" size={14} />
				</a>
			{/if}
		</aside>
	</div>

	{#if recipes.length}
		<section class="recipes">
			<h2>Treba ho v {recipes.length === 1 ? '1 recepte' : `${recipes.length} receptoch`}</h2>
			<div class="grid">
				{#each showAll ? recipes : recipes.slice(0, RECIPE_PREVIEW) as recipe, i (recipe.id)}
					<RecipeCard {recipe} index={i} />
				{/each}
			</div>
			{#if recipes.length > RECIPE_PREVIEW && !showAll}
				<button class="btn ghost more" onclick={() => (showAll = true)}>
					Všetky ({recipes.length})
				</button>
			{/if}
		</section>
	{/if}
</article>

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
	.ico {
		display: grid;
		place-items: center;
		width: 84px;
		height: 84px;
		border-radius: 24px;
		background: var(--leaf-soft);
		color: var(--leaf);
		transform: rotate(-5deg);
	}
	h1 {
		margin: 0;
	}
	.lede {
		font-size: 1.08rem;
		color: var(--ink-2);
		max-width: 44em;
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
	.alt ul {
		margin: 0;
		padding-left: 1.2em;
	}
	.text li,
	.alt li {
		margin: 5px 0;
	}
	.text p {
		margin: 0;
	}
	.box {
		padding: 18px;
		align-self: start;
	}
	.alt {
		background: var(--turmeric-soft);
		border-color: transparent;
	}
	.filter-link {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		margin-top: 12px;
		font-weight: 650;
		font-size: 0.9rem;
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
			grid-template-columns: 1.3fr 1fr;
			gap: 40px;
		}
	}
</style>
