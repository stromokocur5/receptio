<script lang="ts">
	import { formatNumber } from '$lib/amounts';
	import { NUTRIENT_META } from '$lib/nutrition';
	import type { NutrientKey, Nutrients } from '$lib/types';

	let {
		values,
		targets,
		keys,
		limitKeys = ['salt']
	}: {
		values: Nutrients;
		targets: Nutrients;
		keys: NutrientKey[];
		/** Nutrients where the target is an upper limit, not a goal. */
		limitKeys?: NutrientKey[];
	} = $props();
</script>

<ul class="bars">
	{#each keys as key, i (key)}
		{@const pct = targets[key] > 0 ? (values[key] / targets[key]) * 100 : 0}
		{@const isLimit = limitKeys.includes(key)}
		<li style:--i={i}>
			<div class="row">
				<span class="label">{NUTRIENT_META[key].label}</span>
				<span class="value">
					{formatNumber(values[key], values[key] < 10 ? 1 : 0)}
					{NUTRIENT_META[key].unit}
					<span class="pct">{formatNumber(pct, 0)} %</span>
				</span>
			</div>
			<div class="track" class:limit={isLimit} class:over={isLimit && pct > 50}>
				<div class="fill" style:--w="{Math.min(pct, 100)}%"></div>
			</div>
		</li>
	{/each}
</ul>

<style>
	.bars {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 12px;
	}
	.row {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		font-size: 0.88rem;
		margin-bottom: 4px;
	}
	.label {
		font-weight: 600;
	}
	.value {
		font-variant-numeric: tabular-nums;
		color: var(--ink-2);
	}
	.pct {
		color: var(--muted);
		margin-left: 4px;
		font-size: 0.8rem;
	}
	.track {
		height: 8px;
		border-radius: 999px;
		background: var(--paper-2);
		overflow: hidden;
	}
	.fill {
		height: 100%;
		width: var(--w);
		border-radius: inherit;
		background: linear-gradient(90deg, var(--leaf-2), var(--leaf));
		transform-origin: left;
		animation: grow 0.9s var(--ease-out) both;
		animation-delay: calc(var(--i) * 60ms);
	}
	.limit .fill {
		background: var(--turmeric);
	}
	.over .fill {
		background: var(--tomato);
	}
	@keyframes grow {
		from {
			transform: scaleX(0);
		}
	}
</style>
