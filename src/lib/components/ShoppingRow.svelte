<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';

	/**
	 * One line of a shopping list, the same on the own list (/plan) and a shared one (/zoznam):
	 * the whole row ticks the item off, with room for a price and buttons beside it.
	 */
	let {
		name,
		checked,
		ontoggle,
		note,
		end,
		after
	}: {
		name: string;
		checked: boolean;
		ontoggle: () => void;
		/** The quieter line under the name (amount, shop). */
		note?: Snippet;
		/** Inside the tap area, on the right (the price). */
		end?: Snippet;
		/** Buttons of their own after the row (who buys it, remove). */
		after?: Snippet;
	} = $props();
</script>

<li class="shop-row" class:checked>
	<label>
		<input type="checkbox" {checked} onchange={ontoggle} />
		<span class="tick" aria-hidden="true"><Icon name="check" size={14} stroke={3} /></span>
		<span class="nm">
			{name}
			{#if note}<small>{@render note()}</small>{/if}
		</span>
		{#if end}{@render end()}{/if}
	</label>
	{#if after}{@render after()}{/if}
</li>

<style>
	.shop-row {
		display: flex;
		align-items: center;
		gap: var(--sp-1);
	}
	label {
		flex: 1;
		min-width: 0;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--sp-3);
		/* A whole row to aim at with a thumb in the shop. */
		min-height: 48px;
		padding: 6px 0;
		cursor: pointer;
	}
	/* The real checkbox stays for keyboards and screen readers; the drawn one shows. */
	input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}
	.tick {
		display: grid;
		place-items: center;
		width: 26px;
		height: 26px;
		border-radius: var(--radius-xs);
		border: 2px solid var(--line);
		color: transparent;
		transition:
			background 0.2s,
			border-color 0.2s,
			transform 0.3s var(--ease-spring);
	}
	input:focus-visible + .tick {
		outline: 3px solid var(--turmeric);
		outline-offset: 2px;
	}
	.checked .tick {
		background: var(--leaf);
		border-color: var(--leaf);
		color: var(--paper);
		transform: rotate(-6deg);
	}
	.nm {
		display: flex;
		flex-direction: column;
		line-height: 1.35;
		transition: opacity 0.2s;
	}
	.nm small {
		color: var(--muted);
		font-size: var(--fs-sm);
	}
	.checked .nm {
		opacity: 0.5;
		text-decoration: line-through;
	}
	@media (prefers-reduced-motion: reduce) {
		.tick {
			transition: none;
		}
	}
</style>
