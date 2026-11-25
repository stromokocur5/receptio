<script lang="ts" module>
	/** One colour per lane, the same on the plan and in cook mode. */
	export const LANE_COLORS = ['--leaf', '--tomato', '--sky', '--turmeric', '--plum'] as const;
	export const laneColor = (index: number) => `var(${LANE_COLORS[index % LANE_COLORS.length]})`;
</script>

<script lang="ts">
	import { formatMinutes } from '$lib/amounts';
	import { APPLIANCE_LABELS } from '$lib/dish';
	import type { Timeline } from '$lib/timeline';

	let {
		timeline,
		lanes,
		now
	}: {
		timeline: Timeline;
		/** Part ids in display order; null is putting the plate together. */
		lanes: { id: string | null; name: string }[];
		/** Minutes since cooking started, to draw a "now" line. */
		now?: number;
	} = $props();

	const pct = (minutes: number) => `${(minutes / Math.max(1, timeline.total)) * 100}%`;
	const ticks = $derived.by(() => {
		const every = timeline.total > 60 ? 15 : timeline.total > 25 ? 10 : 5;
		return Array.from({ length: Math.floor(timeline.total / every) + 1 }, (_, i) => i * every);
	});
</script>

<figure class="chart" aria-label="Časový plán varenia, spolu {formatMinutes(timeline.total)}">
	<div class="rows">
		{#each lanes as lane, i (lane.id ?? 'finish')}
			{@const steps = timeline.steps.filter((s) => s.partId === lane.id)}
			<div class="row" style:--c={lane.id === null ? 'var(--ink-2)' : laneColor(i)}>
				<span class="name">{lane.name}</span>
				<div class="track">
					{#each steps as step, j (j)}
						<span
							class="bar"
							class:free={step.free}
							style:left={pct(step.start)}
							style:width={pct(step.end - step.start)}
							title="{step.start}.–{step.end}. min{step.on
								? ` · ${APPLIANCE_LABELS[step.on]}`
								: ''}{step.free ? ' · ruky voľné' : ''}"
						></span>
					{/each}
				</div>
			</div>
		{/each}
		{#if now !== undefined && now <= timeline.total}
			<span
				class="now"
				style:left="calc(var(--name-w) + (100% - var(--name-w)) * {now /
					Math.max(1, timeline.total)})"
			></span>
		{/if}
	</div>
	<div class="axis" aria-hidden="true">
		{#each ticks as t (t)}
			<span style:left={pct(t)}>{t}′</span>
		{/each}
	</div>
	<figcaption class="legend">
		<span><i class="key busy"></i> robíš</span>
		<span><i class="key free"></i> varí sa samo</span>
	</figcaption>
</figure>

<style>
	.chart {
		--name-w: 34%;
		margin: 0;
	}
	.rows {
		position: relative;
		display: grid;
		gap: 6px;
	}
	.row {
		display: grid;
		grid-template-columns: var(--name-w) 1fr;
		align-items: center;
		gap: 0;
	}
	.name {
		overflow: hidden;
		padding-right: var(--sp-2);
		font-size: var(--fs-sm);
		font-weight: 650;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.track {
		position: relative;
		height: 22px;
		border-radius: 6px;
		background: var(--sunk);
	}
	.bar {
		position: absolute;
		top: 2px;
		bottom: 2px;
		min-width: 3px;
		border-radius: 5px;
		background: var(--c);
		animation: grow 0.6s var(--ease-out) both;
		transform-origin: left;
	}
	.bar.free {
		background: repeating-linear-gradient(
			-45deg,
			color-mix(in srgb, var(--c) 55%, transparent) 0 4px,
			color-mix(in srgb, var(--c) 25%, transparent) 4px 8px
		);
	}
	@keyframes grow {
		from {
			transform: scaleX(0);
		}
	}
	.now {
		position: absolute;
		top: -4px;
		bottom: -4px;
		width: 2px;
		border-radius: 2px;
		background: var(--tomato);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--tomato) 25%, transparent);
		transition: left 1s linear;
	}
	.axis {
		position: relative;
		height: 18px;
		margin-left: var(--name-w);
		color: var(--muted);
		font-size: var(--fs-xs);
	}
	.axis span {
		position: absolute;
		top: 2px;
		translate: -50% 0;
	}
	.axis span:first-child {
		translate: 0 0;
	}
	.legend {
		display: flex;
		gap: var(--sp-4);
		margin-top: var(--sp-1);
		color: var(--muted);
		font-size: var(--fs-xs);
	}
	.legend span {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.key {
		width: 18px;
		height: 10px;
		border-radius: 3px;
		background: var(--ink-2);
	}
	.key.free {
		background: repeating-linear-gradient(
			-45deg,
			color-mix(in srgb, var(--ink-2) 55%, transparent) 0 3px,
			color-mix(in srgb, var(--ink-2) 20%, transparent) 3px 6px
		);
	}
	@media (prefers-reduced-motion: reduce) {
		.bar {
			animation: none;
		}
		.now {
			transition: none;
		}
	}
</style>
