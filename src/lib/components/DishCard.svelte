<script lang="ts">
	import { formatEur, formatMinutes, formatNumber } from '$lib/amounts';
	import { useCatalog } from '$lib/catalog';
	import type { Dish, DishMatch } from '$lib/dish';
	import type { Plate } from '$lib/plate';
	import Icon from './Icon.svelte';
	import BuiltPlate from './BuiltPlate.svelte';
	import { placeParts } from '$lib/plate-art';

	let {
		dish,
		plate,
		match,
		href,
		index = 0
	}: {
		dish: Dish;
		plate: Plate;
		/** Present when the pantry has something in it. */
		match?: DishMatch;
		href: string;
		index?: number;
	} = $props();

	const catalog = useCatalog();
	const missing = $derived(match ? [...match.missing, ...match.short] : []);
	/** What comes with the main part: "+ chrumkavé hranolky · tatárka". */
	const picked = $derived(plate.parts.slice(1).map((p) => p.part.name.toLowerCase()));
</script>

<article class="dish card draw-host rise" style:--i={index}>
	<div class="art" style:view-transition-name="plate-{dish.id}">
		<BuiltPlate filled={placeParts(plate.parts)} byId={catalog().ingredientsById} steam={false} />
		{#if match && !missing.length}
			<span class="badge leaf sticker have"
				><Icon name="check" size={14} stroke={2.4} /> Máš všetko</span
			>
		{/if}
	</div>
	<div class="body">
		<h3><a class="stretched" {href}>{dish.name}</a></h3>
		{#if picked.length}<p class="with">+ {picked.join(' · ')}</p>{/if}
		<ul class="meta" aria-label="Na porciu">
			<li><Icon name="clock" size={16} /> {formatMinutes(plate.timeline.total)}</li>
			<li title="Bielkoviny na porciu">
				<Icon name="bean" size={16} />
				{formatNumber(plate.facts.perServing.protein, 0)} g
			</li>
			<li><Icon name="flame" size={16} /> {formatNumber(plate.facts.perServing.kcal, 0)} kcal</li>
			<li title={plate.facts.costIsEstimate ? 'Odhad ceny' : 'Podľa cien v obchodoch'}>
				<Icon name="euro" size={16} />
				{plate.facts.costIsEstimate ? '~' : ''}{formatEur(plate.facts.costPerServing)}
			</li>
		</ul>
		{#if missing.length}
			<p class="missing">
				<Icon name="basket" size={16} />
				<span>Chýba: {missing.map((i) => i.name.toLowerCase()).join(', ')}</span>
			</p>
		{/if}
	</div>
</article>

<style>
	.dish {
		position: relative;
		display: grid;
		grid-template-rows: auto 1fr;
		overflow: hidden;
		transition:
			transform 0.35s var(--ease-spring),
			box-shadow 0.35s;
	}
	.dish:hover {
		transform: translateY(-3px);
		box-shadow: var(--shadow-lift);
	}
	.dish:hover :global(svg.built) {
		transform: rotate(8deg) scale(1.03);
	}
	.art {
		position: relative;
		display: grid;
		place-items: center;
		padding: var(--sp-4) var(--sp-5) 0;
		background: radial-gradient(
			circle at 50% 60%,
			color-mix(in srgb, var(--paper-2) 80%, transparent),
			transparent 70%
		);
	}
	.art :global(svg.built) {
		width: min(190px, 76%);
		transition: transform 0.6s var(--ease-spring);
	}
	.have {
		position: absolute;
		top: var(--sp-3);
		left: var(--sp-3);
	}
	.body {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		padding: var(--sp-3) var(--sp-4) var(--sp-4);
	}
	h3 {
		margin: 0;
		font-size: var(--fs-lg);
		line-height: 1.2;
	}
	.stretched {
		color: inherit;
		text-decoration: none;
	}
	.stretched::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
	}
	.stretched:focus-visible::after {
		outline: 3px solid var(--leaf);
		outline-offset: -3px;
	}
	.with {
		margin: 0;
		color: var(--ink-2);
		font-size: var(--fs-sm);
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-1) var(--sp-3);
		margin: auto 0 0;
		padding: var(--sp-1) 0 0;
		list-style: none;
		color: var(--ink-2);
		font-size: var(--fs-sm);
		font-weight: 600;
	}
	.meta li {
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}
	.missing {
		display: flex;
		align-items: flex-start;
		gap: 6px;
		margin: 0;
		padding: var(--sp-2) var(--sp-3);
		border-radius: var(--radius-sm);
		background: var(--turmeric-soft);
		color: color-mix(in srgb, var(--turmeric) 35%, var(--ink));
		font-size: var(--fs-sm);
		font-weight: 600;
	}
	.missing :global(svg) {
		margin-top: 1px;
	}
	.rise {
		animation: rise 0.5s var(--ease-out) both;
		animation-delay: calc(var(--i) * 40ms);
	}
	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.rise {
			animation: none;
		}
		.dish,
		.art :global(svg.built) {
			transition: none;
		}
	}
</style>
