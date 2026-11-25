<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { beforeNavigate, onNavigate } from '$app/navigation';
	import { page, updated } from '$app/state';
	import { indexCatalog, provideCatalog } from '$lib/catalog';
	import Icon, { type IconName } from '$lib/components/Icon.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import TimerDock from '$lib/components/TimerDock.svelte';
	import Toasts from '$lib/components/Toasts.svelte';
	import { loadPersisted, pantry, plan, settings } from '$lib/state.svelte';
	import { loadTimers } from '$lib/timers.svelte';

	let { data, children } = $props();

	const catalog = $derived(indexCatalog(data.catalog));
	provideCatalog(() => catalog);

	const LINKS: { href: string; label: string; icon: IconName }[] = [
		{ href: '/', label: 'Uvar', icon: 'pot' },
		{ href: '/tyzden', label: 'Týždeň', icon: 'calendar' },
		{ href: '/kuchyna', label: 'Kuchyňa', icon: 'jar' }
	];
	const pantryCount = $derived(Object.keys(pantry.current).length);
	const planCount = $derived(plan.current.length);
	const countOf = (href: string) =>
		href === '/kuchyna' ? pantryCount : href === '/tyzden' ? planCount : 0;
	const isActive = (href: string) =>
		href === '/'
			? page.url.pathname === '/' || page.url.pathname.startsWith('/jedlo')
			: page.url.pathname.startsWith(href);
	/** The cooking screen takes the whole viewport, like an app of its own. */
	const cooking = $derived(page.url.pathname.endsWith('/varim'));

	onMount(() => {
		loadPersisted();
		loadTimers();
		document.documentElement.dataset.ready = 'true';
	});

	$effect(() => {
		const theme = settings.current.theme;
		if (theme === 'auto') delete document.documentElement.dataset.theme;
		else document.documentElement.dataset.theme = theme;
	});

	function toggleTheme() {
		const dark =
			settings.current.theme === 'dark' ||
			(settings.current.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
		settings.current = { ...settings.current, theme: dark ? 'light' : 'dark' };
	}

	beforeNavigate(({ willUnload, to }) => {
		// A new version was deployed: load the next page fully instead of running old code.
		if (updated.current && !willUnload && to?.url) location.href = to.url.href;
	});

	onNavigate((navigation) => {
		if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) {
			return;
		}
		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});
</script>

<a class="skip" href="#main">Preskočiť na obsah</a>

{#if !cooking}
	<header class="top">
		<div class="wrap bar">
			<a href="/" class="brand" aria-label="Receptio – domov"><Logo /></a>
			<nav class="desktop" aria-label="Hlavná navigácia">
				{#each LINKS as link (link.href)}
					<a
						href={link.href}
						class="nav-link draw-host"
						class:active={isActive(link.href)}
						aria-current={isActive(link.href) ? 'page' : undefined}
					>
						<Icon name={link.icon} size={19} />
						{link.label}
						{#if countOf(link.href) > 0}<span class="count">{countOf(link.href)}</span>{/if}
					</a>
				{/each}
			</nav>
			<button class="icon-btn theme" onclick={toggleTheme} aria-label="Prepnúť svetlý/tmavý režim">
				<span class="sun"><Icon name="sun" size={19} /></span>
				<span class="moon"><Icon name="moon" size={19} /></span>
			</button>
		</div>
	</header>
{/if}

<main id="main" tabindex="-1" class:cooking>
	{@render children()}
</main>
<Toasts />

{#if !cooking}
	<footer class="foot">
		<div class="wrap">
			<Logo size={28} />
			<p>
				Vegánske varenie z toho, čo máš doma. Živiny, alergény a ceny sú orientačné – pri alergii
				kontroluj etiketu.
			</p>
		</div>
	</footer>

	<TimerDock floating />

	<div class="nav-fade" aria-hidden="true"></div>
	<nav class="mobile" aria-label="Navigácia">
		{#each LINKS as link (link.href)}
			<a
				href={link.href}
				class:active={isActive(link.href)}
				aria-current={isActive(link.href) ? 'page' : undefined}
			>
				<span class="ico">
					<Icon name={link.icon} size={22} />
					{#if countOf(link.href) > 0}<span class="count">{countOf(link.href)}</span>{/if}
				</span>
				<span class="lbl">{link.label}</span>
			</a>
		{/each}
	</nav>
{/if}

<style>
	.skip {
		position: absolute;
		left: -999px;
		top: 8px;
		z-index: 100;
		background: var(--ink);
		color: var(--paper);
		padding: 8px 14px;
		border-radius: var(--radius-xs);
	}
	.skip:focus {
		left: 8px;
	}
	.top {
		position: sticky;
		top: 0;
		z-index: 40;
		background: color-mix(in srgb, var(--paper) 94%, transparent);
		backdrop-filter: blur(14px);
		border-bottom: 1px solid color-mix(in srgb, var(--line) 70%, transparent);
		view-transition-name: header;
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 16px;
		height: var(--header-h);
	}
	.brand {
		text-decoration: none;
		margin-right: auto;
	}
	.desktop {
		display: none;
		gap: 4px;
	}
	.nav-link {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 7px;
		padding: 8px 14px;
		border-radius: 999px;
		color: var(--ink-2);
		text-decoration: none;
		font-weight: 600;
		font-size: var(--fs-md);
		transition:
			background 0.2s,
			color 0.2s;
	}
	.nav-link:hover {
		background: var(--paper-2);
		color: var(--ink);
	}
	.nav-link.active {
		background: var(--ink);
		color: var(--paper);
	}
	.count {
		display: inline-grid;
		place-items: center;
		min-width: 18px;
		height: 18px;
		padding: 0 5px;
		border-radius: 999px;
		background: var(--leaf);
		color: var(--paper);
		font-size: var(--fs-xs);
		font-weight: 800;
	}
	.theme .moon,
	:global([data-theme='dark']) .theme .sun {
		display: none;
	}
	:global([data-theme='dark']) .theme .moon {
		display: block;
	}
	@media (prefers-color-scheme: dark) {
		:global(:root:not([data-theme='light'])) .theme .sun {
			display: none;
		}
		:global(:root:not([data-theme='light'])) .theme .moon {
			display: block;
		}
	}
	main:focus {
		outline: none;
	}
	main {
		position: relative;
		z-index: 1;
		min-height: 70vh;
		padding-bottom: 40px;
	}
	main.cooking {
		padding-bottom: 0;
	}
	.foot {
		position: relative;
		z-index: 1;
		border-top: 1px solid var(--line);
		padding: 28px 0 120px;
		color: var(--muted);
		font-size: var(--fs-md);
	}
	.foot .wrap {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px 24px;
	}
	.foot p {
		margin: 0;
		max-width: 62ch;
	}
	.nav-fade {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 49;
		height: calc(96px + env(safe-area-inset-bottom));
		background: linear-gradient(to top, var(--paper) 45%, transparent);
		pointer-events: none;
	}
	.mobile {
		position: fixed;
		left: 50%;
		translate: -50% 0;
		bottom: calc(12px + env(safe-area-inset-bottom));
		z-index: 50;
		display: flex;
		gap: 4px;
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: 999px;
		box-shadow: var(--shadow-lift);
		padding: 6px;
		view-transition-name: mobile-nav;
	}
	.mobile a {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 16px;
		border-radius: 999px;
		color: var(--muted);
		text-decoration: none;
		font-size: var(--fs-md);
		font-weight: 700;
		transition:
			color 0.2s,
			background 0.2s;
	}
	.mobile .active {
		color: var(--paper);
		background: var(--ink);
	}
	.mobile .active .ico {
		animation: hop 0.5s var(--ease-spring);
	}
	.ico {
		position: relative;
		display: grid;
	}
	.ico .count {
		position: absolute;
		top: -8px;
		left: -12px;
		box-shadow: 0 0 0 2px var(--card);
	}
	@keyframes hop {
		40% {
			transform: translateY(-4px) rotate(-6deg);
		}
	}
	@media (min-width: 900px) {
		.desktop {
			display: flex;
		}
		.mobile,
		.nav-fade {
			display: none;
		}
		.foot {
			padding-bottom: 40px;
		}
	}
</style>
