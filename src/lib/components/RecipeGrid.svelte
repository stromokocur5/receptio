<script lang="ts">
	import { tick } from 'svelte';
	import type { RecipeSummary } from '$lib/types';
	import RecipeCard from './RecipeCard.svelte';

	/**
	 * A grid of recipe cards that shows the first few and a "Všetky (N)" button for the rest,
	 * so a list of a hundred dishes doesn't bury everything under it. Wrap it in {#key} when
	 * the list changes for a new question (another month), so it folds back up.
	 */
	let { recipes, preview = 12 }: { recipes: RecipeSummary[]; preview?: number } = $props();

	let showAll = $state(false);
	let grid: HTMLElement;
	const shown = $derived(showAll ? recipes : recipes.slice(0, preview));

	async function expand() {
		showAll = true;
		await tick();
		// The button is gone: keyboard and screen-reader users continue at the first new card.
		const firstNew = grid.querySelectorAll<HTMLElement>('article')[preview];
		firstNew?.querySelector<HTMLElement>('a')?.focus();
	}
</script>

<div class="recipe-grid" bind:this={grid}>
	{#each shown as recipe, i (recipe.id)}
		<RecipeCard {recipe} index={i % preview} />
	{/each}
</div>
{#if recipes.length > preview && !showAll}
	<button class="btn ghost more" onclick={expand}>Všetky ({recipes.length})</button>
{/if}

<style>
	.recipe-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
		gap: 18px;
	}
	.more {
		margin-top: var(--sp-4);
	}
</style>
