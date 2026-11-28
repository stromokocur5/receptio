<script lang="ts">
	import type { GrowPlace } from '$lib/types';

	let { place, active = false }: { place: GrowPlace; active?: boolean } = $props();
</script>

<svg class="place-art" class:active viewBox="0 0 96 64" aria-hidden="true">
	{#if place === 'parapet'}
		<rect x="18" y="4" width="60" height="44" rx="3" class="frame" />
		<path d="M48 4v44M18 26h60" class="frame" />
		<circle cx="68" cy="14" r="5" class="sun" />
		<path d="M10 50h76" class="line" />
		<g class="plant">
			<path d="M40 49v-9M40 42c-4-1-6-4-6-7 4 0 6 3 6 7Zm0-2c3-1 5-4 5-7-3 0-5 3-5 7Z" />
			<path d="M58 49v-7M58 44c-3 0-5-3-5-6 3 0 5 3 5 6Zm0 0c3 0 5-3 5-6-3 0-5 3-5 6Z" />
		</g>
		<path d="M34 49h12l-1.5 8h-9ZM52 49h12l-1.5 8h-9Z" class="pot" />
	{:else if place === 'balkon'}
		<circle cx="78" cy="12" r="6" class="sun" />
		<path d="M8 36h80M8 60h80M16 36v24M30 36v24M44 36v24M58 36v24M72 36v24M86 36v24" class="line" />
		<g class="plant">
			<path d="M22 34V18M22 26c-5-1-7-5-7-9 5 0 7 4 7 9Zm0-3c4-1 6-5 6-8-4 0-6 3-6 8Z" />
			<path d="M50 34V22M50 28c-4 0-6-3-6-6 4 0 6 3 6 6Zm0 0c4 0 6-3 6-6-4 0-6 3-6 6Z" />
			<circle cx="46" cy="25" r="2" class="fruit" />
			<circle cx="55" cy="23" r="2" class="fruit" />
		</g>
		<path d="M14 34h60l-2 6H16Z" class="pot" />
	{:else}
		<circle cx="80" cy="12" r="6" class="sun" />
		<path d="M4 44c14-4 30-4 44 0s30 4 44 0" class="line" />
		<path d="M10 52h76M14 58h68" class="soil" />
		<g class="plant">
			<path d="M20 44V30M20 36c-4-1-6-4-6-8 4 0 6 4 6 8Zm0-2c4-1 6-4 6-8-4 0-6 4-6 8Z" />
			<path d="M40 44V26M40 34c-5-1-7-5-7-9 5 0 7 4 7 9Zm0-3c4-1 6-5 6-9-4 0-6 4-6 9Z" />
			<circle cx="36" cy="38" r="2.4" class="fruit" />
			<path d="M60 44V32M60 38c-4 0-6-3-6-6 4 0 6 3 6 6Zm0 0c4 0 6-3 6-6-4 0-6 3-6 6Z" />
			<path d="M76 44v-8M76 40c-3 0-5-2-5-5 3 0 5 2 5 5Zm0 0c3 0 5-2 5-5-3 0-5 2-5 5Z" />
		</g>
	{/if}
</svg>

<style>
	.place-art {
		display: block;
		width: 100%;
		max-width: 120px;
		height: auto;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.8;
		stroke-linecap: round;
		stroke-linejoin: round;
		color: var(--muted);
	}
	.frame,
	.line,
	.soil {
		opacity: 0.7;
	}
	.soil {
		stroke: #8a5a3c;
		stroke-dasharray: 3 5;
	}
	.pot {
		stroke: var(--tomato);
		fill: color-mix(in srgb, var(--tomato) 18%, transparent);
	}
	.sun {
		stroke: var(--turmeric);
		fill: color-mix(in srgb, var(--turmeric) 30%, transparent);
		transform-box: fill-box;
		transform-origin: center;
	}
	.plant {
		stroke: var(--leaf);
		fill: color-mix(in srgb, var(--leaf-2) 25%, transparent);
		transform-box: fill-box;
		transform-origin: bottom center;
		transform: scaleY(0.82);
		transition: transform 0.45s var(--ease-spring);
	}
	.fruit {
		stroke: var(--tomato);
		fill: var(--tomato);
	}
	.active {
		color: var(--leaf);
	}
	.active .plant {
		transform: none;
		animation: sway 3.2s ease-in-out 0.45s infinite;
	}
	.active .sun {
		animation: shine 3.2s ease-in-out infinite;
	}
	@keyframes sway {
		50% {
			transform: rotate(-2deg);
		}
	}
	@keyframes shine {
		50% {
			transform: scale(1.18);
		}
	}
</style>
