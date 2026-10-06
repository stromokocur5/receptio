<script lang="ts">
	import { useCatalog } from '$lib/catalog';
	import { settings } from '$lib/state.svelte';

	let { label = 'Kde nakupuješ?' }: { label?: string } = $props();

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
	<legend>{label}</legend>
	<div class="chips">
		{#each shops as shop (shop.id)}
			<button class="chip" aria-pressed={mine.includes(shop.id)} onclick={() => toggle(shop.id)}>
				<span class="sdot" style:background={shop.color}></span>
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
	<p class="muted small">
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
		margin-bottom: 8px;
		padding: 0;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.sdot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		flex: none;
	}
	.ghost {
		border-style: dashed;
	}
	p {
		margin: 8px 0 0;
	}
</style>
