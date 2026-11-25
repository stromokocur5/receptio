<script lang="ts">
	import { formatNumber } from '$lib/amounts';
	import { DAILY_REFERENCE, NUTRIENT_META, SALT_HIGH_G } from '$lib/nutrition';
	import type { NutrientKey, Nutrients } from '$lib/types';

	let {
		values,
		compact = false,
		label = 'Na porciu'
	}: {
		values: Nutrients;
		/** Just the headline numbers, for tight spots. */
		compact?: boolean;
		label?: string;
	} = $props();

	const HEADLINE: NutrientKey[] = ['kcal', 'protein', 'carbs', 'fat', 'fiber', 'salt'];
	const MICROS: NutrientKey[] = ['iron', 'calcium', 'zinc', 'ala', 'b12'];
	const num = (key: NutrientKey) => {
		const v = values[key];
		return formatNumber(v, key === 'kcal' || v >= 10 ? 0 : 1);
	};
	const pct = (key: NutrientKey) =>
		DAILY_REFERENCE[key] > 0 ? (values[key] / DAILY_REFERENCE[key]) * 100 : 0;
	/** Share of energy from protein, carbs and fat, for the strip under the numbers. */
	const energy = $derived.by(() => {
		const p = values.protein * 4;
		const c = values.carbs * 4;
		const f = values.fat * 9;
		const total = p + c + f || 1;
		return { p: (p / total) * 100, c: (c / total) * 100, f: (f / total) * 100 };
	});
</script>

<div class="nutrition" class:compact>
	<dl class="headline">
		{#each HEADLINE as key (key)}
			<div class:warn={key === 'salt' && values.salt > SALT_HIGH_G}>
				<dt>{NUTRIENT_META[key].label}</dt>
				<dd>{num(key)} <small>{NUTRIENT_META[key].unit}</small></dd>
			</div>
		{/each}
	</dl>
	<div
		class="split"
		aria-label="Energia: bielkoviny {formatNumber(energy.p, 0)} %, sacharidy {formatNumber(
			energy.c,
			0
		)} %, tuky {formatNumber(energy.f, 0)} %"
	>
		<span class="p" style:width="{energy.p}%"></span>
		<span class="c" style:width="{energy.c}%"></span>
		<span class="f" style:width="{energy.f}%"></span>
	</div>
	<p class="legend">
		<span><i class="p"></i> bielkoviny {formatNumber(energy.p, 0)} %</span>
		<span><i class="c"></i> sacharidy {formatNumber(energy.c, 0)} %</span>
		<span><i class="f"></i> tuky {formatNumber(energy.f, 0)} %</span>
	</p>

	{#if !compact}
		<ul class="bars">
			{#each MICROS as key, i (key)}
				{@const p = pct(key)}
				<li style:--i={i}>
					<span class="name">{NUTRIENT_META[key].label}</span>
					<span class="track"><span class="fill" style:--w="{Math.min(p, 100)}%"></span></span>
					<span class="value">{num(key)} {NUTRIENT_META[key].unit} · {formatNumber(p, 0)} %</span>
				</li>
			{/each}
		</ul>
		<p class="note">
			{label}, % z denného odporúčania pre dospelého. Vitamín B12 rastlinná strava nemá – ber ho ako
			doplnok.
		</p>
	{/if}
</div>

<style>
	.nutrition {
		display: grid;
		gap: var(--sp-3);
	}
	.headline {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: var(--sp-2);
		margin: 0;
	}
	.headline div {
		padding: var(--sp-2) var(--sp-3);
		border-radius: var(--radius-sm);
		background: var(--sunk);
	}
	.headline .warn {
		background: var(--tomato-soft);
	}
	dt {
		color: var(--muted);
		font-size: var(--fs-xs);
		font-weight: 700;
	}
	dd {
		margin: 2px 0 0;
		font-family: var(--font-display);
		font-size: var(--fs-lg);
		font-weight: 650;
		font-variant-numeric: tabular-nums;
	}
	dd small {
		font-family: var(--font-body);
		font-size: var(--fs-xs);
		font-weight: 600;
		color: var(--muted);
	}
	.split {
		display: flex;
		height: 10px;
		overflow: hidden;
		border-radius: 999px;
		background: var(--line);
	}
	.split span {
		animation: grow 0.8s var(--ease-out) both;
		transform-origin: left;
	}
	.p {
		background: var(--leaf);
	}
	.c {
		background: var(--turmeric);
	}
	.f {
		background: var(--tomato);
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-1) var(--sp-3);
		margin: calc(-1 * var(--sp-1)) 0 0;
		color: var(--ink-2);
		font-size: var(--fs-xs);
		font-weight: 600;
	}
	.legend span {
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}
	.legend i {
		width: 9px;
		height: 9px;
		border-radius: 50%;
	}
	.bars {
		display: grid;
		gap: var(--sp-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.bars li {
		display: grid;
		grid-template-columns: 7.5em 1fr auto;
		align-items: center;
		gap: var(--sp-2);
		font-size: var(--fs-sm);
	}
	.name {
		font-weight: 650;
	}
	.track {
		height: 8px;
		overflow: hidden;
		border-radius: 999px;
		background: color-mix(in srgb, var(--line) 80%, transparent);
	}
	.fill {
		display: block;
		width: var(--w);
		height: 100%;
		border-radius: inherit;
		background: linear-gradient(90deg, var(--leaf-2), var(--leaf));
		animation: grow 0.9s var(--ease-out) both;
		animation-delay: calc(var(--i) * 60ms);
		transform-origin: left;
	}
	.value {
		color: var(--ink-2);
		font-size: var(--fs-xs);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.note {
		margin: 0;
		color: var(--muted);
		font-size: var(--fs-xs);
	}
	.compact .headline {
		grid-template-columns: repeat(3, 1fr);
	}
	@keyframes grow {
		from {
			transform: scaleX(0);
		}
	}
	@media (min-width: 560px) {
		.headline {
			grid-template-columns: repeat(6, 1fr);
		}
		.compact .headline {
			grid-template-columns: repeat(3, 1fr);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.split span,
		.fill {
			animation: none;
		}
	}
</style>
