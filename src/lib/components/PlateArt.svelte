<script lang="ts">
	import { plateLayers } from '$lib/art';
	import type { Ingredient, RecipeLine } from '$lib/types';

	let {
		seed,
		lines,
		byId,
		steam = false,
		animate = true,
		detail = false,
		label
	}: {
		seed: string;
		lines: RecipeLine[];
		byId: Map<string, Ingredient>;
		steam?: boolean;
		animate?: boolean;
		detail?: boolean;
		label?: string;
	} = $props();

	const layers = $derived(plateLayers(seed, lines, byId, detail));
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

	<ellipse class="shadow" cx="104" cy="108" rx="90" ry="88" />
	<circle cx="100" cy="100" r="92" fill="url(#{uid}-rim)" />
	<circle class="well" cx="100" cy="100" r="76" />

	<g class="food" clip-path="url(#{uid}-well)">
		{#each layers as layer, i (i)}
			<path class={layer.kind} d={layer.d} fill={layer.color} style:--delay="{layer.delay}s" />
		{/each}
		<circle cx="100" cy="100" r="76" fill="url(#{uid}-gloss)" />
	</g>

	{#if steam}
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
		.steam path {
			animation: none;
		}
	}
</style>
