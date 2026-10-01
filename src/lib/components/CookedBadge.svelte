<script lang="ts">
	import { formatNumber } from '$lib/amounts';
	import { likes } from '$lib/state.svelte';
	import Icon from './Icon.svelte';

	let { recipeId }: { recipeId: string } = $props();

	const stats = $derived(likes.cooked[recipeId]);
</script>

{#if stats}
	<span
		class="badge leaf cooked"
		title="Podľa spätnej väzby ľudí, ktorí recept uvarili{stats.ratings
			? ` (hodnotení: ${stats.ratings})`
			: ''}"
	>
		{#if stats.cooked}<Icon name="check" size={14} stroke={2.4} /> Vyšlo {stats.cooked}×{/if}
		{#if stats.rating}
			<span class="stars"
				><Icon name="star" size={13} />
				<span class="sr-only">hodnotenie</span>
				{formatNumber(stats.rating, 1)}<span class="sr-only"> z 5</span></span
			>
		{/if}
	</span>
{/if}

<style>
	.cooked {
		gap: 0.5em;
	}
	.stars {
		display: inline-flex;
		align-items: center;
		gap: 2px;
	}
</style>
