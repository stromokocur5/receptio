<script lang="ts">
	import { formatEur, formatNumber } from '$lib/amounts';
	import type { BasketDay } from '$lib/basket';

	let { days }: { days: BasketDay[] } = $props();

	const HEIGHT = 200;
	const PAD = { top: 14, right: 24, bottom: 28, left: 52 };
	let width = $state(300);
	let hover = $state<number | null>(null);
	let showTable = $state(false);

	const time = (d: string) => new Date(`${d}T00:00:00Z`).getTime();
	const plotW = $derived(Math.max(100, width - PAD.left - PAD.right));
	const plotH = HEIGHT - PAD.top - PAD.bottom;
	const yDomain = $derived.by(() => {
		const costs = days.map((d) => d.cost);
		const min = Math.min(...costs);
		const max = Math.max(...costs);
		const pad = Math.max((max - min) * 0.3, max * 0.03);
		return [min - pad, max + pad] as const;
	});
	const x = (d: string) => {
		const [a, b] = [time(days[0].date), time(days.at(-1)!.date)];
		return PAD.left + (a === b ? plotW / 2 : ((time(d) - a) / (b - a)) * plotW);
	};
	const y = (v: number) => PAD.top + plotH - ((v - yDomain[0]) / (yDomain[1] - yDomain[0])) * plotH;
	const path = $derived(days.map((d, i) => `${i ? 'L' : 'M'}${x(d.date)},${y(d.cost)}`).join(''));
	const ticks = $derived.by(() => {
		const [lo, hi] = yDomain;
		const raw = (hi - lo) / 4;
		const magnitude = 10 ** Math.floor(Math.log10(raw));
		const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw)!;
		const out: number[] = [];
		for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(v);
		return out;
	});
	const dayLabel = new Intl.DateTimeFormat('sk', { day: 'numeric', month: 'numeric' });
	const fmtDay = (d: string) => dayLabel.format(new Date(`${d}T00:00:00Z`));
	const xTicks = $derived.by(() => {
		const count = Math.max(2, Math.min(6, Math.floor(plotW / 90)));
		if (days.length <= count) return days.map((d) => d.date);
		return Array.from(
			{ length: count },
			(_, i) => days[Math.round((i * (days.length - 1)) / (count - 1))].date
		);
	});
	const readout = (i: number) =>
		`${fmtDay(days[i].date)}: ${formatEur(days[i].cost)}, index ${formatNumber(days[i].index, 1)}`;

	function pick(event: PointerEvent) {
		const px = event.clientX - (event.currentTarget as SVGElement).getBoundingClientRect().left;
		let best = 0;
		days.forEach((d, i) => {
			if (Math.abs(x(d.date) - px) < Math.abs(x(days[best].date) - px)) best = i;
		});
		hover = best;
	}
	function key(event: KeyboardEvent) {
		const last = days.length - 1;
		if (event.key === 'ArrowRight') hover = Math.min(last, (hover ?? -1) + 1);
		else if (event.key === 'ArrowLeft') hover = Math.max(0, (hover ?? last + 1) - 1);
		else return;
		event.preventDefault();
	}
</script>

<figure class="viz-root">
	<figcaption>
		<span>Cena košíka</span>
		<button class="linkish" onclick={() => (showTable = !showTable)} aria-pressed={showTable}>
			{showTable ? 'Graf' : 'Tabuľka'}
		</button>
	</figcaption>
	{#if showTable}
		<div class="table-wrap">
			<table>
				<thead>
					<tr><th scope="col">Deň</th><th scope="col">Cena</th><th scope="col">Index</th></tr>
				</thead>
				<tbody>
					{#each days.toReversed() as d (d.date)}
						<tr>
							<th scope="row">{fmtDay(d.date)}</th>
							<td>{formatEur(d.cost)}</td>
							<td>{formatNumber(d.index, 1)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else}
		<div class="plot" bind:clientWidth={width}>
			<svg
				{width}
				height={HEIGHT}
				role="slider"
				tabindex="0"
				aria-label="Cena košíka deň po dni, šípkami prechádzaš dni"
				aria-valuemin={0}
				aria-valuemax={days.length - 1}
				aria-valuenow={hover ?? days.length - 1}
				aria-valuetext={readout(hover ?? days.length - 1)}
				onpointermove={pick}
				onpointerleave={() => (hover = null)}
				onkeydown={key}
				onblur={() => (hover = null)}
			>
				{#each ticks as t (t)}
					<line class="grid" x1={PAD.left} x2={PAD.left + plotW} y1={y(t)} y2={y(t)} />
					<text class="axis" x={PAD.left - 6} y={y(t)} text-anchor="end" dominant-baseline="middle"
						>{formatEur(t)}</text
					>
				{/each}
				{#each xTicks as d (d)}
					<text class="axis" x={x(d)} y={HEIGHT - 8} text-anchor="middle">{fmtDay(d)}</text>
				{/each}
				{#if hover !== null}
					<line
						class="cross"
						x1={x(days[hover].date)}
						x2={x(days[hover].date)}
						y1={PAD.top}
						y2={PAD.top + plotH}
					/>
				{/if}
				<path class="line" d={path} />
				{#each days as d, i (d.date)}
					<circle
						class="dot"
						class:on={hover === i}
						cx={x(d.date)}
						cy={y(d.cost)}
						r={hover === i ? 5 : 3}
					/>
				{/each}
				<text class="end" x={x(days.at(-1)!.date)} y={y(days.at(-1)!.cost) - 10} text-anchor="end"
					>{formatEur(days.at(-1)!.cost)}</text
				>
			</svg>
			{#if hover !== null}
				<div
					class="tip"
					style:left="{Math.min(Math.max(x(days[hover].date), 80), width - 80)}px"
					role="status"
				>
					<strong>{formatEur(days[hover].cost)}</strong>
					<span class="muted"
						>{fmtDay(days[hover].date)} · index {formatNumber(days[hover].index, 1)}</span
					>
				</div>
			{/if}
		</div>
	{/if}
</figure>

<style>
	.viz-root {
		--series: #2a78d6;
		margin: 0;
		min-width: 0;
	}
	@media (prefers-color-scheme: dark) {
		:global(:root:where(:not([data-theme='light']))) .viz-root {
			--series: #3987e5;
		}
	}
	:global(:root[data-theme='dark']) .viz-root {
		--series: #3987e5;
	}
	figcaption {
		display: flex;
		justify-content: space-between;
		font-weight: 700;
		margin-bottom: 6px;
	}
	.linkish {
		border: 0;
		background: none;
		padding: 0;
		color: var(--plum);
		font-weight: 600;
		text-decoration: underline;
		cursor: pointer;
	}
	/* Sized from its box, never the other way round (see PriceChart). */
	.plot {
		position: relative;
		width: 100%;
		contain: inline-size;
	}
	svg {
		display: block;
		touch-action: pan-y;
	}
	svg:focus-visible {
		outline: 2px solid var(--leaf);
		outline-offset: 2px;
		border-radius: 4px;
	}
	.grid {
		stroke: var(--line);
	}
	.cross {
		stroke: var(--ink-2);
	}
	.axis {
		fill: var(--muted);
		font-size: 11px;
		font-variant-numeric: tabular-nums;
	}
	.line {
		fill: none;
		stroke: var(--series);
		stroke-width: 2;
		stroke-linejoin: round;
	}
	.dot {
		fill: var(--series);
		stroke: var(--card);
		stroke-width: 2;
	}
	.end {
		fill: var(--ink);
		font-size: 12px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.tip {
		position: absolute;
		top: 0;
		transform: translateX(-50%);
		pointer-events: none;
		display: grid;
		gap: 2px;
		padding: 6px 10px;
		border-radius: 10px;
		background: var(--card);
		border: 1px solid var(--line);
		box-shadow: 0 6px 20px rgb(0 0 0 / 0.12);
		font-size: 0.82rem;
		font-variant-numeric: tabular-nums;
	}
	.table-wrap {
		overflow-x: auto;
		contain: inline-size;
	}
	table {
		border-collapse: collapse;
		width: 100%;
		font-size: 0.86rem;
		font-variant-numeric: tabular-nums;
	}
	th,
	td {
		text-align: left;
		padding: 4px 8px;
		border-bottom: 1px solid var(--line);
	}
</style>
