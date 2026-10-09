<script lang="ts">
	import { CATEGORY_IDS, RECIPE_CATEGORIES, type CategoryId } from '$lib/categories';
	import Icon from './Icon.svelte';

	let {
		counts,
		selected = '',
		onpick
	}: {
		/** Recipes per category id. */
		counts: Map<string, number>;
		selected?: CategoryId | '';
		/** Without it the tiles are links to the filtered recipe list. */
		onpick?: (id: CategoryId) => void;
	} = $props();
</script>

<nav class="cats scroller" aria-label="Kategórie">
	{#each CATEGORY_IDS as id, i (id)}
		{@const c = RECIPE_CATEGORIES[id]}
		{#if onpick}
			<button
				class="cat draw-host"
				style:--tone={c.tone}
				style:--i={i}
				aria-pressed={selected === id}
				onclick={() => onpick(id)}
			>
				{@render tile(id)}
			</button>
		{:else}
			<a class="cat draw-host" style:--tone={c.tone} style:--i={i} href="/recepty?kategoria={id}">
				{@render tile(id)}
			</a>
		{/if}
	{/each}
</nav>

{#snippet tile(id: CategoryId)}
	{@const c = RECIPE_CATEGORIES[id]}
	<span class="cat-ico"><Icon name={c.icon} size={26} /></span>
	<span class="cat-label">{c.label}</span>
	<span class="cat-count">{counts.get(id) ?? 0}</span>
{/snippet}

<style>
	/* .scroller reaches the screen edge; snapping keeps the first tile off it. */
	.cats {
		gap: 10px;
		margin-bottom: var(--sp-3);
		padding-bottom: var(--sp-2);
		scroll-snap-type: x proximity;
	}
	.cat {
		flex: none;
		scroll-snap-align: start;
		position: relative;
		display: grid;
		justify-items: center;
		align-content: start;
		gap: 6px;
		width: 104px;
		padding: 12px 8px 10px;
		border: 1.5px solid var(--line);
		border-radius: var(--radius-sm);
		background: var(--card);
		color: var(--ink);
		font: inherit;
		text-decoration: none;
		cursor: pointer;
		animation: rise 0.45s var(--ease-out) both;
		animation-delay: calc(var(--i) * 35ms);
		transition:
			transform 0.25s var(--ease-spring),
			border-color 0.2s,
			background 0.2s;
	}
	.cat:hover {
		transform: translateY(-3px);
		border-color: var(--tone);
	}
	.cat[aria-pressed='true'] {
		border-color: var(--tone);
		background: color-mix(in srgb, var(--tone) 14%, var(--card));
	}
	.cat-ico {
		display: grid;
		place-items: center;
		width: 48px;
		height: 48px;
		border-radius: 50%;
		background: color-mix(in srgb, var(--tone) 18%, transparent);
		color: color-mix(in srgb, var(--tone) 75%, var(--ink));
		transition: transform 0.35s var(--ease-spring);
	}
	.cat:hover .cat-ico,
	.cat[aria-pressed='true'] .cat-ico {
		transform: rotate(-8deg) scale(1.08);
	}
	.cat-label {
		font-size: 0.84rem;
		font-weight: 700;
		line-height: 1.15;
		text-align: center;
	}
	.cat-count {
		position: absolute;
		top: 8px;
		right: 8px;
		font-size: var(--fs-xs);
		font-weight: 700;
		color: var(--muted);
	}
	@media (min-width: 980px) {
		.cats {
			flex-wrap: wrap;
			margin: 0 0 14px;
			padding: 4px 0 0;
			overflow: visible;
		}
		.cat {
			flex: 1 1 0;
			/* All eleven categories in one row at 1080 px. */
			min-width: 84px;
			padding-inline: 4px;
		}
	}
</style>
