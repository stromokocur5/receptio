<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { onNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { indexCatalog, provideCatalog } from '$lib/catalog';
	import Icon, { type IconName } from '$lib/components/Icon.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import TimerDock from '$lib/components/TimerDock.svelte';
	import { loadLikes, loadPersisted, plan, settings } from '$lib/state.svelte';
	import { loadTimers } from '$lib/timers.svelte';

	let { data, children } = $props();

	const catalog = $derived(indexCatalog(data.catalog));
	provideCatalog(() => catalog);

	const NAV: { href: string; label: string; icon: IconName }[] = [
		{ href: '/recepty', label: 'Recepty', icon: 'bowl' },
		{ href: '/kuchyne', label: 'Kuchyne', icon: 'globe' },
		{ href: '/spajza', label: 'Špajza', icon: 'jar' },
		{ href: '/plan', label: 'Plán', icon: 'calendar' },
		{ href: '/ceny', label: 'Ceny', icon: 'tag' },
		{ href: '/wiki', label: 'Wiki', icon: 'book' }
	];

	const planCount = $derived(plan.current.length);
	const isActive = (href: string) =>
		page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);

	onMount(() => {
		loadPersisted();
		loadTimers();
		void loadLikes();
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

<header class="top">
	<div class="wrap bar">
		<a href="/" class="brand" aria-label="Receptio – domov"><Logo /></a>
		<nav class="desktop" aria-label="Hlavná navigácia">
			{#each NAV as item (item.href)}
				<a
					href={item.href}
					class="nav-link draw-host"
					class:active={isActive(item.href)}
					aria-current={isActive(item.href) ? 'page' : undefined}
				>
					<Icon name={item.icon} size={19} />
					{item.label}
					{#if item.href === '/plan' && planCount > 0}<span class="dot">{planCount}</span>{/if}
				</a>
			{/each}
		</nav>
		<a
			class="icon-btn mine"
			class:active={isActive('/moje')}
			href="/moje"
			aria-label="Moje: obľúbené, história, záloha"
			title="Moje"
		>
			<Icon name="bookmark" size={19} />
		</a>
		<button class="icon-btn theme" onclick={toggleTheme} aria-label="Prepnúť svetlý/tmavý režim">
			<span class="sun"><Icon name="sun" size={19} /></span>
			<span class="moon"><Icon name="moon" size={19} /></span>
		</button>
	</div>
</header>

<main id="main">
	{@render children()}
</main>

<footer class="foot">
	<div class="wrap">
		<Logo size={28} />
		<p>
			Komunitné, otvorené a zadarmo. Nutričné hodnoty a ceny sú orientačné.
			<a href="/wiki/o-receptiu">Ako to funguje</a> · <a href="/navrhni">Navrhni recept</a> ·
			<a href="/moje">Záloha dát</a>
		</p>
	</div>
</footer>

{#if !page.state.cooking}<TimerDock floating />{/if}

<nav class="mobile" aria-label="Navigácia">
	{#each NAV as item (item.href)}
		<a
			href={item.href}
			class:active={isActive(item.href)}
			aria-current={isActive(item.href) ? 'page' : undefined}
		>
			<span class="ico">
				<Icon name={item.icon} size={22} />
				{#if item.href === '/plan' && planCount > 0}<span class="dot">{planCount}</span>{/if}
			</span>
			<span class="lbl">{item.label}</span>
		</a>
	{/each}
</nav>

<style>
	.skip {
		position: absolute;
		left: -999px;
		top: 8px;
		z-index: 100;
		background: var(--ink);
		color: var(--paper);
		padding: 8px 14px;
		border-radius: 10px;
	}
	.skip:focus {
		left: 8px;
	}
	.top {
		position: sticky;
		top: 0;
		z-index: 40;
		background: color-mix(in srgb, var(--paper) 82%, transparent);
		backdrop-filter: blur(14px) saturate(1.3);
		border-bottom: 1px solid color-mix(in srgb, var(--line) 70%, transparent);
		view-transition-name: header;
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 16px;
		height: 64px;
	}
	.brand {
		text-decoration: none;
		margin-right: auto;
	}
	.desktop {
		display: none;
		gap: 2px;
	}
	.nav-link {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 7px;
		padding: 8px 12px;
		border-radius: 999px;
		color: var(--ink-2);
		text-decoration: none;
		font-weight: 600;
		font-size: 0.95rem;
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
	.dot {
		display: inline-grid;
		place-items: center;
		min-width: 18px;
		height: 18px;
		padding: 0 5px;
		border-radius: 999px;
		background: var(--tomato);
		color: #fff;
		font-size: 0.7rem;
		font-weight: 800;
	}
	.mine {
		margin-right: -8px;
	}
	.mine.active {
		background: var(--leaf-soft);
		color: var(--leaf);
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

	main {
		position: relative;
		z-index: 1;
		min-height: 70vh;
		padding-bottom: 40px;
	}

	.foot {
		position: relative;
		z-index: 1;
		border-top: 1px solid var(--line);
		padding: 28px 0 110px;
		color: var(--muted);
		font-size: 0.9rem;
	}
	.foot .wrap {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px 24px;
	}
	.foot p {
		margin: 0;
	}

	.mobile {
		position: fixed;
		left: 10px;
		right: 10px;
		bottom: calc(10px + env(safe-area-inset-bottom));
		z-index: 50;
		display: grid;
		grid-template-columns: repeat(6, 1fr);
		background: color-mix(in srgb, var(--card) 88%, transparent);
		backdrop-filter: blur(16px) saturate(1.4);
		border: 1px solid var(--line);
		border-radius: 22px;
		box-shadow: var(--shadow-lift);
		padding: 6px;
		view-transition-name: mobile-nav;
	}
	.mobile a {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		padding: 6px 0;
		border-radius: 16px;
		color: var(--muted);
		text-decoration: none;
		font-size: 0.68rem;
		font-weight: 700;
		transition:
			color 0.2s,
			background 0.2s;
	}
	.mobile a.active {
		color: var(--ink);
		background: var(--paper-2);
	}
	.mobile a.active .ico {
		animation: hop 0.5s var(--ease-spring);
	}
	.ico {
		position: relative;
	}
	.ico .dot {
		position: absolute;
		top: -6px;
		right: -10px;
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
		.mobile {
			display: none;
		}
		.foot {
			padding-bottom: 40px;
		}
	}
</style>
