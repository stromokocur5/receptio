<script lang="ts">
	let { size = 34 }: { size?: number } = $props();
</script>

<span class="logo">
	<svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
		<g class="leaf">
			<path d="M24 22C22 13 26 6 36 4c1 9-4 16-12 18Z" fill="var(--leaf-2)" />
			<path
				d="M24 22c2-5 5-9 10-15"
				stroke="var(--paper)"
				stroke-width="1.4"
				fill="none"
				stroke-linecap="round"
			/>
		</g>
		<g class="leaf small">
			<path d="M23 23c-2-6-7-9-13-8 0 6 5 9 13 8Z" fill="var(--leaf)" />
		</g>
		<path d="M5 24h38a19 19 0 0 1-38 0Z" fill="var(--tomato)" />
		<path
			d="M9 28h30"
			stroke="var(--paper)"
			stroke-opacity=".5"
			stroke-width="2"
			stroke-linecap="round"
		/>
	</svg>
	<span class="word">Receptio</span>
</span>

<style>
	.logo {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
	}
	.word {
		font-family: var(--font-display);
		font-variation-settings:
			'SOFT' 100,
			'WONK' 1;
		font-weight: 720;
		font-size: 1.45rem;
		letter-spacing: -0.03em;
		color: var(--ink);
	}
	.leaf {
		transform-origin: 24px 22px;
		transition: transform 0.6s var(--ease-spring);
	}
	:global(a:hover) > .logo .leaf {
		transform: rotate(-12deg);
	}
	:global(a:hover) > .logo .leaf.small {
		transform: rotate(14deg);
	}
</style>
