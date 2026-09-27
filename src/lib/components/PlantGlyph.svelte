<svelte:options namespace="svg" />

<script lang="ts" module>
	/** How a crop looks from above, by plant family. */
	type Shape =
		| 'rosette'
		| 'cabbage'
		| 'feather'
		| 'allium'
		| 'fruiting'
		| 'legume'
		| 'squash'
		| 'herb'
		| 'grass'
		| 'chard'
		| 'mushroom';

	const SHAPE_BY_FAMILY: Record<string, Shape> = {
		astrovite: 'rosette',
		kapustovite: 'cabbage',
		mrkvovite: 'feather',
		cibulovite: 'allium',
		lilkovite: 'fruiting',
		bobovite: 'legume',
		tekvicovite: 'squash',
		hluchavkovite: 'herb',
		travy: 'grass',
		mrlikovite: 'chard',
		laskavcovite: 'chard',
		huby: 'mushroom',
		ruzovite: 'fruiting',
		vresovcovite: 'fruiting',
		slezovite: 'fruiting'
	};

	export function plantShape(family: string | undefined): Shape {
		return (family && SHAPE_BY_FAMILY[family]) || 'rosette';
	}

	const turn = (n: number, i: number, offset = 0) => (360 / n) * i + offset;
</script>

<script lang="ts">
	let {
		family,
		color,
		x = 0,
		y = 0,
		r = 10,
		seed = 0
	}: {
		family: string | undefined;
		/** The crop's own colour: fruit, root top, bulb or head. */
		color: string;
		x?: number;
		y?: number;
		/** Radius the plant should fill. */
		r?: number;
		/** Varies the rotation so a row of plants doesn't look stamped. */
		seed?: number;
	} = $props();

	const shape = $derived(plantShape(family));
	const rotation = $derived((seed * 47) % 360);
</script>

<g class="plant-glyph" transform="translate({x} {y}) scale({r / 10})">
	<g transform="rotate({rotation})">
		{#if shape === 'rosette'}
			{#each Array.from({ length: 7 }, (_, i) => i) as i (i)}
				<ellipse
					cx="0"
					cy="-5"
					rx="4.2"
					ry="5.6"
					transform="rotate({turn(7, i)})"
					fill="color-mix(in srgb, {color} 85%, #1f4d2a)"
					class="edge"
				/>
			{/each}
			{#each Array.from({ length: 5 }, (_, i) => i) as i (i)}
				<ellipse
					cx="0"
					cy="-3"
					rx="2.8"
					ry="3.6"
					transform="rotate({turn(5, i, 30)})"
					fill="color-mix(in srgb, {color} 70%, #f4f9d8)"
					class="edge"
				/>
			{/each}
			<circle r="1.6" fill="#f1f7cf" />
		{:else if shape === 'cabbage'}
			{#each Array.from({ length: 5 }, (_, i) => i) as i (i)}
				<g transform="rotate({turn(5, i)})">
					<ellipse
						cx="0"
						cy="-5"
						rx="5.2"
						ry="5.2"
						fill="color-mix(in srgb, {color} 75%, #173d24)"
						class="edge"
					/>
					<path d="M0 -1.5 V-9 M0 -5.5 l-2.4 -2 M0 -5.5 l2.4 -2" class="vein" />
				</g>
			{/each}
			<circle r="4.6" fill="color-mix(in srgb, {color} 70%, #eaf5d0)" class="edge" />
			<path d="M-2.8 -1.2 q2.8 -2.6 5.6 0 M-2.2 1.4 q2.2 -1.8 4.4 0" class="vein" />
		{:else if shape === 'feather'}
			{#each Array.from({ length: 8 }, (_, i) => i) as i (i)}
				<g transform="rotate({turn(8, i)})">
					<path
						d="M0 -1.5 V{i % 2
							? -8
							: -9.6} M0 -4 l-1.8 -1.6 M0 -4 l1.8 -1.6 M0 -6.4 l-1.5 -1.4 M0 -6.4 l1.5 -1.4"
						class="frond"
					/>
				</g>
			{/each}
			<circle r="2.4" fill={color} class="edge" />
		{:else if shape === 'allium'}
			{#each Array.from({ length: 6 }, (_, i) => i) as i (i)}
				<path d="M0 -2 L0 {i % 2 ? -8 : -9.8}" transform="rotate({turn(6, i, 12)})" class="spike" />
			{/each}
			<circle r="3.4" fill={color} class="edge" />
			<ellipse cx="-1" cy="-1.1" rx="1.1" ry="0.7" fill="#fff" opacity="0.45" />
		{:else if shape === 'fruiting'}
			{#each Array.from({ length: 6 }, (_, i) => i) as i (i)}
				<ellipse
					cx="0"
					cy="-4.8"
					rx="4"
					ry="5"
					transform="rotate({turn(6, i)})"
					fill="#3f7a3a"
					class="edge"
				/>
			{/each}
			{#each [[2.4, -2.2], [-3, 0.8], [1.2, 3.6]] as [fx, fy], i (i)}
				<circle cx={fx} cy={fy} r="2.5" fill={color} class="edge" />
				<circle cx={fx - 0.8} cy={fy - 0.8} r="0.7" fill="#fff" opacity="0.5" />
			{/each}
		{:else if shape === 'legume'}
			<path d="M0 0 C 4 -2 5 -7 1 -8.5 C -4 -9 -8 -4 -6 1 C -4 6 3 7 6 3" class="tendril" />
			{#each Array.from({ length: 5 }, (_, i) => i) as i (i)}
				<g transform="rotate({turn(5, i, 20)}) translate(0 -6)">
					<ellipse cx="-1.6" cy="0" rx="1.6" ry="2.4" fill="#4d8a3f" class="edge" />
					<ellipse cx="1.6" cy="0" rx="1.6" ry="2.4" fill="#5f9a4a" class="edge" />
				</g>
			{/each}
			<ellipse cx="3.4" cy="2.6" rx="0.9" ry="3" transform="rotate(30 3.4 2.6)" fill={color} />
			<ellipse cx="-3.6" cy="2" rx="0.9" ry="3" transform="rotate(-25 -3.6 2)" fill={color} />
			<circle r="1.5" fill="#9a6b43" />
		{:else if shape === 'squash'}
			{#each Array.from({ length: 5 }, (_, i) => i) as i (i)}
				<path
					d="M0 0 C -4 -3 -4 -8 0 -9.6 C 4 -8 4 -3 0 0 Z"
					transform="rotate({turn(5, i)})"
					fill="#4f8d3e"
					class="edge"
				/>
			{/each}
			<circle cx="3.2" cy="3" r="3.2" fill={color} class="edge" />
			<path
				d="M-2.5 -2.5 l1 2 2 .2 -1.5 1.4 .5 2 -2 -1 -2 1 .5 -2 -1.5 -1.4 2 -.2 Z"
				fill="#f3c63f"
			/>
		{:else if shape === 'herb'}
			{#each Array.from({ length: 4 }, (_, i) => i) as i (i)}
				<g transform="rotate({turn(4, i, 45)})">
					<path d="M0 0 V-9" class="stem" />
					<ellipse
						cx="-1.8"
						cy="-4"
						rx="1.5"
						ry="2.4"
						transform="rotate(-30 -1.8 -4)"
						fill={color}
						class="edge"
					/>
					<ellipse
						cx="1.8"
						cy="-4"
						rx="1.5"
						ry="2.4"
						transform="rotate(30 1.8 -4)"
						fill={color}
						class="edge"
					/>
					<ellipse
						cx="0"
						cy="-8"
						rx="1.4"
						ry="2"
						fill="color-mix(in srgb, {color} 70%, #f4f9d8)"
						class="edge"
					/>
				</g>
			{/each}
		{:else if shape === 'grass'}
			{#each Array.from({ length: 7 }, (_, i) => i) as i (i)}
				<ellipse
					cx="0"
					cy="-5"
					rx="1.3"
					ry={i % 2 ? 4.6 : 5.4}
					transform="rotate({turn(7, i)})"
					fill={i % 2 ? '#6a9e45' : '#4f8a3a'}
				/>
			{/each}
			<circle r="2" fill={color} class="edge" />
		{:else if shape === 'chard'}
			{#each Array.from({ length: 6 }, (_, i) => i) as i (i)}
				<g transform="rotate({turn(6, i)})">
					<ellipse cx="0" cy="-5" rx="3.2" ry="5" fill="#3f7a3a" class="edge" />
					<path d="M0 -0.5 V-9" stroke={color} stroke-width="1.1" stroke-linecap="round" />
				</g>
			{/each}
			<circle r="1.6" fill={color} />
		{:else}
			{#each [[-3, -2, 4.2], [3.4, 1, 3.4], [-1, 4, 2.8]] as [cx, cy, cr], i (i)}
				<circle {cx} {cy} r={cr} fill={color} class="edge" />
				<circle {cx} {cy} r={cr * 0.35} fill="#fff" opacity="0.35" />
			{/each}
		{/if}
	</g>
</g>

<style>
	.edge {
		stroke: rgba(20, 40, 20, 0.35);
		stroke-width: 0.45;
	}
	.vein {
		fill: none;
		stroke: rgba(255, 255, 255, 0.45);
		stroke-width: 0.5;
		stroke-linecap: round;
	}
	.frond {
		fill: none;
		stroke: #4f8f3c;
		stroke-width: 0.9;
		stroke-linecap: round;
	}
	.spike {
		stroke: #5f9a4a;
		stroke-width: 1.6;
		stroke-linecap: round;
	}
	.tendril,
	.stem {
		fill: none;
		stroke: #4f8a3a;
		stroke-width: 0.7;
		stroke-linecap: round;
	}
</style>
