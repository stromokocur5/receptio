<script lang="ts">
	import { useCatalog } from '$lib/catalog';
	import PlantGlyph from '$lib/components/PlantGlyph.svelte';
	import { comboLayout } from '$lib/garden';
	import type { GrowCombo, GrowGuide } from '$lib/types';

	let {
		combo,
		guides,
		compact = false
	}: {
		combo: GrowCombo;
		guides: GrowGuide[];
		/** A small preview without legend, for a collapsed card. */
		compact?: boolean;
	} = $props();

	const catalog = useCatalog();
	const layout = $derived(comboLayout(combo, guides));
	const guideById = $derived(new Map(guides.map((g) => [g.ingredientId, g])));
	const color = (id: string) => catalog.ingredientsById.get(id)?.color ?? '#6fa35a';
	/** Plants fill most of their spacing, within limits so tiny and huge crops both read. */
	const radius = (id: string) =>
		Math.min(
			layout.width * 50,
			layout.depth * 50,
			Math.max(4.5, (guideById.get(id)?.spacing ?? 20) * 0.46)
		) * scale;
	/** Draw in centimetres, but keep narrow windowsill boxes from turning into a thin line. */
	const scale = $derived(Math.max(1, 34 / (layout.depth * 100)));
	const w = $derived(layout.width * 100 * scale);
	const h = $derived(layout.depth * 100 * scale);
	/** A guild's tree is drawn small, so what grows under it stays visible. */
	const guildCanopy = $derived(Math.min(layout.width, layout.depth) * 100 * scale * 0.2);
	/** Frame thickness of the raised bed. */
	const FRAME = 7;
	const patternId = $derived(`soil-${combo.id}${compact ? '-s' : ''}`);

	/** Tapping a crop in the legend picks out its plants in the drawing. */
	let highlight = $state<string | null>(null);
</script>

<figure class="layout" class:compact>
	{#if !compact}<p class="north">sever ↑</p>{/if}
	<svg
		viewBox="{-FRAME - 4} {-FRAME - 4} {w + 2 * FRAME + 8} {h + 2 * FRAME + 12}"
		role="img"
		aria-label="Schéma rozmiestnenia: {combo.members
			.map((m) => `${m.count} × ${m.name}`)
			.join(', ')}"
	>
		<defs>
			<pattern id={patternId} width="14" height="14" patternUnits="userSpaceOnUse">
				<rect width="14" height="14" class="soil" />
				<circle cx="3" cy="4" r="0.9" class="crumb" />
				<circle cx="10" cy="9" r="1.1" class="crumb" />
				<circle cx="7" cy="12.5" r="0.6" class="crumb" />
			</pattern>
		</defs>
		<!-- Shadow, wooden frame, then the soil. -->
		<rect
			x={-FRAME}
			y={-FRAME + 5}
			width={w + 2 * FRAME}
			height={h + 2 * FRAME}
			rx="9"
			class="shadow"
		/>
		<rect x={-FRAME} y={-FRAME} width={w + 2 * FRAME} height={h + 2 * FRAME} rx="9" class="frame" />
		<path
			d="M{-FRAME + 4} {-FRAME / 2} H{w + FRAME - 4} M{-FRAME + 4} {h + FRAME / 2} H{w + FRAME - 4}"
			class="grain"
		/>
		<rect x="0" y="0" width={w} height={h} rx="4" fill="url(#{patternId})" />
		{#each layout.dots as d, i (i)}
			<g
				class="plant"
				class:dim={highlight && highlight !== d.ingredientId}
				style:animation-delay="{Math.min(i, 40) * 22}ms"
			>
				<PlantGlyph
					family={guideById.get(d.ingredientId)?.family}
					form={guideById.get(d.ingredientId)?.form}
					color={color(d.ingredientId)}
					x={d.x * 100 * scale}
					y={d.y * 100 * scale}
					r={combo.layout === 'kruh' && i === 0 ? guildCanopy : radius(d.ingredientId)}
					seed={i}
				/>
			</g>
		{/each}
	</svg>
	{#if !compact}
		<figcaption>
			{#each combo.members as m (m.ingredientId)}
				<button
					aria-pressed={highlight === m.ingredientId}
					onclick={() => (highlight = highlight === m.ingredientId ? null : m.ingredientId)}
					onpointerenter={(e) => e.pointerType === 'mouse' && (highlight = m.ingredientId)}
					onpointerleave={(e) => e.pointerType === 'mouse' && (highlight = null)}
				>
					<svg viewBox="-11 -11 22 22" class="mini" aria-hidden="true">
						<PlantGlyph
							family={guideById.get(m.ingredientId)?.family}
							form={guideById.get(m.ingredientId)?.form}
							color={color(m.ingredientId)}
						/>
					</svg>
					{m.name}
				</button>
			{/each}
			<small>
				{layout.width >= 1
					? `${layout.width} × ${layout.depth} m`
					: `${Math.round(layout.depth * 100)} cm hlboký pás`}
			</small>
		</figcaption>
	{/if}
</figure>

<style>
	.layout {
		margin: 12px 0 0;
		max-width: 520px;
	}
	.layout.compact {
		margin: 0;
		max-width: none;
	}
	svg {
		display: block;
		width: 100%;
		height: auto;
		max-height: 300px;
		overflow: visible;
	}
	.compact svg {
		max-height: 110px;
	}
	.soil {
		fill: #6b4a33;
	}
	.crumb {
		fill: #58392a;
	}
	.frame {
		fill: #b98a5a;
		stroke: #8a6039;
		stroke-width: 1.5;
	}
	.grain {
		stroke: #9c7045;
		stroke-width: 1;
		stroke-dasharray: 18 6 4 6;
		fill: none;
	}
	.shadow {
		fill: rgba(40, 25, 10, 0.18);
	}
	.plant {
		transform-box: fill-box;
		transform-origin: center;
		animation: pop 0.45s var(--ease-spring) both;
		transition:
			opacity 0.2s,
			filter 0.2s;
	}
	.plant.dim {
		opacity: 0.18;
		filter: grayscale(0.8);
	}
	.compact .plant {
		animation: none;
	}
	@keyframes pop {
		from {
			transform: scale(0) rotate(-40deg);
		}
	}
	.north {
		margin: 0 0 4px;
		text-align: center;
		font-size: 0.72rem;
		color: var(--muted);
	}
	figcaption {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 8px;
		margin-top: 10px;
		font-size: 0.82rem;
		color: var(--ink-2);
	}
	figcaption button {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 3px 10px 3px 4px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--card);
		color: inherit;
		font: inherit;
		cursor: pointer;
		transition:
			border-color 0.2s,
			transform 0.2s var(--ease-spring);
	}
	figcaption button:hover,
	figcaption button[aria-pressed='true'] {
		border-color: var(--leaf);
		transform: translateY(-1px);
	}
	.mini {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: #6b4a33;
	}
	figcaption small {
		align-self: center;
		color: var(--muted);
	}
</style>
