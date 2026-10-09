<script lang="ts">
	import { dismiss, toasts } from '$lib/toast.svelte';
	import Icon from './Icon.svelte';
</script>

<div class="toasts" role="status" aria-live="polite" data-noprint>
	{#each toasts as t (t.id)}
		<div class="toast">
			<span>{t.text}</span>
			{#if t.undo}
				<button
					class="undo"
					onclick={() => {
						t.undo?.();
						dismiss(t.id);
					}}><Icon name="undo" size={16} /> Vrátiť</button
				>
			{/if}
			<button class="x" aria-label="Zavrieť" onclick={() => dismiss(t.id)}>
				<Icon name="x" size={16} />
			</button>
		</div>
	{/each}
</div>

<style>
	.toasts {
		position: fixed;
		left: 50%;
		bottom: calc(96px + env(safe-area-inset-bottom));
		z-index: 60;
		display: grid;
		gap: 8px;
		width: min(440px, calc(100vw - 2 * var(--gutter)));
		transform: translateX(-50%);
		pointer-events: none;
	}
	@media (min-width: 900px) {
		.toasts {
			bottom: 24px;
		}
	}
	.toast {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px 4px 4px 16px;
		border-radius: 16px;
		background: var(--ink);
		color: var(--paper);
		box-shadow: var(--shadow-lift);
		font-size: var(--fs-md);
		font-weight: 600;
		pointer-events: auto;
		animation: up 0.3s var(--ease-spring);
	}
	.toast span {
		flex: 1;
		padding: 8px 0;
	}
	.toast button {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: var(--tap);
		border: 0;
		border-radius: 12px;
		background: none;
		color: inherit;
		font-weight: 700;
		padding: 0 12px;
	}
	.undo {
		color: var(--leaf-soft) !important;
	}
	.x {
		width: var(--tap);
		justify-content: center;
		padding: 0 !important;
		opacity: 0.7;
	}
	.toast button:hover {
		background: color-mix(in srgb, var(--paper) 12%, transparent);
	}
	@keyframes up {
		from {
			transform: translateY(12px);
			opacity: 0;
		}
	}
</style>
