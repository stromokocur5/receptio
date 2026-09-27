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

	/** Tapping a crop in the legend picks out its plants in the drawing. */
	let highlight = $state<string | null>(null);
</script>

<figure class="layout" class:focused={highlight}>
	<p class="north">sever ↑</p>
	<svg
		viewBox="-8 -8 {w + 16} {h + 16}"
		role="img"
		aria-label="Schéma rozmiestnenia: {combo.members
			.map((m) => `${m.count} × ${m.name}`)
			.join(', ')}"
	>
		<rect x="0" y="0" width={w} height={h} rx="6" class="bed" />
		{#each layout.dots as d, i (i)}
			<circle
				cx={d.x * 100 * scale}
				cy={d.y * 100 * scale}
				r={radius(d.ingredientId)}
				fill={color(d.ingredientId)}
				class="plant"
				class:dim={highlight && highlight !== d.ingredientId}
				style:animation-delay="{Math.min(i, 40) * 18}ms"
			/>
		{/each}
	</svg>
	<figcaption>
		{#each combo.members as m (m.ingredientId)}
			<button
				aria-pressed={highlight === m.ingredientId}
				onclick={() => (highlight = highlight === m.ingredientId ? null : m.ingredientId)}
				onpointerenter={(e) => e.pointerType === 'mouse' && (highlight = m.ingredientId)}
				onpointerleave={(e) => e.pointerType === 'mouse' && (highlight = null)}
				><i style:background={color(m.ingredientId)}></i>{m.name}</button
			>
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
		transform-box: fill-box;
		transform-origin: center;
		animation: pop 0.4s var(--ease-spring) both;
		transition: opacity 0.2s;
	}
	.plant.dim {
		opacity: 0.15;
	}
	@keyframes pop {
		from {
			transform: scale(0);
		}
	}
	.north {
		margin: 0 0 2px;
		text-align: center;
		font-size: 0.72rem;
		color: var(--muted);
	}
	figcaption {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 12px;
		margin-top: 6px;
		font-size: 0.8rem;
		color: var(--ink-2);
	}
	figcaption button {
		display: inline-flex;
		align-items: center;
		padding: 2px 8px;
		border: 1px solid transparent;
		border-radius: 999px;
		background: none;
		color: inherit;
		font: inherit;
		cursor: pointer;
	}
	figcaption button:hover,
	figcaption button[aria-pressed='true'] {
		border-color: var(--line);
		background: var(--card);
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
		align-self: center;
		color: var(--muted);
	}
</style>
