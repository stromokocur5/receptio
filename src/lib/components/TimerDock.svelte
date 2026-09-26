<script lang="ts">
	import { formatDuration } from '$lib/cooking';
	import Icon from '$lib/components/Icon.svelte';
	import { addTime, kitchen, remaining, stopTimer } from '$lib/timers.svelte';

	/** `floating` pins it above the mobile nav; inline sits inside the cooking screen. */
	let { floating = false }: { floating?: boolean } = $props();
</script>

{#if kitchen.timers.length}
	<ul class="dock" class:floating aria-label="Časovače" data-noprint>
		{#each kitchen.timers as timer (timer.id)}
			{@const ringing = kitchen.ringing.includes(timer.id)}
			{@const left = remaining(timer)}
			<li class:ringing>
				<span class="ico"><Icon name={ringing ? 'bell' : 'timer'} size={18} /></span>
				<a class="label" href="/recepty/{timer.recipeId}">{timer.label}</a>
				<span class="time" aria-live={ringing ? 'assertive' : 'off'}>
					{ringing ? 'Hotovo!' : formatDuration(left)}
				</span>
				<button class="more" onclick={() => addTime(timer.id, 60)} aria-label="Pridať minútu">
					+1
				</button>
				<button
					class="stop"
					onclick={() => stopTimer(timer.id)}
					aria-label={ringing ? 'Vypnúť budík' : 'Zrušiť časovač'}
				>
					<Icon name={ringing ? 'check' : 'x'} size={16} stroke={2.4} />
				</button>
				{#if !ringing}
					<span
						class="bar"
						style:transform="scaleX({Math.max(0, Math.min(1, left / timer.seconds))})"
						aria-hidden="true"
					></span>
				{/if}
			</li>
		{/each}
	</ul>
{/if}

<style>
	.dock {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 8px;
	}
	.dock.floating {
		position: fixed;
		right: 12px;
		left: 12px;
		bottom: calc(92px + env(safe-area-inset-bottom));
		z-index: 60;
		max-width: 380px;
		margin-left: auto;
	}
	li {
		position: relative;
		overflow: hidden;
		display: grid;
		grid-template-columns: auto 1fr auto auto auto;
		align-items: center;
		gap: 8px;
		padding: 8px 8px 8px 12px;
		border-radius: 16px;
		background: var(--ink);
		color: var(--paper);
		box-shadow: var(--shadow-lift);
		animation: rise 0.35s var(--ease-out);
	}
	li.ringing {
		background: var(--tomato);
		animation: shake 0.6s ease-in-out infinite;
	}
	.label {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 0.85rem;
		font-weight: 600;
		color: inherit;
		text-decoration: none;
		opacity: 0.85;
	}
	.time {
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 1.15rem;
		font-variant-numeric: tabular-nums;
	}
	button {
		display: grid;
		place-items: center;
		min-width: 34px;
		height: 34px;
		border: 0;
		border-radius: 12px;
		background: color-mix(in srgb, var(--paper) 16%, transparent);
		color: inherit;
		font-weight: 700;
		font-size: 0.8rem;
	}
	.ringing .stop {
		background: var(--paper);
		color: var(--tomato);
	}
	.bar {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: 3px;
		background: var(--leaf-2);
		transform-origin: left;
		transition: transform 0.25s linear;
	}
	@keyframes shake {
		0%,
		100% {
			transform: rotate(0);
		}
		25% {
			transform: rotate(-1.5deg);
		}
		75% {
			transform: rotate(1.5deg);
		}
	}
	@media (min-width: 900px) {
		.dock.floating {
			bottom: 20px;
			left: auto;
			width: 360px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		li.ringing {
			animation: none;
		}
	}
</style>
