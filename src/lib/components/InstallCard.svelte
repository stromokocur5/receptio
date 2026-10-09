<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { acceptInstall, dismissInstall, install } from '$lib/install.svelte';

	/** Why now: the home page says it in general, the shopping list says it about the shop. */
	let { title = 'Pridaj si Receptio na plochu', why = 'recepty aj plán máš aj offline' } = $props<{
		title?: string;
		why?: string;
	}>();
</script>

{#if install.offer}
	<div class="card install accent-edge">
		<span class="i-icon"><Icon name="download" size={24} /></span>
		<div>
			<strong>{title}</strong>
			<p>
				{install.prompt
					? `Otvorí sa ako appka, bez panela prehliadača, a ${why}.`
					: install.hint === 'ios'
						? `Ťukni na Zdieľať a potom na „Pridať na plochu“ – ${why}.`
						: `Otvor menu prehliadača (⋮) a ťukni na „Pridať na plochu“ alebo „Inštalovať“ – ${why}.`}
			</p>
		</div>
		<div class="i-actions">
			{#if install.prompt}
				<button class="btn leaf small" onclick={acceptInstall}>Pridať</button>
			{/if}
			<button class="btn ghost small" onclick={dismissInstall}>Nie, ďakujem</button>
		</div>
	</div>
{/if}

<style>
	.install {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sp-3) var(--sp-4);
		padding: 14px var(--sp-4) 14px 20px;
		animation: rise 0.5s var(--ease-out) both;
	}
	.install > div:first-of-type {
		flex: 1 1 220px;
	}
	.install p {
		margin: 2px 0 0;
		font-size: var(--fs-md);
		color: var(--ink-2);
	}
	.i-icon {
		display: grid;
		place-items: center;
		flex: none;
		width: 44px;
		height: 44px;
		border-radius: var(--radius-sm);
		background: var(--leaf-soft);
		color: var(--leaf);
	}
	.i-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		margin-left: auto;
	}
	@media (prefers-reduced-motion: reduce) {
		.install {
			animation: none;
		}
	}
</style>
