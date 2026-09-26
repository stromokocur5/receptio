<script lang="ts">
	let { color = 'var(--turmeric)', width = 120 }: { color?: string; width?: number } = $props();
</script>

<svg
	class="squiggle"
	{width}
	height="12"
	viewBox="0 0 120 12"
	preserveAspectRatio="none"
	aria-hidden="true"
>
	<path
		d="M2 7c10-6 18 4 28 0s18-6 28 0 18 4 28 0 18-6 32 0"
		fill="none"
		stroke={color}
		stroke-width="3.5"
		stroke-linecap="round"
		pathLength="1"
	/>
</svg>

<style>
	.squiggle {
		overflow: visible;
	}
	path {
		stroke-dasharray: 1;
		animation: draw 1.1s 0.2s var(--ease-out) both;
	}
	@keyframes draw {
		from {
			stroke-dashoffset: 1;
		}
		to {
			stroke-dashoffset: 0;
		}
	}
</style>
