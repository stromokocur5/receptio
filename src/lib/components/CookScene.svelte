<script lang="ts">
	import type { StepActivity } from '$lib/cooking';

	/** A small looping scene of what the current step asks for – knife, pan, pot, oven… */
	let { activity }: { activity: StepActivity } = $props();

	const LABELS: Record<StepActivity, string> = {
		namacanie: 'namáčanie',
		krajanie: 'krájanie',
		strukanie: 'strúhanie',
		mixovanie: 'mixovanie',
		miesenie: 'miesenie cesta',
		restovanie: 'restovanie',
		pecenie: 'pečenie',
		varenie: 'varenie',
		miesanie: 'miešanie',
		chladenie: 'chladenie',
		podavanie: 'podávanie'
	};
</script>

<svg class="scene {activity}" viewBox="0 0 160 96" role="img" aria-label={LABELS[activity]}>
	{#if activity === 'krajanie'}
		<rect class="board" x="18" y="62" width="124" height="16" rx="5" />
		<circle class="hole" cx="130" cy="70" r="3" />
		<g class="pieces">
			<rect x="42" y="54" width="8" height="8" rx="2" />
			<rect x="54" y="55" width="7" height="7" rx="2" />
			<rect x="65" y="54" width="8" height="8" rx="2" />
		</g>
		<path class="veg" d="M78 62c0-10 8-16 24-16s22 6 22 16Z" />
		<g class="knife">
			<path class="blade" d="M72 18l6 44h8l-2-44Z" />
			<rect class="handle" x="70" y="4" width="14" height="16" rx="4" />
		</g>
	{:else if activity === 'strukanie'}
		<path class="grater" d="M60 12h40l8 64H52Z" />
		<path class="grater-holes" d="M66 28h28M64 40h32M62 52h36M60 64h40" />
		<rect class="handle" x="72" y="4" width="16" height="8" rx="3" />
		<g class="veg-slide"><path class="veg" d="M104 26c14-2 24 6 22 16s-16 12-24 6Z" /></g>
		<g class="shreds">
			<path d="M58 80l-3 8M66 82l-1 8M74 80l2 8M84 82l-2 8M94 80l3 8M102 82l2 8" />
		</g>
		<path class="board" d="M34 90h92" />
	{:else if activity === 'mixovanie'}
		<rect class="base" x="58" y="72" width="44" height="18" rx="5" />
		<path class="jar" d="M56 14h48l-6 58H62Z" />
		<g class="swirl"><path d="M80 58c-14 0-14-20 0-20s14 16 2 16-10-10-2-10" /></g>
		<path class="lid" d="M54 10h52" />
		<circle class="button" cx="80" cy="81" r="4" />
	{:else if activity === 'miesenie'}
		<path class="board" d="M18 80h124" />
		<g class="dough"><path d="M44 80c0-20 20-28 36-28s36 8 36 28Z" /></g>
		<g class="pin">
			<rect x="30" y="40" width="100" height="12" rx="6" />
			<path d="M22 46h8M130 46h8" />
		</g>
		<g class="flour">
			<circle cx="36" cy="72" r="1.5" /><circle cx="126" cy="70" r="1.5" /><circle
				cx="120"
				cy="76"
				r="1"
			/>
		</g>
	{:else if activity === 'restovanie'}
		<g class="flame"
			><path
				d="M66 92c-4-6 2-8 0-14 6 4 6 10 0 14ZM82 92c-5-8 3-10 0-18 8 6 8 13 0 18ZM98 92c-4-6 2-8 0-14 6 4 6 10 0 14Z"
			/></g
		>
		<path class="pan" d="M36 62h88l-8 14H44Z" />
		<path class="handle-long" d="M124 64l30-8" />
		<g class="toss">
			<rect x="58" y="52" width="9" height="9" rx="3" />
			<rect x="74" y="48" width="10" height="9" rx="3" class="alt" />
			<rect x="92" y="53" width="8" height="8" rx="3" />
		</g>
		<g class="sizzle"><path d="M52 44l-4-8M80 38v-10M108 44l4-8" /></g>
	{:else if activity === 'pecenie'}
		<rect class="oven" x="26" y="8" width="108" height="82" rx="8" />
		<circle class="knob" cx="42" cy="18" r="4" /><circle class="knob" cx="56" cy="18" r="4" />
		<rect class="window" x="38" y="30" width="84" height="48" rx="6" />
		<path class="tray" d="M46 64h68" />
		<path class="bake" d="M56 64c0-10 8-14 24-14s24 4 24 14Z" />
		<g class="heat"><path d="M60 44c3-4-3-6 0-10M80 42c3-4-3-6 0-10M100 44c3-4-3-6 0-10" /></g>
	{:else if activity === 'varenie' || activity === 'namacanie'}
		{#if activity === 'varenie'}
			<g class="flame"
				><path
					d="M66 94c-4-6 2-8 0-14 6 4 6 10 0 14ZM82 94c-5-8 3-10 0-18 8 6 8 13 0 18ZM98 94c-4-6 2-8 0-14 6 4 6 10 0 14Z"
				/></g
			>
		{/if}
		<path
			class={activity === 'varenie' ? 'pot' : 'bowl'}
			d={activity === 'varenie'
				? 'M40 34h80v36a10 10 0 0 1-10 10H50a10 10 0 0 1-10-10Z'
				: 'M34 40h92a46 40 0 0 1-92 0Z'}
		/>
		{#if activity === 'varenie'}
			<path class="pot-handles" d="M40 44h-8M120 44h8" />
		{/if}
		<path
			class="water"
			d={activity === 'varenie'
				? 'M42 42c8-3 14 3 20 0s14 3 20 0 14 3 20 0 10 2 16 0v26a8 8 0 0 1-8 8H50a8 8 0 0 1-8-8Z'
				: 'M38 46c10-3 18 3 26 0s16 3 26 0 18 3 26 0 6 1 8 0a42 36 0 0 1-86 0Z'}
		/>
		<g class="bubbles">
			{#each [0, 1, 2, 3, 4] as b (b)}
				<circle
					cx={54 + b * 13}
					cy={activity === 'varenie' ? 70 : 66}
					r={2 + (b % 2)}
					style:--d="{b * 0.35}s"
				/>
			{/each}
		</g>
		{#if activity === 'namacanie'}
			<g class="beans">
				<ellipse cx="64" cy="64" rx="5" ry="3.5" /><ellipse
					cx="80"
					cy="68"
					rx="5"
					ry="3.5"
				/><ellipse cx="96" cy="63" rx="5" ry="3.5" />
			</g>
		{:else}
			<g class="steam"
				><path d="M62 28c-5-7 5-10 0-18M80 24c-5-7 5-10 0-18M98 28c-5-7 5-10 0-18" /></g
			>
		{/if}
	{:else if activity === 'chladenie'}
		<rect class="fridge" x="50" y="4" width="60" height="88" rx="8" />
		<path class="fridge-line" d="M50 34h60M60 16v10M60 44v14" />
		<g class="flakes">
			<path d="M128 20v12M122 23l12 6M122 29l12-6" />
			<path d="M28 44v12M22 47l12 6M22 53l12-6" />
			<path d="M132 62v10M127 64l10 6M127 70l10-6" />
		</g>
	{:else if activity === 'podavanie'}
		<ellipse class="plate-rim" cx="80" cy="66" rx="58" ry="20" />
		<ellipse class="plate-well" cx="80" cy="64" rx="40" ry="12" />
		<path class="food" d="M58 62c0-10 10-14 22-14s22 4 22 14Z" />
		<g class="garnish">
			<circle cx="70" cy="30" r="2" /><circle cx="84" cy="24" r="2" /><circle
				cx="94"
				cy="32"
				r="2"
			/>
		</g>
		<g class="sparkle"><path d="M126 22v10M121 27h10M34 26v8M30 30h8" /></g>
	{:else}
		<path class="bowl" d="M30 44h100a50 40 0 0 1-100 0Z" />
		<path class="water mix" d="M36 50c14-4 26 4 44 0s30 4 44 0a44 32 0 0 1-88 0Z" />
		<g class="spoon"><path d="M80 60 106 10" /><ellipse cx="78" cy="64" rx="6" ry="4" /></g>
	{/if}
</svg>

<style>
	.scene {
		display: block;
		width: 132px;
		height: auto;
		margin: 0 0 6px;
		overflow: visible;
		fill: none;
		stroke: var(--ink-2);
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.board,
	.pin rect,
	.grater,
	.handle {
		fill: color-mix(in srgb, #a8743f 35%, var(--card));
		stroke: #a8743f;
	}
	.hole {
		fill: var(--card);
	}
	.veg,
	.pieces rect,
	.toss rect,
	.bake,
	.food {
		fill: color-mix(in srgb, var(--tomato) 55%, transparent);
		stroke: var(--tomato);
	}
	.toss .alt,
	.garnish circle {
		fill: color-mix(in srgb, var(--leaf-2) 60%, transparent);
		stroke: var(--leaf);
	}
	.blade {
		fill: color-mix(in srgb, var(--plate) 70%, #fff);
		stroke: var(--ink-2);
	}
	.knife {
		transform-origin: 78px 62px;
		animation: chop 0.7s ease-in-out infinite;
	}
	.pieces {
		animation: slide 1.4s ease-in-out infinite;
	}
	.grater-holes {
		stroke-dasharray: 3 4;
		stroke-width: 1.4;
	}
	.veg-slide {
		animation: grate 0.9s ease-in-out infinite alternate;
	}
	.shreds {
		stroke: var(--turmeric);
		animation: fall 0.9s linear infinite;
	}
	.jar {
		fill: color-mix(in srgb, var(--sky) 12%, transparent);
		stroke: var(--sky);
	}
	.base {
		fill: var(--ink-2);
		stroke: none;
	}
	.button {
		fill: var(--tomato);
		stroke: none;
	}
	.swirl {
		stroke: var(--leaf);
		stroke-width: 3;
		transform-origin: 80px 46px;
		animation: spin 0.6s linear infinite;
	}
	.lid {
		stroke-width: 3;
	}
	.dough path {
		fill: color-mix(in srgb, var(--turmeric) 35%, var(--card));
		stroke: var(--turmeric);
	}
	.dough {
		transform-origin: 80px 80px;
		animation: squash 1.2s ease-in-out infinite;
	}
	.pin {
		animation: roll 1.2s ease-in-out infinite;
	}
	.flour circle {
		fill: var(--ink-2);
		stroke: none;
		opacity: 0.5;
	}
	.pan,
	.pot,
	.bowl {
		fill: color-mix(in srgb, var(--plate) 60%, var(--card));
		stroke: var(--plate-rim);
		stroke-width: 2.5;
	}
	.handle-long,
	.pot-handles {
		stroke: var(--ink-2);
		stroke-width: 5;
	}
	.toss {
		animation: toss 1.2s ease-in-out infinite;
	}
	.sizzle {
		stroke: var(--turmeric);
		animation: flicker 0.5s ease-in-out infinite alternate;
	}
	.flame path {
		fill: color-mix(in srgb, var(--tomato) 70%, var(--turmeric));
		stroke: none;
		transform-box: fill-box;
		transform-origin: bottom;
		animation: flame 0.4s ease-in-out infinite alternate;
	}
	.flame path:nth-child(2) {
		animation-delay: 0.15s;
	}
	.oven {
		fill: color-mix(in srgb, var(--plate) 50%, var(--card));
		stroke: var(--plate-rim);
		stroke-width: 2.5;
	}
	.knob {
		fill: var(--ink-2);
		stroke: none;
	}
	.window {
		fill: color-mix(in srgb, var(--turmeric) 30%, transparent);
		stroke: var(--plate-rim);
		animation: glow 2s ease-in-out infinite alternate;
	}
	.tray {
		stroke: var(--ink-2);
	}
	.heat,
	.steam {
		stroke: var(--muted);
		animation: rise 1.8s ease-out infinite;
	}
	.heat {
		stroke: var(--tomato);
	}
	.water {
		fill: color-mix(in srgb, var(--sky) 40%, transparent);
		stroke: none;
	}
	.bubbles circle {
		fill: #fff;
		fill-opacity: 0.7;
		stroke: none;
		animation: bubble 1.3s ease-in infinite;
		animation-delay: var(--d);
	}
	.namacanie .bubbles circle {
		animation-duration: 3s;
	}
	.beans ellipse {
		fill: color-mix(in srgb, var(--turmeric) 55%, var(--card));
		stroke: #a8743f;
		stroke-width: 1.2;
		animation: bob 2.4s ease-in-out infinite alternate;
	}
	.fridge {
		fill: color-mix(in srgb, var(--sky) 10%, var(--card));
		stroke: var(--sky);
		stroke-width: 2.5;
	}
	.fridge-line {
		stroke: var(--sky);
	}
	.flakes {
		stroke: var(--sky);
		stroke-width: 1.6;
		animation: drift 3s ease-in-out infinite alternate;
	}
	.plate-rim {
		fill: var(--plate);
		stroke: var(--plate-rim);
	}
	.plate-well {
		fill: color-mix(in srgb, var(--plate) 70%, #fff);
		stroke: none;
	}
	.garnish {
		animation: sprinkle 1.6s ease-in infinite;
	}
	.sparkle {
		stroke: var(--turmeric);
		animation: twinkle 1.2s ease-in-out infinite alternate;
	}
	.spoon {
		stroke: var(--ink-2);
		stroke-width: 3;
		transform-origin: 80px 56px;
		animation: stir 1.6s linear infinite;
	}
	.spoon ellipse {
		fill: var(--ink-2);
	}
	.mix {
		transform-origin: 80px 56px;
		animation: slosh 1.6s ease-in-out infinite alternate;
	}

	@keyframes chop {
		0%,
		100% {
			transform: translateY(-14px) rotate(-6deg);
		}
		45% {
			transform: translateY(0) rotate(0deg);
		}
	}
	@keyframes slide {
		0%,
		60% {
			transform: translateX(0);
		}
		100% {
			transform: translateX(-10px);
			opacity: 0.4;
		}
	}
	@keyframes grate {
		from {
			transform: translate(0, 0);
		}
		to {
			transform: translate(-4px, 30px);
		}
	}
	@keyframes fall {
		from {
			transform: translateY(-6px);
			opacity: 0;
		}
		40% {
			opacity: 1;
		}
		to {
			transform: translateY(4px);
			opacity: 0;
		}
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	@keyframes squash {
		0%,
		100% {
			transform: scale(1, 1);
		}
		50% {
			transform: scale(1.12, 0.84);
		}
	}
	@keyframes roll {
		0%,
		100% {
			transform: translate(-8px, 6px);
		}
		50% {
			transform: translate(8px, 10px);
		}
	}
	@keyframes toss {
		0%,
		60%,
		100% {
			transform: translateY(0);
		}
		30% {
			transform: translateY(-20px) rotate(8deg);
		}
	}
	@keyframes flicker {
		from {
			opacity: 0.3;
		}
		to {
			opacity: 1;
		}
	}
	@keyframes flame {
		from {
			transform: scaleY(0.8);
		}
		to {
			transform: scaleY(1.15);
		}
	}
	@keyframes glow {
		from {
			fill-opacity: 0.5;
		}
		to {
			fill-opacity: 1;
		}
	}
	@keyframes rise {
		from {
			transform: translateY(6px);
			opacity: 0;
		}
		40% {
			opacity: 1;
		}
		to {
			transform: translateY(-8px);
			opacity: 0;
		}
	}
	@keyframes bubble {
		from {
			transform: translateY(0);
			opacity: 0;
		}
		30% {
			opacity: 1;
		}
		to {
			transform: translateY(-24px);
			opacity: 0;
		}
	}
	@keyframes bob {
		to {
			transform: translateY(-3px);
		}
	}
	@keyframes drift {
		to {
			transform: translateY(6px) rotate(10deg);
		}
	}
	@keyframes sprinkle {
		from {
			transform: translateY(-6px);
			opacity: 0;
		}
		30% {
			opacity: 1;
		}
		to {
			transform: translateY(24px);
			opacity: 0;
		}
	}
	@keyframes twinkle {
		from {
			opacity: 0.2;
			transform: scale(0.9);
		}
		to {
			opacity: 1;
		}
	}
	@keyframes stir {
		from {
			transform: rotate(-18deg);
		}
		50% {
			transform: rotate(18deg);
		}
		to {
			transform: rotate(-18deg);
		}
	}
	@keyframes slosh {
		from {
			transform: skewX(-4deg);
		}
		to {
			transform: skewX(4deg);
		}
	}
</style>
