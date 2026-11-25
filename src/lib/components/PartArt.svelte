<script lang="ts">
	import type { Part, PartMethod } from '$lib/dish';
	import { partShapes } from '$lib/plate-art';
	import type { IngredientLite } from '$lib/types';

	let {
		part,
		method,
		byId
	}: { part: Part; method: PartMethod; byId: Map<string, IngredientLite> } = $props();

	const art = $derived(partShapes(part, method, byId, { x: 50, y: 50, r: 40 }));
</script>

<svg class="part-art" viewBox="0 0 100 100" aria-hidden="true">
	<circle cx="50" cy="50" r="48" class="dish" />
	{#each art.shapes as sh, i (i)}
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
</svg>

<style>
	.part-art {
		display: block;
		width: 100%;
		height: auto;
	}
	.dish {
		fill: var(--plate);
		stroke: var(--plate-rim);
		stroke-width: 2;
	}
</style>
