<script lang="ts">
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';
</script>

<svelte:head><title>{page.status} · Receptio</title></svelte:head>

<div class="wrap err">
	<svg viewBox="0 0 160 120" width="180" aria-hidden="true">
		<path
			d="M14 60h132a66 50 0 0 1-132 0Z"
			fill="var(--paper-2)"
			stroke="var(--line)"
			stroke-width="2"
		/>
		<circle cx="62" cy="80" r="5" fill="var(--ink-2)" />
		<circle cx="98" cy="80" r="5" fill="var(--ink-2)" />
		<path
			d="M66 98c8-6 20-6 28 0"
			stroke="var(--ink-2)"
			stroke-width="3"
			fill="none"
			stroke-linecap="round"
		/>
		<path
			d="M60 44c-5-8 5-12 0-22M80 40c-5-8 5-12 0-22M100 44c-5-8 5-12 0-22"
			stroke="var(--muted)"
			stroke-width="3"
			fill="none"
			stroke-linecap="round"
		/>
	</svg>
	<h1>{page.status === 404 ? 'Tento tanier je prázdny' : 'Niečo sa pripálilo'}</h1>
	<p class="muted">{page.error?.message}</p>
	<a class="btn" href="/"><Icon name="home" size={18} /> Domov</a>
</div>

<style>
	.err {
		display: grid;
		justify-items: center;
		text-align: center;
		padding-top: 60px;
		gap: 8px;
	}
</style>
