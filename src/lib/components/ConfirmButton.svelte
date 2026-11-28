<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon, { type IconName } from './Icon.svelte';

	/**
	 * For what can't be undone (delete from the server, leave the household): the first tap asks,
	 * the second does it. It goes back to normal after a few seconds or with "Zrušiť".
	 */
	let {
		onconfirm,
		children,
		confirm = 'Naozaj?',
		icon,
		small = false,
		disabled = false,
		why
	}: {
		onconfirm: () => void;
		children: Snippet;
		/** The armed label: short, it is a button. */
		confirm?: string;
		icon?: IconName;
		small?: boolean;
		disabled?: boolean;
		/** What will happen, shown above while armed. */
		why?: string;
	} = $props();

	let armed = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	function tap() {
		if (!armed) {
			armed = true;
			clearTimeout(timer);
			// Long enough to read `why`.
			timer = setTimeout(() => (armed = false), why ? 8000 : 4000);
			return;
		}
		clearTimeout(timer);
		armed = false;
		onconfirm();
	}
	function cancel() {
		clearTimeout(timer);
		armed = false;
	}
</script>

<span class="confirm" class:armed>
	{#if armed && why}<span class="why" role="status">{why}</span>{/if}
	<span class="row">
		<button
			type="button"
			class="btn danger"
			class:small
			class:armed
			{disabled}
			onclick={tap}
			aria-live="polite"
		>
			{#if icon}<Icon name={icon} size={small ? 16 : 18} />{/if}
			{#if armed}{confirm}{:else}{@render children()}{/if}
		</button>
		{#if armed}
			<button type="button" class="btn ghost" class:small onclick={cancel}>Zrušiť</button>
		{/if}
	</span>
</span>

<style>
	.confirm {
		display: inline-grid;
		gap: 8px;
		max-width: 100%;
	}
	.row {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.why {
		font-size: var(--fs-sm);
		color: var(--ink-2);
		max-width: 52ch;
	}
</style>
