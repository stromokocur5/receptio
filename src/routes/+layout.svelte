<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { beforeNavigate, onNavigate } from '$app/navigation';
	import { page, updated } from '$app/state';
	import { indexCatalog, provideCatalog } from '$lib/catalog';
	import Icon, { type IconName } from '$lib/components/Icon.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import MoreMenu, { MORE_MENU_ID, MORE_PATHS } from '$lib/components/MoreMenu.svelte';
	import Onboarding from '$lib/components/Onboarding.svelte';
	import DigestWriter from '$lib/components/DigestWriter.svelte';
	import TimerDock from '$lib/components/TimerDock.svelte';
	import {
		changes,
		digestReminder,
		loadLikes,
		loadPersisted,
		plan,
		settings,
		ui
	} from '$lib/state.svelte';
	import { initSync, noteChange, syncState } from '$lib/sync.svelte';
	import { onboarding, shouldOnboard } from '$lib/onboarding.svelte';
	import { initInstall } from '$lib/install.svelte';
	import { loadTimers } from '$lib/timers.svelte';

	let { data, children } = $props();

	const catalog = $derived(indexCatalog(data.catalog));
	provideCatalog(() => catalog);

	/** The four things people come for; everything else lives under "Viac". */
	const NAV: { href: string; label: string; icon: IconName }[] = [
		{ href: '/recepty', label: 'Recepty', icon: 'bowl' },
		{ href: '/plan', label: 'Plán a nákup', icon: 'calendar' },
		{ href: '/spajza', label: 'Špajza', icon: 'jar' },
		{ href: '/pestuj', label: 'Pestuj', icon: 'sprout' }
	];

	const planCount = $derived(plan.current.length);
	/** Sync needs the user's attention (failed upload or two devices disagree). */
	const syncTrouble = $derived(syncState.status === 'error' || syncState.status === 'conflict');
	const isActive = (href: string) =>
		page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
	const moreActive = $derived(MORE_PATHS.some(isActive));

	onMount(() => {
		loadPersisted();
		loadTimers();
		void loadLikes();
		initSync();
		initInstall();
		if (shouldOnboard(page.url)) onboarding.open = true;
	});

	$effect(() => {
		if (changes.count > 0) noteChange();
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

<a class="skip" href="#main" data-noprint>Preskočiť na obsah</a>

<header class="top" data-noprint>
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
			<button class="nav-link draw-host" class:active={moreActive} popovertarget={MORE_MENU_ID}>
				<Icon name="sparkle" size={19} />
				Viac
			</button>
		</nav>
		<a
			class="icon-btn mine"
			class:active={isActive('/moje')}
			href="/moje"
			aria-label={syncTrouble
				? 'Moje: synchronizácia potrebuje pozornosť'
				: 'Moje: obľúbené, história, záloha'}
			title={syncTrouble ? 'Synchronizácia potrebuje pozornosť' : 'Moje'}
		>
			<Icon name="bookmark" size={19} />
			{#if syncTrouble}<span class="alert-dot" aria-hidden="true"></span>{/if}
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

<footer class="foot" data-noprint>
	<div class="wrap">
		<Logo size={28} />
		<p>
			Komunitné, otvorené a zadarmo. Živiny, alergény a ceny sú orientačné – pri alergii kontroluj
			etiketu.
			<a href="/wiki/o-receptiu">Ako to funguje</a> · <a href="/navrhni">Navrhni recept</a> ·
			<a href="/moje">Záloha dát</a> · <a href="/sukromie">Ochrana súkromia</a> ·
			<a href="mailto:gabriel@kohut.xyz">Kontakt</a>
		</p>
	</div>
</footer>

{#if !page.state.cooking}<TimerDock floating />{/if}

<Onboarding />
{#if ui.loaded && digestReminder.current}<DigestWriter />{/if}

<div class="nav-fade" aria-hidden="true" data-noprint></div>
<nav class="mobile" aria-label="Navigácia" data-noprint>
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
			<span class="lbl">{item.href === '/plan' ? 'Plán' : item.label}</span>
		</a>
	{/each}
	<button class:active={moreActive} popovertarget={MORE_MENU_ID}>
		<span class="ico">
			<Icon name="sparkle" size={22} />
			{#if syncTrouble}<span class="alert-dot" aria-hidden="true"></span>{/if}
		</span>
		<span class="lbl">Viac</span>
	</button>
</nav>

<MoreMenu />

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
		background: color-mix(in srgb, var(--paper) 94%, transparent);
		backdrop-filter: blur(14px);
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
		border: 0;
		background: none;
		font: inherit;
		cursor: pointer;
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
		position: relative;
		margin-right: -8px;
	}
	.alert-dot {
		position: absolute;
		top: 7px;
		right: 7px;
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: var(--tomato);
		box-shadow: 0 0 0 2px var(--paper);
		animation: pulse-dot 2s ease-in-out infinite;
	}
	@keyframes pulse-dot {
		50% {
			transform: scale(1.3);
		}
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

	/* Without it, cards peek out under and around the floating navigation. */
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
		left: 10px;
		right: 10px;
		bottom: calc(10px + env(safe-area-inset-bottom));
		z-index: 50;
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: 22px;
		box-shadow: var(--shadow-lift);
		padding: 6px;
		view-transition-name: mobile-nav;
	}
	.mobile a,
	.mobile button {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		padding: 6px 0;
		border-radius: 16px;
		color: var(--muted);
		text-decoration: none;
		border: 0;
		background: none;
		font: inherit;
		font-size: 0.7rem;
		font-weight: 700;
		cursor: pointer;
		transition:
			color 0.2s,
			background 0.2s;
	}
	.mobile .active {
		color: var(--ink);
		background: var(--paper-2);
	}
	.mobile .active .ico {
		animation: hop 0.5s var(--ease-spring);
	}
	.ico {
		position: relative;
	}
	.ico .alert-dot {
		top: -2px;
		right: -4px;
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
		.mobile,
		.nav-fade {
			display: none;
		}
		.foot {
			padding-bottom: 40px;
		}
	}
</style>
