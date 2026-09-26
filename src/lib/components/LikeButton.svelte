<script lang="ts">
	import Icon from './Icon.svelte';
	import { likes, toggleLike } from '$lib/state.svelte';

	let { recipeId, compact = false }: { recipeId: string; compact?: boolean } = $props();

	const liked = $derived(likes.mine.includes(recipeId));
	const count = $derived(likes.counts[recipeId] ?? 0);
	let burst = $state(0);

	function onclick(event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();
		if (!liked) burst++;
		void toggleLike(recipeId);
	}
</script>

{#if likes.available}
	<button
		class="like"
		class:compact
		class:liked
		aria-pressed={liked}
		aria-label={liked ? 'Zrušiť páči sa mi' : 'Páči sa mi'}
		{onclick}
	>
		<span class="heart">
			<Icon name="heart" size={compact ? 18 : 20} />
			{#key burst}
				{#if burst > 0}
					<span class="burst" aria-hidden="true">
						{#each Array.from({ length: 8 }, (_, i) => i) as i (i)}
							<i style:--a="{i * 45}deg"></i>
						{/each}
					</span>
				{/if}
			{/key}
		</span>
		{#if count > 0}<span class="count">{count}</span>{/if}
	</button>
{/if}

<style>
	.like {
		display: inline-flex;
		align-items: center;
		gap: 0.35em;
		border: 0;
		border-radius: 999px;
		padding: 0.45em 0.8em;
		background: var(--card);
		color: var(--ink-2);
		font-weight: 700;
		font-size: 0.9rem;
		box-shadow: inset 0 0 0 1.5px var(--line);
		transition:
			transform 0.25s var(--ease-spring),
			color 0.2s;
	}
	.like.compact {
		padding: 0.35em 0.6em;
		font-size: 0.8rem;
		background: color-mix(in srgb, var(--card) 88%, transparent);
		backdrop-filter: blur(6px);
		box-shadow: none;
	}
	.like:hover {
		transform: scale(1.06);
	}
	.like:active {
		transform: scale(0.92);
	}
	.liked {
		color: var(--tomato);
	}
	.liked :global(.icon path) {
		fill: var(--tomato);
	}
	.heart {
		position: relative;
		display: inline-grid;
		place-items: center;
	}
	.liked .heart {
		animation: beat 0.45s var(--ease-spring);
	}
	@keyframes beat {
		40% {
			transform: scale(1.35);
		}
	}
	.burst {
		position: absolute;
		inset: 50%;
	}
	.burst i {
		position: absolute;
		width: 5px;
		height: 5px;
		margin: -2.5px;
		border-radius: 50%;
		background: var(--tomato);
		animation: fly 0.6s var(--ease-out) forwards;
	}
	.burst i:nth-child(even) {
		background: var(--turmeric);
	}
	@keyframes fly {
		from {
			transform: rotate(var(--a)) translateY(0) scale(1);
			opacity: 1;
		}
		to {
			transform: rotate(var(--a)) translateY(-18px) scale(0.3);
			opacity: 0;
		}
	}
</style>
