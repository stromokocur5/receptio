<script lang="ts" module>
	/**
	 * Chart colors per shop, in the fixed order shops are listed in prices.yaml. Brand colors
	 * can't be used: Kaufland, Fresh and COOP are all red, Lidl and Tesco both blue. The palette
	 * is validated for colour blindness on the card surface in both themes (dataviz validator).
	 */
	export const SERIES_SLOTS = 8;
</script>

<script lang="ts">
	import { formatEur } from '$lib/amounts';
	import type { IngredientTimeline } from '$lib/price-history';
	import type { Store } from '$lib/types';

	let {
		timeline,
		stores,
		title
	}: {
		timeline: IngredientTimeline;
		/** Every walk-in shop in the catalog's order – a shop's colour follows it everywhere. */
		stores: Store[];
		title: string;
	} = $props();

	const HEIGHT = 220;
	const PAD = { top: 12, right: 24, bottom: 28, left: 52 };
	let width = $state(640);
	let hover = $state<number | null>(null);
	let showTable = $state(false);

	const slotOf = (storeId: string) => {
		const index = stores.findIndex((s) => s.id === storeId);
		return index >= 0 && index < SERIES_SLOTS ? index + 1 : null;
	};
	const nameOf = (storeId: string) => stores.find((s) => s.id === storeId)?.name ?? storeId;

	const lines = $derived(
		timeline.stores
			.filter((s) => s.regular.some((v) => v !== null) || s.sale.some((v) => v !== null))
			.toSorted((a, b) => (slotOf(a.storeId) ?? 99) - (slotOf(b.storeId) ?? 99))
	);
	const values = $derived(
		lines.flatMap((l) => [...l.regular, ...l.sale]).filter((v): v is number => v !== null)
	);
	const yDomain = $derived.by(() => {
		const min = Math.min(...values);
		const max = Math.max(...values);
		const pad = Math.max((max - min) * 0.15, max * 0.05, 0.05);
		return [Math.max(0, min - pad), max + pad] as const;
	});
	const time = (d: string) => new Date(`${d}T00:00:00Z`).getTime();
	const xDomain = $derived([time(timeline.days[0]), time(timeline.days.at(-1)!)] as const);
	const plotW = $derived(Math.max(100, width - PAD.left - PAD.right));
	const plotH = HEIGHT - PAD.top - PAD.bottom;
	const x = (d: string) =>
		PAD.left +
		(xDomain[1] === xDomain[0]
			? plotW / 2
			: ((time(d) - xDomain[0]) / (xDomain[1] - xDomain[0])) * plotW);
	const y = (v: number) => PAD.top + plotH - ((v - yDomain[0]) / (yDomain[1] - yDomain[0])) * plotH;

	/** Step line: a price holds until the day it changes; gaps where the shop didn't list it. */
	function stepPath(series: (number | null)[]): string {
		let path = '';
		let prev: number | null = null;
		timeline.days.forEach((day, i) => {
			const v = series[i];
			if (v === null) {
				prev = null;
				return;
			}
			path += prev === null ? `M${x(day)},${y(v)}` : `H${x(day)}V${y(v)}`;
			prev = v;
		});
		return path;
	}

	const ticksY = $derived.by(() => {
		const [lo, hi] = yDomain;
		const raw = (hi - lo) / 4;
		const magnitude = 10 ** Math.floor(Math.log10(raw));
		const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw)!;
		const ticks: number[] = [];
		for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);
		return ticks;
	});
	const dayLabel = new Intl.DateTimeFormat('sk', { day: 'numeric', month: 'numeric' });
	const fmtDay = (d: string) => dayLabel.format(new Date(`${d}T00:00:00Z`));
	const ticksX = $derived.by(() => {
		const count = Math.max(2, Math.min(6, Math.floor(plotW / 90)));
		const days = timeline.days;
		if (days.length <= count) return days;
		return Array.from(
			{ length: count },
			(_, i) => days[Math.round((i * (days.length - 1)) / (count - 1))]
		);
	});

	function pick(event: PointerEvent) {
		const rect = (event.currentTarget as SVGElement).getBoundingClientRect();
		const px = event.clientX - rect.left;
		let best = 0;
		timeline.days.forEach((d, i) => {
			if (Math.abs(x(d) - px) < Math.abs(x(timeline.days[best]) - px)) best = i;
		});
		hover = best;
	}
	function key(event: KeyboardEvent) {
		const last = timeline.days.length - 1;
		if (event.key === 'ArrowRight') hover = Math.min(last, (hover ?? -1) + 1);
		else if (event.key === 'ArrowLeft') hover = Math.max(0, (hover ?? last + 1) - 1);
		else return;
		event.preventDefault();
	}
	/** What a screen reader hears for a day: the date and every shop's price. */
	function readout(i: number): string {
		const prices = lines.flatMap((l) => {
			const v = l.sale[i] ?? l.regular[i];
			return v === null
				? []
				: [`${nameOf(l.storeId)} ${formatEur(v)}${l.sale[i] !== null ? ' v akcii' : ''}`];
		});
		return `${fmtDay(timeline.days[i])}: ${prices.join(', ') || 'bez ceny'}`;
	}
	const tooltipLeft = $derived(hover === null ? 0 : x(timeline.days[hover]));
</script>

<figure class="viz-root">
	<figcaption>
		<span class="title">{title}</span>
		<button class="linkish" onclick={() => (showTable = !showTable)} aria-pressed={showTable}>
			{showTable ? 'Graf' : 'Tabuľka'}
		</button>
	</figcaption>
	<ul class="legend" aria-label="Obchody">
		{#each lines as line (line.storeId)}
			<li>
				<svg width="16" height="8" aria-hidden="true"
					><line
						x1="0"
						y1="4"
						x2="16"
						y2="4"
						class="s{slotOf(line.storeId) ?? 'x'}"
						stroke-width="2"
					/></svg
				>
				{nameOf(line.storeId)}
			</li>
		{/each}
		{#if lines.some((l) => l.sale.some((v) => v !== null))}
			<li><span class="dot-key" aria-hidden="true"></span> akcia</li>
		{/if}
	</ul>

	{#if showTable}
		<div class="table-wrap">
			<table>
				<thead>
					<tr>
						<th scope="col">Deň</th>
						{#each lines as line (line.storeId)}<th scope="col">{nameOf(line.storeId)}</th>{/each}
					</tr>
				</thead>
				<tbody>
					{#each timeline.days.toReversed() as day, ri (day)}
						{@const i = timeline.days.length - 1 - ri}
						<tr>
							<th scope="row">{fmtDay(day)}</th>
							{#each lines as line (line.storeId)}
								<td>
									{line.regular[i] === null ? '–' : formatEur(line.regular[i]!)}
									{#if line.sale[i] !== null}<span class="sale"
											>akcia {formatEur(line.sale[i]!)}</span
										>{/if}
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
			<p class="muted small">Ceny za {timeline.unit}.</p>
		</div>
	{:else}
		<div class="plot" bind:clientWidth={width}>
			<svg
				{width}
				height={HEIGHT}
				role="slider"
				aria-label="{title}: cena za {timeline.unit} podľa obchodov, šípkami prechádzaš dni"
				aria-valuemin={0}
				aria-valuemax={timeline.days.length - 1}
				aria-valuenow={hover ?? timeline.days.length - 1}
				aria-valuetext={readout(hover ?? timeline.days.length - 1)}
				tabindex="0"
				onpointermove={pick}
				onpointerleave={() => (hover = null)}
				onkeydown={key}
				onblur={() => (hover = null)}
			>
				{#each ticksY as t (t)}
					<line class="grid" x1={PAD.left} x2={PAD.left + plotW} y1={y(t)} y2={y(t)} />
					<text class="axis" x={PAD.left - 6} y={y(t)} text-anchor="end" dominant-baseline="middle"
						>{formatEur(t)}</text
					>
				{/each}
				{#each ticksX as d (d)}
					<text class="axis" x={x(d)} y={HEIGHT - 8} text-anchor="middle">{fmtDay(d)}</text>
				{/each}
				{#if hover !== null}
					<line
						class="cross"
						x1={x(timeline.days[hover])}
						x2={x(timeline.days[hover])}
						y1={PAD.top}
						y2={PAD.top + plotH}
					/>
				{/if}
				{#each lines as line (line.storeId)}
					{@const slot = slotOf(line.storeId) ?? 'x'}
					<path class="line s{slot}" d={stepPath(line.regular)} />
					{#each line.regular as v, i (i)}
						<!-- A lone day has no neighbour to draw a line to, so it shows as a point. -->
						{#if v !== null && line.regular[i - 1] == null && line.regular[i + 1] == null}
							<circle class="point s{slot}" cx={x(timeline.days[i])} cy={y(v)} r="3" />
						{/if}
					{/each}
					{#each line.sale as v, i (i)}
						{#if v !== null}
							<circle class="sale-dot s{slot}" cx={x(timeline.days[i])} cy={y(v)} r="4.5" />
						{/if}
					{/each}
				{/each}
			</svg>
			{#if hover !== null}
				<div
					class="tip"
					style:left="{Math.min(Math.max(tooltipLeft, 90), width - 90)}px"
					role="status"
				>
					<strong class="tip-day">{fmtDay(timeline.days[hover])}</strong>
					{#each lines as line (line.storeId)}
						{@const v = line.regular[hover]}
						{@const s = line.sale[hover]}
						{#if v !== null || s !== null}
							<span class="tip-row">
								<svg width="12" height="8" aria-hidden="true"
									><line
										x1="0"
										y1="4"
										x2="12"
										y2="4"
										class="s{slotOf(line.storeId) ?? 'x'}"
										stroke-width="2"
									/></svg
								>
								<b>{s !== null ? formatEur(s) : formatEur(v!)}</b>
								<span class="muted">{nameOf(line.storeId)}{s !== null ? ' · akcia' : ''}</span>
							</span>
						{/if}
					{/each}
				</div>
			{/if}
		</div>
		<p class="muted small unit">
			Cena za {timeline.unit}, najlacnejší produkt v obchode v daný deň.
		</p>
	{/if}
</figure>

<style>
	.viz-root {
		--s1: #2a78d6;
		--s2: #eb6834;
		--s3: #1baf7a;
		--s4: #eda100;
		--s5: #e87ba4;
		--s6: #008300;
		--s7: #4a3aa7;
		--s8: #e34948;
		--sx: #8a8a85;
		margin: 0;
		position: relative;
	}
	@media (prefers-color-scheme: dark) {
		:global(:root:where(:not([data-theme='light']))) .viz-root {
			--s1: #3987e5;
			--s2: #d95926;
			--s3: #199e70;
			--s4: #c98500;
			--s5: #d55181;
			--s6: #008300;
			--s7: #9085e9;
			--s8: #e66767;
		}
	}
	:global(:root[data-theme='dark']) .viz-root {
		--s1: #3987e5;
		--s2: #d95926;
		--s3: #199e70;
		--s4: #c98500;
		--s5: #d55181;
		--s6: #008300;
		--s7: #9085e9;
		--s8: #e66767;
	}
	.s1 {
		--c: var(--s1);
	}
	.s2 {
		--c: var(--s2);
	}
	.s3 {
		--c: var(--s3);
	}
	.s4 {
		--c: var(--s4);
	}
	.s5 {
		--c: var(--s5);
	}
	.s6 {
		--c: var(--s6);
	}
	.s7 {
		--c: var(--s7);
	}
	.s8 {
		--c: var(--s8);
	}
	.sx {
		--c: var(--sx);
	}
	figcaption {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 12px;
	}
	.title {
		font-weight: 700;
	}
	.legend {
		list-style: none;
		display: flex;
		flex-wrap: wrap;
		gap: 4px 14px;
		margin: 8px 0;
		padding: 0;
		font-size: 0.85rem;
		color: var(--ink-2);
	}
	.legend li {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.legend line,
	.tip-row line {
		stroke: var(--c);
	}
	.dot-key {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: var(--ink-2);
		box-shadow: 0 0 0 2px var(--card);
	}
	.plot {
		position: relative;
		width: 100%;
	}
	svg[role='slider'] {
		display: block;
		touch-action: pan-y;
	}
	svg[role='slider']:focus-visible {
		outline: 2px solid var(--leaf);
		outline-offset: 2px;
		border-radius: 4px;
	}
	.grid {
		stroke: var(--line);
		stroke-width: 1;
	}
	.cross {
		stroke: var(--ink-2);
		stroke-width: 1;
	}
	.axis {
		fill: var(--muted);
		font-size: 11px;
		font-variant-numeric: tabular-nums;
	}
	.line {
		fill: none;
		stroke: var(--c);
		stroke-width: 2;
		stroke-linejoin: round;
	}
	.point {
		fill: var(--c);
	}
	.sale-dot {
		fill: var(--c);
		stroke: var(--card);
		stroke-width: 2;
	}
	.tip {
		position: absolute;
		top: 0;
		transform: translateX(-50%);
		pointer-events: none;
		display: grid;
		gap: 2px;
		min-width: 150px;
		padding: 8px 10px;
		border-radius: 10px;
		background: var(--card);
		border: 1px solid var(--line);
		box-shadow: 0 6px 20px rgb(0 0 0 / 0.12);
		font-size: 0.82rem;
	}
	.tip-day {
		font-size: 0.78rem;
		color: var(--ink-2);
	}
	.tip-row {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.tip-row b {
		font-variant-numeric: tabular-nums;
		color: var(--ink);
	}
	.unit {
		margin: 4px 0 0;
	}
	.small {
		font-size: 0.8rem;
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
	.table-wrap {
		overflow-x: auto;
	}
	table {
		border-collapse: collapse;
		font-size: 0.85rem;
		font-variant-numeric: tabular-nums;
		width: 100%;
	}
	th,
	td {
		text-align: left;
		padding: 4px 8px;
		border-bottom: 1px solid var(--line);
		white-space: nowrap;
	}
	.sale {
		display: block;
		font-size: 0.75rem;
		color: color-mix(in srgb, var(--tomato) 70%, var(--ink));
	}
</style>
