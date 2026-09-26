<script lang="ts">
	import { formatEur, formatNumber } from '$lib/amounts';
	import { useCatalog } from '$lib/catalog';
	import type { PantryMatch } from '$lib/pantry';
	import type { RecipeSummary } from '$lib/types';
	import GlutenBadge from './GlutenBadge.svelte';
	import Icon from './Icon.svelte';
	import LikeButton from './LikeButton.svelte';
	import PlateArt from './PlateArt.svelte';

	let {
		recipe,
		match,
		index = 0
	}: { recipe: RecipeSummary; match?: PantryMatch; index?: number } = $props();

	const catalog = useCatalog();
	const cuisine = $derived(catalog.cuisinesById.get(recipe.cuisine));
</script>

<a
	class="recipe-card card plate-host draw-host rise"
	href="/recepty/{recipe.id}"
	style:--i={index}
	style:--accent={cuisine?.color}
>
	<div class="art">
		<div class="plate-wrap">
			<PlateArt
				seed={recipe.id}
				lines={recipe.lines}
				byId={catalog.ingredientsById}
				animate={false}
			/>
		</div>
		<div class="like-slot"><LikeButton recipeId={recipe.id} compact /></div>
		{#if cuisine}<span class="cuisine">{cuisine.name}</span>{/if}
	</div>
	<div class="body">
		<h3>{recipe.title}</h3>
		<div class="meta">
			<span><Icon name="clock" size={16} /> {recipe.time} min</span>
			<span><Icon name="bean" size={16} /> {formatNumber(recipe.perServing.protein, 0)} g</span>
			<span><Icon name="flame" size={16} /> {formatNumber(recipe.perServing.kcal, 0)}</span>
			<span title={recipe.costIsEstimate ? 'Odhad ceny' : 'Podľa aktuálnych cien'}>
				<Icon name="euro" size={16} />
				{formatEur(recipe.costPerServing)}{recipe.costIsEstimate ? '*' : ''}
			</span>
		</div>
		<div class="badges">
			<GlutenBadge {recipe} />
			{#if match}
				{#if match.missing.length === 0 && match.short.length === 0}
					<span class="badge leaf sticker"
						><Icon name="check" size={14} stroke={2.4} /> Máš všetko</span
					>
				{:else}
					<span class="badge turmeric missing">
						Chýba: {[...match.missing, ...match.short]
							.slice(0, 3)
							.map((i) => i.name.split(' (')[0].toLowerCase())
							.join(', ')}{match.missing.length + match.short.length > 3 ? '…' : ''}
					</span>
				{/if}
			{/if}
		</div>
	</div>
</a>

<style>
	.recipe-card {
		display: flex;
		flex-direction: column;
		text-decoration: none;
		color: inherit;
		overflow: hidden;
		transition:
			transform 0.35s var(--ease-spring),
			box-shadow 0.35s;
		animation-delay: calc(min(var(--i), 12) * 45ms);
	}
	.recipe-card:hover {
		transform: translateY(-5px) rotate(-0.4deg);
		box-shadow: var(--shadow-lift);
	}
	.art {
		position: relative;
		background:
			radial-gradient(
				circle at 30% 20%,
				color-mix(in srgb, var(--accent, var(--leaf-2)) 26%, transparent),
				transparent 60%
			),
			color-mix(in srgb, var(--accent, var(--leaf-2)) 12%, var(--paper-2));
		padding: 18px 18px 10px;
	}
	.plate-wrap {
		width: min(78%, 220px);
		margin: 0 auto;
		transition: transform 0.6s var(--ease-spring);
	}
	.recipe-card:hover .plate-wrap {
		transform: scale(1.04);
	}
	.like-slot {
		position: absolute;
		top: 10px;
		right: 10px;
	}
	.cuisine {
		position: absolute;
		left: 12px;
		bottom: 10px;
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: color-mix(in srgb, var(--accent, var(--ink)) 60%, var(--ink));
		background: color-mix(in srgb, var(--card) 85%, transparent);
		padding: 0.2em 0.6em;
		border-radius: 999px;
	}
	.body {
		padding: 14px 18px 18px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		flex: 1;
	}
	h3 {
		margin: 0;
		font-size: 1.2rem;
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 14px;
		font-size: 0.85rem;
		color: var(--ink-2);
		font-variant-numeric: tabular-nums;
	}
	.meta span {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
	.missing {
		white-space: normal;
	}
	.badges {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: auto;
	}
</style>
