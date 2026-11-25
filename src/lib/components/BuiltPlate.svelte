<script lang="ts">
	import type { Part, PartMethod } from '$lib/dish';
	import { partShapes, SPOTS } from '$lib/plate-art';
	import type { IngredientLite } from '$lib/types';

	let {
		filled,
		empty = [],
		byId,
		steam = true,
		label
	}: {
		filled: { slot: string; part: Part; method: PartMethod }[];
		/** Spots drawn as dashed outlines, waiting for a part. */
		empty?: string[];
		byId: Map<string, IngredientLite>;
		steam?: boolean;
		label?: string;
	} = $props();

	/** The sauce sits in a little bowl on the rim; draw it last so it overlaps the plate. */
	const order = (slot: string) => ['zaklad', 'hlavne', 'zelenina', 'omacka'].indexOf(slot);
	const drawn = $derived(
		[...filled]
			.sort((a, b) => order(a.slot) - order(b.slot))
			.map((f) => ({
				...f,
				spot: SPOTS[f.slot],
				art: partShapes(f.part, f.method, byId, SPOTS[f.slot])
			}))
	);
	const hot = $derived(filled.some((f) => !f.part.early));
</script>

<svg
	class="built"
	viewBox="0 0 300 300"
	role={label ? 'img' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
>
	<defs>
		<radialGradient id="bp-rim" cx="50%" cy="45%" r="55%">
			<stop offset="78%" stop-color="var(--plate)" />
			<stop offset="100%" stop-color="var(--plate-rim)" />
		</radialGradient>
		<radialGradient id="bp-well" cx="45%" cy="40%" r="60%">
			<stop offset="0%" stop-color="var(--card)" stop-opacity="0.5" />
			<stop offset="100%" stop-color="var(--plate)" stop-opacity="0" />
		</radialGradient>
		<radialGradient id="bp-gloss" cx="32%" cy="26%" r="70%">
			<stop offset="0%" stop-color="#fff" stop-opacity="0.32" />
			<stop offset="55%" stop-color="#fff" stop-opacity="0" />
		</radialGradient>
		<filter id="bp-soft" x="-20%" y="-20%" width="140%" height="140%">
			<feDropShadow dx="0" dy="2.5" stdDeviation="2" flood-color="#000" flood-opacity="0.22" />
		</filter>
	</defs>

	<ellipse class="table-shadow" cx="150" cy="282" rx="118" ry="12" />
	<circle cx="150" cy="150" r="138" fill="url(#bp-rim)" />
	<circle cx="150" cy="150" r="112" class="well" />
	<circle cx="150" cy="150" r="112" fill="url(#bp-well)" />

	{#each empty as slot (slot)}
		{@const s = SPOTS[slot]}
		<circle class="placeholder" cx={s.x} cy={s.y} r={s.r * 0.78} />
	{/each}

	{#each drawn as d (d.slot)}
		{#key d.part.id}
			<g class="food" style:--ox="{d.spot.x}px" style:--oy="{d.spot.y}px" filter="url(#bp-soft)">
				{#if d.art.bowl}
					<circle
						cx={d.spot.x}
						cy={d.spot.y}
						r={d.spot.r * (d.slot === 'omacka' ? 0.98 : 1.04)}
						class="bowl"
					/>
					<circle
						cx={d.spot.x}
						cy={d.spot.y}
						r={d.spot.r * (d.slot === 'omacka' ? 0.8 : 0.9)}
						class="bowl-in"
					/>
				{/if}
				{#each d.art.shapes as sh, i (i)}
					{#if sh.type === 'path'}
						<path
							d={sh.d}
							fill={sh.fill}
							fill-opacity={sh.opacity}
							stroke={sh.stroke}
							stroke-width={sh.stroke ? 3 : undefined}
							stroke-linecap="round"
						/>
					{:else if sh.type === 'ellipse'}
						<ellipse
							cx={sh.cx}
							cy={sh.cy}
							rx={sh.rx}
							ry={sh.ry}
							fill={sh.fill}
							transform="rotate({sh.rot} {sh.cx} {sh.cy})"
						/>
					{:else if sh.type === 'rect'}
						<rect
							x={sh.x}
							y={sh.y}
							width={sh.w}
							height={sh.h}
							rx={sh.rx}
							fill={sh.fill}
							transform="rotate({sh.rot} {sh.x + sh.w / 2} {sh.y + sh.h / 2})"
						/>
					{:else}
						<circle cx={sh.cx} cy={sh.cy} r={sh.r} fill={sh.fill} fill-opacity={sh.opacity} />
					{/if}
				{/each}
			</g>
		{/key}
	{/each}

	<circle cx="150" cy="150" r="138" fill="url(#bp-gloss)" pointer-events="none" />

	{#if steam && hot && filled.length}
		<g class="steam" fill="none" stroke="var(--muted)" stroke-width="3" stroke-linecap="round">
			<path d="M150 70c-8-10 8-16 0-30" />
			<path d="M176 76c-8-10 8-16 0-30" style:--d="0.6s" />
			<path d="M124 78c-8-10 8-16 0-30" style:--d="1.2s" />
		</g>
	{/if}
</svg>

<style>
	.built {
		display: block;
		width: 100%;
		height: auto;
		overflow: visible;
	}
	.table-shadow {
		fill: #000;
		opacity: 0.18;
	}
	.well {
		fill: var(--plate);
		stroke: color-mix(in srgb, var(--plate-rim) 70%, transparent);
		stroke-width: 1.5;
	}
	.placeholder {
		fill: none;
		stroke: var(--muted);
		stroke-width: 2;
		stroke-dasharray: 6 7;
		opacity: 0.55;
		animation: breathe 2.6s ease-in-out infinite;
		transform-origin: center;
		transform-box: fill-box;
	}
	@keyframes breathe {
		50% {
			opacity: 0.25;
			transform: scale(0.95);
		}
	}
	.bowl {
		fill: var(--card);
		stroke: var(--plate-rim);
		stroke-width: 2;
	}
	.bowl-in {
		fill: color-mix(in srgb, var(--plate) 60%, #000 10%);
	}
	.food {
		transform-origin: var(--ox) var(--oy);
		animation: drop 0.65s var(--ease-spring) both;
	}
	@keyframes drop {
		0% {
			opacity: 0;
			transform: translateY(-46px) scale(0.55) rotate(-14deg);
		}
		60% {
			opacity: 1;
		}
	}
	.steam path {
		opacity: 0;
		animation: rise 3s ease-in-out infinite;
		animation-delay: var(--d, 0s);
	}
	@keyframes rise {
		0% {
			opacity: 0;
			transform: translateY(8px);
		}
		40% {
			opacity: 0.55;
		}
		100% {
			opacity: 0;
			transform: translateY(-14px);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.food,
		.placeholder,
		.steam path {
			animation: none;
		}
		.steam path {
			opacity: 0.4;
		}
	}
</style>
