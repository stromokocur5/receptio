<script lang="ts">
	import Icon from './Icon.svelte';
	import { preserves, setLeftovers, type CookUndo } from '$lib/state.svelte';

	/** Right after "cooked": the guess of what's left for later, to fix when more or less was eaten. */
	let { undo = $bindable(), name }: { undo: CookUndo; name: string } = $props();

	const count = $derived(preserves.current.find((p) => p.id === undo.leftoverId)?.count ?? 0);
	const change = (by: number) => (undo = setLeftovers(undo, count + by, name));
</script>

<span class="leftovers" role="group" aria-label="Porcie na neskôr v chladničke">
	<span>Na neskôr do <a href="/spajza#zavaraniny">chladničky</a>:</span>
	<button
		class="icon-btn"
		aria-label="O porciu menej"
		disabled={count === 0}
		onclick={() => change(-1)}
	>
		<Icon name="minus" size={16} />
	</button>
	<strong aria-live="polite"
		>{count}<span class="sr-only">
			{count === 1 ? 'porcia' : count > 1 && count < 5 ? 'porcie' : 'porcií'}</span
		></strong
	>
	<button class="icon-btn" aria-label="O porciu viac" onclick={() => change(1)}>
		<Icon name="plus" size={16} />
	</button>
</span>

<style>
	.leftovers {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sp-1);
	}
	strong {
		min-width: 1.6em;
		text-align: center;
		font-variant-numeric: tabular-nums;
	}
</style>
