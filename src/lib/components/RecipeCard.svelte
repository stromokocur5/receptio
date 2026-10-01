<script lang="ts">
	import { formatEur, formatNumber } from '$lib/amounts';
	import { useCatalog } from '$lib/catalog';
	import type { PantryMatch } from '$lib/pantry';
	import type { RecipeSummary } from '$lib/types';
	import CookedBadge from './CookedBadge.svelte';
	import GlutenBadge from './GlutenBadge.svelte';
	import Icon from './Icon.svelte';
	import LikeButton from './LikeButton.svelte';
	import { addToPlan, servingsInPlan, ui } from '$lib/state.svelte';
	import PlateArt from './PlateArt.svelte';
	import { vesselFor } from '$lib/categories';
	import { treatText } from '$lib/nutrition';
	import { flyToPlan } from '$lib/fly';

	let {
		recipe,
		match,
		index = 0
	}: { recipe: RecipeSummary; match?: PantryMatch; index?: number } = $props();

	const catalog = useCatalog();
	const cuisine = $derived(catalog.cuisinesById.get(recipe.cuisine));
	const inPlan = $derived(ui.loaded ? servingsInPlan(recipe.id) : 0);
	let justAdded = $state(false);

	function planIt(event: MouseEvent) {
		addToPlan(recipe.id, recipe.servings);
		const button = event.currentTarget as HTMLElement;
		flyToPlan(button, button.closest('.plate-host')?.querySelector('svg.plate'));
		justAdded = true;
		setTimeout(() => (justAdded = false), 1400);
	}
</script>

<article
	class="recipe-card card plate-host draw-host rise"
	style:--i={index}
	style:--accent={cuisine?.color}
>
	<div class="art">
		<div class="plate-wrap">
			<PlateArt
				seed={recipe.id}
				lines={recipe.lines}
				byId={catalog.ingredientsById}
				vessel={vesselFor(recipe.categories)}
				animate={false}
			/>
		</div>
		<div class="actions">
			<button
				class="plan-btn"
				class:added={justAdded}
				class:in-plan={inPlan > 0}
				title={inPlan ? `V pláne: ${inPlan} porcií – pridať ďalšie` : 'Pridať do plánu'}
				aria-label="Pridať {recipe.title} do plánu"
				onclick={planIt}
			>
				<Icon name={justAdded ? 'check' : inPlan ? 'calendar' : 'plus'} size={16} stroke={2.2} />
				{#if inPlan && !justAdded}<span>{inPlan}</span>{/if}
			</button>
			<LikeButton recipeId={recipe.id} compact />
		</div>
		{#if cuisine}<span class="cuisine">{cuisine.name}</span>{/if}
	</div>
	<div class="body">
		{#if cuisine}<span class="cuisine-inline">{cuisine.name}</span>{/if}
		<h3><a class="stretched" href="/recepty/{recipe.id}">{recipe.title}</a></h3>
		<div class="meta">
			<span title="Náročnosť {recipe.difficulty}/3">
				<Icon name="chef" size={16} />
				<span class="dots" aria-hidden="true">
					{#each [1, 2, 3] as d (d)}<i class:on={d <= recipe.difficulty}></i>{/each}
				</span>
				<span class="sr-only">Náročnosť {recipe.difficulty} z 3,</span>
			</span>
			<span><Icon name="clock" size={16} /> <span class="sr-only">čas</span> {recipe.time} min</span
			>
			{#if recipe.showNutrition}
				<span
					><Icon name="bean" size={16} /> <span class="sr-only">bielkoviny</span>
					{formatNumber(recipe.perServing.protein, 0)} g</span
				>
				<span
					><Icon name="flame" size={16} />
					{formatNumber(recipe.perServing.kcal, 0)} <span class="sr-only">kcal</span></span
				>
			{/if}
			<span
				title={recipe.costIsEstimate
					? `Čiastočne odhad – z obchodov ${Math.round(recipe.costKnownShare * 100)} % ceny`
					: 'Podľa aktuálnych cien'}
			>
				<Icon name="euro" size={16} />
				<span class="sr-only">porcia</span>
				{formatEur(recipe.costPerServing)}{recipe.costIsEstimate ? '*' : ''}
				{#if recipe.costIsEstimate}<span class="sr-only">(odhad)</span>{/if}
			</span>
		</div>
		<div class="badges">
			<GlutenBadge {recipe} />
			<CookedBadge recipeId={recipe.id} />
			{#if recipe.treat.length}<span class="badge tomato" title={treatText(recipe.treat)}
					>Na občas</span
				>{/if}
			{#if recipe.ahead}<span class="badge sky" title={recipe.ahead}>Pripraviť vopred</span>{/if}
			{#if match}
				{#if match.missing.length === 0 && match.short.length === 0 && match.swaps.length}
					<span
						class="badge leaf sticker"
						title={match.swaps.map((s) => `${s.use.name} namiesto: ${s.need.name}`).join(', ')}
						><Icon name="check" size={14} stroke={2.4} /> Máš všetko so zámenou: {match.swaps
							.map((s) => s.use.name.split(' (')[0].toLowerCase())
							.join(', ')}</span
					>
				{:else if match.missing.length === 0 && match.short.length === 0}
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
</article>

<style>
	.recipe-card {
		position: relative;
		display: flex;
		flex-direction: column;
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
	/* The title link covers the whole card; the buttons sit above it. */
	.stretched {
		color: inherit;
		text-decoration: none;
	}
	.stretched::after {
		content: '';
		position: absolute;
		inset: 0;
		z-index: 1;
	}
	.stretched:focus-visible {
		outline: none;
	}
	.recipe-card:has(.stretched:focus-visible) {
		outline: 3px solid var(--turmeric);
		outline-offset: 2px;
	}
	.actions {
		position: absolute;
		top: 10px;
		right: 10px;
		z-index: 2;
		display: flex;
		gap: 6px;
	}
	.plan-btn {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		height: 30px;
		min-width: 30px;
		justify-content: center;
		padding: 0 8px;
		border: 0;
		border-radius: 999px;
		background: color-mix(in srgb, var(--card) 88%, transparent);
		backdrop-filter: blur(6px);
		color: var(--ink-2);
		font-size: 0.8rem;
		font-weight: 700;
		transition:
			transform 0.25s var(--ease-spring),
			background 0.2s,
			color 0.2s;
	}
	.plan-btn:hover {
		transform: scale(1.08);
		color: var(--leaf);
	}
	.plan-btn.in-plan {
		color: var(--leaf);
	}
	.plan-btn.added {
		background: var(--leaf);
		color: var(--paper);
		transform: scale(1.12);
	}
	.cuisine {
		position: absolute;
		left: 12px;
		bottom: 10px;
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: color-mix(in srgb, var(--accent, var(--ink)) 45%, var(--ink));
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
	.dots {
		display: inline-flex;
		gap: 2px;
	}
	.dots i {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--line);
	}
	.dots i.on {
		background: var(--tomato);
	}
	.badges {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: auto;
	}
	.cuisine-inline {
		display: none;
	}

	/* On phones a card is a row: a small plate beside the text, so a screen shows several recipes. */
	@media (max-width: 560px) {
		.recipe-card {
			flex-direction: row;
		}
		.recipe-card:hover {
			transform: none;
		}
		.art {
			position: static;
			flex: none;
			display: grid;
			place-items: center;
			width: 108px;
			padding: 10px 8px;
		}
		.plate-wrap {
			width: 92px;
		}
		.art > .cuisine {
			display: none;
		}
		.actions {
			top: 8px;
			right: 8px;
		}
		.body {
			min-width: 0;
			padding: 10px 12px 12px;
			gap: 6px;
		}
		.cuisine-inline {
			display: block;
			padding-right: 84px;
			font-size: 0.68rem;
			font-weight: 700;
			letter-spacing: 0.06em;
			text-transform: uppercase;
			color: color-mix(in srgb, var(--accent, var(--ink)) 45%, var(--ink));
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}
		h3 {
			font-size: 1.02rem;
			line-height: 1.25;
		}
		.cuisine-inline + h3 {
			margin-top: -2px;
		}
		h3:first-child {
			padding-right: 84px;
		}
		.meta {
			gap: 2px 10px;
			font-size: 0.78rem;
		}
		.badges :global(.badge) {
			font-size: 0.7rem;
		}
	}
</style>
