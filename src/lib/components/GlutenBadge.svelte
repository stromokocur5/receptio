<script lang="ts">
	import Icon from './Icon.svelte';
	import type { RecipeSummary } from '$lib/types';

	let { recipe }: { recipe: Pick<RecipeSummary, 'gluten' | 'gfSwappable'> } = $props();
</script>

{#if recipe.gluten === 'free'}
	<span class="badge leaf" title="Všetky suroviny sú bezlepkové">
		<Icon name="wheat-off" size={14} stroke={2} /> Bezlepkové
	</span>
{:else if recipe.gluten === 'risk'}
	<span
		class="badge turmeric"
		title="Niektorá surovina (bujón, tortilly…) môže obsahovať lepok – skontroluj etiketu"
	>
		<Icon name="wheat-off" size={14} stroke={2} /> Asi bezlepkové
	</span>
{:else if recipe.gfSwappable}
	<span
		class="badge sky"
		title="Obsahuje lepok, ale má bezlepkovú verziu – lepkové suroviny stačí vymeniť"
	>
		<Icon name="wheat" size={14} stroke={2} /> Má bezlepkovú verziu
	</span>
{:else}
	<span class="badge tomato" title="Obsahuje lepok">
		<Icon name="wheat" size={14} stroke={2} /> S lepkom
	</span>
{/if}
