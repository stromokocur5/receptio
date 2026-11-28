<script lang="ts">
	import { page } from '$app/state';
	import { indexDishCatalog, provideDishCatalog } from '$lib/dish-catalog';
	import Icon, { type IconName } from '$lib/components/Icon.svelte';
	import { pantry, plates } from '$lib/state.svelte';

	let { data, children } = $props();

	const catalog = $derived(indexDishCatalog(data.dishes));
	provideDishCatalog(() => catalog);

	const LINKS: { href: string; label: string; icon: IconName }[] = [
		{ href: '/tanier', label: 'Tanier', icon: 'bowl' },
		{ href: '/tanier/zloz', label: 'Zlož recept', icon: 'plus' },
		{ href: '/tanier/tyzden', label: 'Týždeň', icon: 'calendar' },
		{ href: '/tanier/kuchyna', label: 'Moja kuchyňa', icon: 'jar' }
	];
	const countOf = (href: string) =>
		href === '/tanier/tyzden'
			? plates.current.length
			: href === '/tanier/kuchyna'
				? Object.keys(pantry.current).length
				: 0;
	const isActive = (href: string) =>
		href === '/tanier'
			? page.url.pathname === '/tanier' ||
				(page.url.pathname.startsWith('/jedlo') && !page.url.pathname.endsWith('/varim'))
			: page.url.pathname.startsWith(href);
	const cooking = $derived(page.url.pathname.endsWith('/varim'));
</script>

{#if !cooking}
	<nav class="wrap plate-nav" aria-label="Skladanie tanierov" data-noprint>
		{#each LINKS as link (link.href)}
			<a
				href={link.href}
				class:active={isActive(link.href)}
				aria-current={isActive(link.href) ? 'page' : undefined}
			>
				<Icon name={link.icon} size={17} />
				{link.label}
				{#if countOf(link.href) > 0}<span class="count">{countOf(link.href)}</span>{/if}
			</a>
		{/each}
	</nav>
{/if}

{@render children()}

<style>
	.plate-nav {
		display: flex;
		gap: 6px;
		overflow-x: auto;
		padding-top: 14px;
		padding-bottom: 4px;
		scrollbar-width: none;
	}
	.plate-nav a {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		flex: none;
		padding: 7px 13px;
		border-radius: 999px;
		border: 1px solid var(--line);
		color: var(--ink-2);
		font-size: 0.92rem;
		text-decoration: none;
		background: var(--card);
	}
	.plate-nav a.active {
		background: var(--leaf);
		border-color: var(--leaf);
		color: var(--paper);
	}
	.count {
		font-size: 0.78rem;
		font-weight: 600;
		opacity: 0.8;
	}
</style>
