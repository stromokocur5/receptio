<script lang="ts">
	import { useCatalog } from '$lib/catalog';
	import { comboLayout } from '$lib/garden';
	import type { GrowCombo, GrowGuide } from '$lib/types';

	let { combo, guides }: { combo: GrowCombo; guides: GrowGuide[] } = $props();

	const catalog = useCatalog();
	const layout = $derived(comboLayout(combo, guides));
	const spacing = $derived(new Map(guides.map((g) => [g.ingredientId, g.spacing])));
	const color = (id: string) => catalog.ingredientsById.get(id)?.color ?? '#6fa35a';
	/** Dot size follows the plant's spacing, within limits so small and large crops both read. */
	const radius = (id: string) =>
		Math.min(22, Math.max(3.5, (spacing.get(id) ?? 20) * 0.32)) * scale;
	/** Draw in centimetres, but keep narrow windowsill boxes from turning into a thin line. */
	const scale = $derived(Math.max(1, 30 / (layout.depth * 100)));
	const w = $derived(layout.width * 100 * scale);
	const h = $derived(layout.depth * 100 * scale);
</script>

<figure class="layout">
	<svg
		viewBox="-8 -18 {w + 16} {h + 26}"
		role="img"
		aria-label="Schéma rozmiestnenia: {combo.members
			.map((m) => `${m.count} × ${m.name}`)
			.join(', ')}"
	>
		<text x={w / 2} y="-6" text-anchor="middle" class="north">sever ↑</text>
		<rect x="0" y="0" width={w} height={h} rx="6" class="bed" />
		{#each layout.dots as d, i (i)}
			<circle
				cx={d.x * 100 * scale}
				cy={d.y * 100 * scale}
				r={radius(d.ingredientId)}
				fill={color(d.ingredientId)}
				class="plant"
			/>
		{/each}
	</svg>
	<figcaption>
		{#each combo.members as m (m.ingredientId)}
			<span><i style:background={color(m.ingredientId)}></i>{m.name}</span>
		{/each}
		<small>
			{layout.width >= 1
				? `${layout.width} × ${layout.depth} m`
				: `${Math.round(layout.depth * 100)} cm hlboký pás`}
		</small>
	</figcaption>
</figure>

<style>
	.layout {
		margin: 12px 0 0;
		max-width: 440px;
	}
	svg {
		display: block;
		width: 100%;
		height: auto;
		max-height: 220px;
	}
	.bed {
		fill: color-mix(in srgb, #8a5a3c 22%, var(--paper));
		stroke: color-mix(in srgb, #8a5a3c 45%, var(--paper));
		stroke-width: 2;
	}
	.plant {
		stroke: color-mix(in srgb, var(--ink) 35%, transparent);
		stroke-width: 1.2;
	}
	.north {
		font-size: 11px;
		fill: var(--muted);
	}
	figcaption {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 12px;
		margin-top: 6px;
		font-size: 0.8rem;
		color: var(--ink-2);
	}
	figcaption i {
		display: inline-block;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		margin-right: 4px;
		vertical-align: -1px;
		border: 1px solid color-mix(in srgb, var(--ink) 30%, transparent);
	}
	figcaption small {
		color: var(--muted);
	}
</style>
