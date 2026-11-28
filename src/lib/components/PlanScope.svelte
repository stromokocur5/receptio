<script lang="ts">
	import Icon from './Icon.svelte';
	import { household, startSolo, stopSolo } from '$lib/household.svelte';

	let busy = $state(false);

	async function pick(forMe: boolean) {
		if (busy || forMe === household.solo) return;
		busy = true;
		try {
			await (forMe ? startSolo(false, null) : stopSolo());
		} finally {
			busy = false;
		}
	}
</script>

{#if household.doc}
	<div class="segmented scope" role="group" aria-label="Čí plán, nákup a špajza">
		<button aria-pressed={!household.solo} disabled={busy} onclick={() => pick(false)}>
			<Icon name="users" size={16} />
			{household.doc.name[0]}
		</button>
		<button aria-pressed={household.solo} disabled={busy} onclick={() => pick(true)}>
			<Icon name="sun" size={16} /> Len môj
		</button>
	</div>
{/if}

<style>
	.scope {
		max-width: 100%;
		margin-top: 14px;
	}
	button {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
