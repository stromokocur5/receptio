<script lang="ts">
	import { useCatalog } from '$lib/catalog';
	import { settings } from '$lib/state.svelte';

	/** `quiet`: the label is for screen readers only, under a heading that already says it. */
	let { label = 'Kde nakupuješ?', quiet = false }: { label?: string; quiet?: boolean } = $props();

	const catalog = useCatalog();
	/** Only the shops you walk into; e-shops are compared separately as bulk buys. */
	const shops = catalog.stores.filter(
		(s) => !s.online && catalog.prices.some((p) => p.storeId === s.id)
	);
	const mine = $derived(settings.current.myStores);

	function toggle(id: string) {
		const next = mine.includes(id) ? mine.filter((s) => s !== id) : [...mine, id];
		// Every shop ticked means the same as none: no filter.
		settings.current = {
			...settings.current,
			myStores: next.length === shops.length ? [] : next
		};
	}
</script>

<fieldset class="store-picker">
	<legend class:sr-only={quiet}>{label}</legend>
	<div class="chips">
		{#each shops as shop (shop.id)}
			<button class="chip" aria-pressed={mine.includes(shop.id)} onclick={() => toggle(shop.id)}>
				<span class="swatch" style:--c={shop.color}></span>
				{shop.name}
			</button>
		{/each}
		{#if mine.length}
			<button
				class="chip ghost"
				onclick={() => (settings.current = { ...settings.current, myStores: [] })}
			>
				Všetky obchody
			</button>
		{/if}
	</div>
	<p class="hint">
		{mine.length
			? 'Ceny a nákup rátame len v týchto obchodoch. Zapamätá sa to.'
			: 'Ťukni na obchody, kam chodíš – ceny a nákup sa prispôsobia.'}
	</p>
</fieldset>

<style>
	.store-picker {
		border: 0;
		padding: 0;
		margin: 0;
		min-width: 0;
	}
	legend {
		font-weight: 700;
		margin-bottom: var(--sp-2);
		padding: 0;
	}
	.ghost {
		border-style: dashed;
	}
</style>
