<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { install } from '$lib/install.svelte';
	import { pantry, plan, ui } from '$lib/state.svelte';
	import { syncState } from '$lib/sync.svelte';

	/**
	 * Safari on iPhone deletes a site's data after a week without a visit, unless it's on the home
	 * screen. Once someone has something to lose and nothing protects it, say so once.
	 */
	const KEY = 'receptio:safari-keep-seen';

	let dismissed = $state(true);
	$effect(() => {
		if (!ui.loaded) return;
		try {
			dismissed = localStorage.getItem(KEY) !== null;
		} catch {
			dismissed = true;
		}
	});

	const show = $derived(
		ui.loaded &&
			!dismissed &&
			install.hint === 'ios' &&
			!syncState.code &&
			(plan.current.length > 0 || Object.keys(pantry.current).length > 0)
	);

	function close() {
		dismissed = true;
		try {
			localStorage.setItem(KEY, new Date().toISOString().slice(0, 10));
		} catch {
			// Shown again next time; harmless.
		}
	}
</script>

{#if show}
	<div class="wrap keep" role="note">
		<Icon name="info" size={18} />
		<p>
			<strong>Safari maže dáta stránok, ktoré týždeň neotvoríš.</strong> Aby ti plán a špajza
			nezmizli, pridaj si Receptio na plochu (Zdieľať → „Pridať na plochu“) alebo
			<a href="/moje">zapni synchronizáciu</a>.
		</p>
		<button class="btn ghost small" onclick={close}>Rozumiem</button>
	</div>
{/if}

<style>
	.keep {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		align-items: flex-start;
		margin-top: 12px;
		padding: 12px 14px;
		border: 1.5px solid var(--line);
		border-left: 4px solid var(--sky);
		border-radius: var(--radius-sm);
		background: var(--paper);
	}
	.keep p {
		flex: 1 1 240px;
		margin: 0;
	}
</style>
