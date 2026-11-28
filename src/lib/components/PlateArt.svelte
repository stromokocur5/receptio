<script lang="ts">
	import { drinkLook, plateLayers } from '$lib/art';
	import type { Vessel } from '$lib/categories';
	import type { Ingredient, RecipeLine } from '$lib/types';

	let {
		seed,
		lines,
		byId,
		steam = false,
		animate = true,
		detail = false,
		vessel = 'plate',
		label
	}: {
		seed: string;
		lines: RecipeLine[];
		byId: Map<string, Ingredient>;
		steam?: boolean;
		animate?: boolean;
		detail?: boolean;
		/** Drinks are drawn in a glass or a mug instead of on a plate. */
		vessel?: Vessel;
		label?: string;
	} = $props();

	const layers = $derived(vessel === 'plate' ? plateLayers(seed, lines, byId, detail) : []);
	const drink = $derived.by(() => {
		if (vessel === 'plate') return null;
		const look = drinkLook(lines, byId);
		// Homemade milks are mostly water and come out creamy; smoothies keep their fruit colour.
		if (vessel === 'milk') {
			return { ...look, color: look.opacity < 0.7 ? '#f1ead8' : look.color, opacity: 1 };
		}
		return look;
	});
	/** Lemonades and teas get ice and bubbles; thick drinks don't. */
	const cold = $derived(vessel === 'glass');
	const uid = $derived(`p-${seed}`);
</script>

<svg
	class="plate"
	class:animate
	viewBox="0 0 200 200"
	role={label ? 'img' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
>
	<defs>
		<radialGradient id="{uid}-rim" cx="50%" cy="45%" r="55%">
			<stop offset="80%" stop-color="var(--plate)" />
			<stop offset="100%" stop-color="var(--plate-rim)" />
		</radialGradient>
		<radialGradient id="{uid}-gloss" cx="35%" cy="30%" r="70%">
			<stop offset="0%" stop-color="#fff" stop-opacity="0.35" />
			<stop offset="60%" stop-color="#fff" stop-opacity="0" />
		</radialGradient>
		<clipPath id="{uid}-well">
			<circle cx="100" cy="100" r="76" />
		</clipPath>
	</defs>

	{#if drink && (vessel === 'glass' || vessel === 'milk')}
		<ellipse class="shadow" cx="102" cy="182" rx="52" ry="9" />
		<g class="drink">
			<clipPath id="{uid}-glass">
				<path d="M60 36h80l-9 140a6 6 0 0 1-6 5H75a6 6 0 0 1-6-5Z" />
			</clipPath>
			<g clip-path="url(#{uid}-glass)">
				<path
					class="liquid"
					d="M40 70c20-6 40 6 60 0s40-6 60 0V190H40Z"
					fill={drink.color}
					fill-opacity={drink.opacity}
				/>
				{#if cold}
					<rect
						class="ice"
						x="78"
						y="74"
						width="20"
						height="18"
						rx="4"
						transform="rotate(-12 88 83)"
					/>
					<rect
						class="ice"
						x="102"
						y="80"
						width="18"
						height="17"
						rx="4"
						transform="rotate(10 111 88)"
					/>
					{#each [0, 1, 2, 3, 4] as b (b)}
						<circle
							class="bubble"
							cx={80 + b * 10}
							cy={168 - (b % 3) * 8}
							r={1.6 + (b % 2)}
							style:--delay="{b * 0.5}s"
						/>
					{/each}
				{/if}
				{#if drink.mint}
					<path
						class="mint"
						d="M92 74c-10-2-14-10-12-16 8 0 14 8 12 16Zm4 0c8-6 16-6 20-2-6 6-14 6-20 2Z"
					/>
				{/if}
			</g>
			<path class="glass" d="M60 36h80l-9 140a6 6 0 0 1-6 5H75a6 6 0 0 1-6-5Z" />
			<path class="glint" d="M70 50l6 110" />
			{#if drink.citrus}
				<g class="citrus">
					<circle cx="136" cy="40" r="16" fill={drink.citrus} />
					<circle cx="136" cy="40" r="12" class="pulp" />
					<path d="M136 28v24M124 40h24M127.5 31.5l17 17M144.5 31.5l-17 17" class="segments" />
				</g>
			{/if}
			<path class="straw" d="M108 186 124 14l12 -6" />
		</g>
	{:else if drink && vessel === 'mug'}
		<ellipse class="shadow" cx="100" cy="176" rx="64" ry="10" />
		<g class="drink">
			<path class="mug-handle" d="M146 86c26 0 26 50 0 50" />
			<path class="mug" d="M46 70h104v86a18 18 0 0 1-18 18H64a18 18 0 0 1-18-18Z" />
			<ellipse cx="98" cy="70" rx="52" ry="12" class="mug-rim" />
			<ellipse
				cx="98"
				cy="72"
				rx="46"
				ry="9"
				fill={drink.color}
				fill-opacity={Math.max(0.7, drink.opacity)}
			/>
			<path class="foam" d="M70 72c8-4 14 2 20-1s12 3 20 0 12 2 16 1" />
		</g>
		<g class="steam" fill="none" stroke="var(--muted)" stroke-width="2.4" stroke-linecap="round">
			<path d="M80 50c-6-8 6-12 0-22" />
			<path d="M98 46c-6-8 6-12 0-22" />
			<path d="M116 50c-6-8 6-12 0-22" />
		</g>
	{:else}
		<ellipse class="shadow" cx="104" cy="108" rx="90" ry="88" />
		<circle cx="100" cy="100" r="92" fill="url(#{uid}-rim)" />
		<circle class="well" cx="100" cy="100" r="76" />

		<g class="food" clip-path="url(#{uid}-well)">
			{#each layers as layer, i (i)}
				<path class={layer.kind} d={layer.d} fill={layer.color} style:--delay="{layer.delay}s" />
			{/each}
			<circle cx="100" cy="100" r="76" fill="url(#{uid}-gloss)" />
		</g>
	{/if}

	{#if steam && vessel === 'plate'}
		<g class="steam" fill="none" stroke="var(--muted)" stroke-width="2.4" stroke-linecap="round">
			<path d="M84 44c-6-8 6-12 0-22" />
			<path d="M100 40c-6-8 6-12 0-22" />
			<path d="M116 44c-6-8 6-12 0-22" />
		</g>
	{/if}
</svg>

<style>
	.plate {
		width: 100%;
		height: auto;
		overflow: visible;
	}
	.shadow {
		fill: rgba(40, 28, 10, 0.12);
		filter: blur(6px);
	}
	.well {
		fill: var(--plate);
		stroke: var(--plate-rim);
		stroke-width: 1.2;
	}
	.food {
		transform-origin: 100px 100px;
		transition: transform 1.4s var(--ease-out);
	}
	:global(.plate-host:hover) .food {
		transform: rotate(24deg);
	}
	.base {
		opacity: 0.92;
	}
	.chunk {
		stroke: rgba(0, 0, 0, 0.08);
		stroke-width: 0.8;
	}
	.side {
		stroke: rgba(0, 0, 0, 0.05);
		stroke-width: 1;
	}

	.animate path {
		transform-box: fill-box;
		transform-origin: center;
		animation: pop 0.55s var(--ease-spring) both;
		animation-delay: var(--delay);
	}
	@keyframes pop {
		from {
			opacity: 0;
			transform: scale(0.3);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}

	.drink .glass {
		fill: color-mix(in srgb, var(--sky) 8%, transparent);
		stroke: var(--plate-rim);
		stroke-width: 2.5;
	}
	.drink .glint {
		fill: none;
		stroke: #fff;
		stroke-opacity: 0.35;
		stroke-width: 4;
		stroke-linecap: round;
	}
	.liquid {
		animation: slosh 5s ease-in-out infinite alternate;
	}
	.ice {
		fill: #fff;
		fill-opacity: 0.45;
		stroke: #fff;
		stroke-opacity: 0.7;
		stroke-width: 1.2;
		animation: bob 3s ease-in-out infinite alternate;
	}
	.bubble {
		fill: #fff;
		fill-opacity: 0.6;
		animation: bubble 3s ease-in infinite;
		animation-delay: var(--delay);
	}
	.mint {
		fill: #5fa04e;
		stroke: #3e7a36;
		stroke-width: 1;
	}
	.citrus .pulp {
		fill: #fff;
		fill-opacity: 0.35;
	}
	.citrus .segments {
		stroke: #fff;
		stroke-opacity: 0.7;
		stroke-width: 1.2;
	}
	.straw {
		fill: none;
		stroke: var(--tomato);
		stroke-width: 6;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.mug {
		fill: var(--plate);
		stroke: var(--plate-rim);
		stroke-width: 2.5;
	}
	.mug-handle {
		fill: none;
		stroke: var(--plate-rim);
		stroke-width: 9;
		stroke-linecap: round;
	}
	.mug-rim {
		fill: var(--plate-rim);
	}
	.foam {
		fill: none;
		stroke: #fff;
		stroke-opacity: 0.4;
		stroke-width: 2;
		stroke-linecap: round;
	}
	@keyframes slosh {
		from {
			transform: translateX(-10px);
		}
		to {
			transform: translateX(10px);
		}
	}
	@keyframes bob {
		to {
			transform: translateY(3px);
		}
	}
	@keyframes bubble {
		from {
			transform: translateY(0);
			opacity: 0;
		}
		20% {
			opacity: 1;
		}
		to {
			transform: translateY(-90px);
			opacity: 0;
		}
	}
	.steam {
		opacity: 0.55;
	}
	.steam path {
		stroke-dasharray: 30;
		animation: steam 3.2s ease-in-out infinite;
	}
	.steam path:nth-child(2) {
		animation-delay: 0.6s;
	}
	.steam path:nth-child(3) {
		animation-delay: 1.2s;
	}
	@keyframes steam {
		0% {
			stroke-dashoffset: 30;
			transform: translateY(6px);
			opacity: 0;
		}
		40% {
			opacity: 1;
		}
		100% {
			stroke-dashoffset: -30;
			transform: translateY(-6px);
			opacity: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.steam path,
		.liquid,
		.ice,
		.bubble {
			animation: none;
		}
	}
</style>
