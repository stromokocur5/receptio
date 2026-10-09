<script lang="ts" module>
	import type { IconName } from './Icon.svelte';

	export interface JumpLink {
		/** An id on this page, without the "#". */
		id: string;
		label: string;
		icon?: IconName;
		/** A small number after the label (articles in a section, deals running). */
		count?: number;
		/** The section's colour for its icon. */
		tone?: string;
	}
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from './Icon.svelte';

	/**
	 * Chips that jump to the sections of a long page. They stick under the header while the
	 * page scrolls, light up the section in view, and offer a way back to the top once the
	 * reader is down the page. Only for places on this page: other pages are ordinary links.
	 */
	let { links, label = 'Na tejto stránke' }: { links: JumpLink[]; label?: string } = $props();

	let nav: HTMLElement;
	let sentinel: HTMLElement;
	/** The bar has reached the header and sticks: now "back to top" makes sense. */
	let stuck = $state(false);
	let current = $state('');

	onMount(() => {
		const header = headerHeight();
		// Out of view above the header (not below the fold): the bar has stuck.
		const stick = new IntersectionObserver(
			([entry]) => (stuck = !entry.isIntersecting && entry.boundingClientRect.top <= header),
			{ rootMargin: `-${header + 1}px 0px 0px 0px` }
		);
		stick.observe(sentinel);

		// The last section whose top passed the bar is the one being read.
		const visible = new Set<string>();
		const spy = new IntersectionObserver(
			(entries) => {
				for (const e of entries) {
					if (e.isIntersecting) visible.add(e.target.id);
					else visible.delete(e.target.id);
				}
				current = links.find((l) => visible.has(l.id))?.id ?? current;
			},
			{ rootMargin: '-30% 0px -60% 0px' }
		);
		for (const l of links) {
			const el = document.getElementById(l.id);
			if (el) spy.observe(el);
		}
		return () => {
			stick.disconnect();
			spy.disconnect();
		};
	});

	function headerHeight(): number {
		return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h'));
	}

	const smooth = () =>
		matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : ('smooth' as const);

	/** Keep the lit chip visible when the row is wider than the screen. */
	$effect(() => {
		const chip = current && nav?.querySelector<HTMLElement>(`a[href="#${current}"]`);
		if (!chip || !stuck) return;
		const left = chip.offsetLeft - nav.clientWidth / 2 + chip.offsetWidth / 2;
		nav.scrollTo({ left, behavior: smooth() });
	});

	function toTop() {
		window.scrollTo({ top: 0, behavior: smooth() });
		// Focus follows, so the next Tab starts at the top too.
		document.getElementById('main')?.focus({ preventScroll: true });
	}
</script>

<div class="sentinel" bind:this={sentinel} aria-hidden="true"></div>
<div class="jump-nav" class:stuck data-noprint>
	{#if stuck}
		<button class="chip up" onclick={toTop} aria-label="Späť hore" title="Späť hore">
			<Icon name="arrow-up" size={16} />
		</button>
	{/if}
	<nav class="links" aria-label={label} bind:this={nav}>
		{#each links as link (link.id)}
			<a
				class="chip"
				href="#{link.id}"
				aria-current={current === link.id ? 'location' : undefined}
				style:--tone={link.tone}
				onclick={() => (current = link.id)}
			>
				{#if link.icon}<Icon name={link.icon} size={15} />{/if}
				{link.label}
				{#if link.count !== undefined}<span class="n">{link.count}</span>{/if}
			</a>
		{/each}
	</nav>
</div>

<style>
	/* Anchored sections land below the header and this bar instead of under them. */
	:global(html:has(.jump-nav)) {
		scroll-padding-top: calc(var(--header-h) + 64px);
	}
	.sentinel {
		height: 0;
	}
	/* The bar reaches the screen edges like a .scroller; "up" sits outside the scrolling row. */
	.jump-nav {
		position: sticky;
		top: var(--header-h);
		z-index: 6;
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		margin: var(--sp-3) calc(-1 * var(--gutter));
		padding: var(--sp-2) 0 var(--sp-2) var(--gutter);
		transition:
			background 0.2s,
			box-shadow 0.2s;
	}
	.jump-nav.stuck {
		background: color-mix(in srgb, var(--paper) 92%, transparent);
		backdrop-filter: blur(10px);
		box-shadow: 0 1px 0 color-mix(in srgb, var(--line) 70%, transparent);
	}
	.links {
		display: flex;
		flex: 1;
		min-width: 0;
		gap: var(--sp-2);
		padding: 4px var(--gutter) 4px 0;
		overflow-x: auto;
		scrollbar-width: none;
	}
	.links::-webkit-scrollbar {
		display: none;
	}
	.stuck .links {
		mask-image: linear-gradient(to right, transparent, #000 16px);
	}
	.stuck .links .chip:first-child {
		margin-left: 8px;
	}
	.chip {
		flex: none;
	}
	.chip[aria-current='location'] {
		background: var(--ink);
		border-color: var(--ink);
		color: var(--paper);
	}
	.chip > :global(svg) {
		color: var(--tone, currentColor);
	}
	.chip[aria-current='location'] > :global(svg) {
		color: currentColor;
	}
	.up {
		padding-inline: 0.7em;
	}
	.n {
		font-size: var(--fs-xs);
		font-weight: 700;
		color: var(--muted);
	}
	.chip[aria-current='location'] .n {
		color: inherit;
	}
</style>
