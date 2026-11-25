<script lang="ts">
	import type { TimedStep } from '$lib/timeline';

	let {
		steps,
		at,
		burners,
		oven,
		colorOf
	}: {
		steps: TimedStep[];
		/** Planned minute the cook is at: what's on the stove right now. */
		at: number;
		burners: number;
		oven: boolean;
		colorOf: (step: TimedStep) => string;
	} = $props();

	const active = $derived(steps.filter((s) => s.on && s.start <= at && at < s.end));
	/** One pot per part on the stove, in the order they went on. */
	const pots = $derived.by(() => {
		const seen = new Map<string, TimedStep>();
		for (const s of active)
			if (s.on === 'platna' && s.partId && !seen.has(s.partId)) seen.set(s.partId, s);
		return [...seen.values()].slice(0, burners);
	});
	const baking = $derived(active.filter((s) => s.on === 'rura'));
	const ovenTemp = $derived(baking[0]?.temp);
	const preheating = $derived(baking.length > 0 && baking.every((s) => s.preheat));

	const cols = $derived(burners <= 2 ? burners : burners <= 4 ? 2 : 3);
	const rows = $derived(Math.ceil(burners / cols));
	const W = 200;
	const burnerAt = (i: number) => {
		const c = i % cols;
		const r = Math.floor(i / cols);
		return { x: 20 + ((c + 0.5) * (W - 40)) / cols, y: 22 + ((r + 0.5) * 96) / rows };
	};
	const short = (name: string) => (name.length > 16 ? `${name.slice(0, 15)}…` : name);
</script>

<figure class="scene" aria-label="Čo je práve na sporáku a v rúre">
	<svg viewBox="0 0 {oven ? 330 : 210} 150">
		<rect x="4" y="6" width={W} height="128" rx="14" class="top" />
		{#each Array.from({ length: burners }, (_, i) => i) as i (i)}
			{@const b = burnerAt(i)}
			{@const pot = pots[i]}
			<g class="burner" class:on={!!pot}>
				<circle cx={b.x} cy={b.y} r={rows > 1 ? 22 : 28} class="ring" />
				<circle cx={b.x} cy={b.y} r={rows > 1 ? 13 : 17} class="ring inner" />
				{#if pot}
					{#key pot.partId}
						<g class="pot" style:--c={colorOf(pot)} style:transform-origin="{b.x}px {b.y}px">
							<circle cx={b.x} cy={b.y} r={rows > 1 ? 20 : 25} class="pan" />
							<circle cx={b.x} cy={b.y} r={rows > 1 ? 15 : 19} class="food" />
							<path d="M{b.x + (rows > 1 ? 20 : 25)} {b.y}h{rows > 1 ? 16 : 20}" class="handle" />
							{#if !pot.free}
								<path d="M{b.x - 6} {b.y - 4}l12 8" class="spoon" />
							{:else}
								<circle cx={b.x - 5} cy={b.y - 3} r="2.2" class="bubble" />
								<circle cx={b.x + 5} cy={b.y + 4} r="1.6" class="bubble b2" />
							{/if}
						</g>
						<text x={b.x} y={b.y + (rows > 1 ? 34 : 42)} class="label">{short(pot.partName)}</text>
					{/key}
				{/if}
			</g>
		{/each}

		{#if oven}
			<g class="oven" class:hot={baking.length > 0}>
				<rect x="214" y="6" width="110" height="128" rx="14" class="body" />
				<rect x="226" y="34" width="86" height="72" rx="8" class="window" />
				<rect x="226" y="34" width="86" height="72" rx="8" class="glow" />
				{#each baking.filter((s) => !s.preheat).slice(0, 2) as s, i (s.partId)}
					<rect
						x="236"
						y={64 + i * 18}
						width="66"
						height="7"
						rx="2"
						fill={colorOf(s)}
						class="tray"
					/>
				{/each}
				<circle cx="244" cy="20" r="5" class="knob" />
				<circle cx="294" cy="20" r="5" class="knob" />
				<text x="269" y="124" class="temp">
					{ovenTemp ? `${ovenTemp} °C${preheating ? ' · hreje' : ''}` : 'rúra'}
				</text>
			</g>
		{/if}
	</svg>
</figure>

<style>
	.scene {
		margin: 0;
	}
	svg {
		display: block;
		width: 100%;
		height: auto;
		max-height: 220px;
	}
	.top {
		fill: #22282a;
	}
	.ring {
		fill: none;
		stroke: rgb(255 255 255 / 0.22);
		stroke-width: 2.5;
		transition: stroke 0.4s;
	}
	.burner.on .ring {
		stroke: var(--tomato);
		filter: drop-shadow(0 0 4px var(--tomato));
		animation: flicker 1.6s ease-in-out infinite;
	}
	@keyframes flicker {
		50% {
			opacity: 0.6;
		}
	}
	.pot {
		animation: set-down 0.5s var(--ease-spring);
	}
	@keyframes set-down {
		from {
			transform: scale(1.3);
			opacity: 0;
		}
	}
	.pan {
		fill: #5a6168;
		stroke: #2c3136;
		stroke-width: 2;
	}
	.food {
		fill: var(--c);
	}
	.handle {
		stroke: #2c3136;
		stroke-width: 5;
		stroke-linecap: round;
	}
	.spoon {
		stroke: #d9b98a;
		stroke-width: 3;
		stroke-linecap: round;
		animation: stir 1.4s ease-in-out infinite;
		transform-box: fill-box;
		transform-origin: center;
	}
	@keyframes stir {
		50% {
			transform: rotate(40deg);
		}
	}
	.bubble {
		fill: #fff;
		opacity: 0.7;
		animation: bubble 1.2s ease-in-out infinite;
	}
	.b2 {
		animation-delay: 0.5s;
	}
	@keyframes bubble {
		50% {
			opacity: 0.1;
			transform: translateY(-2px);
		}
	}
	.label {
		fill: #f0e9da;
		font-size: 9px;
		font-weight: 700;
		text-anchor: middle;
	}
	.body {
		fill: #2d3437;
	}
	.window {
		fill: #1b1f22;
	}
	.glow {
		fill: #f08a3c;
		opacity: 0;
		transition: opacity 0.6s;
	}
	.oven.hot .glow {
		opacity: 0.35;
		animation: flicker 2.4s ease-in-out infinite;
	}
	.knob {
		fill: rgb(255 255 255 / 0.4);
	}
	.temp {
		fill: #f0e9da;
		font-size: 11px;
		font-weight: 700;
		text-anchor: middle;
	}
	@media (prefers-reduced-motion: reduce) {
		.burner.on .ring,
		.pot,
		.spoon,
		.bubble,
		.oven.hot .glow {
			animation: none;
		}
	}
</style>
