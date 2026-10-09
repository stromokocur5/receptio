<script lang="ts" module>
	import type { IconName } from '$lib/components/Icon.svelte';

	export const MORE_MENU_ID = 'more-menu';

	interface MoreLink {
		href: string;
		label: string;
		hint: string;
		icon: IconName;
	}

	/**
	 * Everything outside the four main areas, grouped by what people come for. Page eyebrows
	 * use the same group names, so the menu and the page say where you are in the same words.
	 */
	export const MORE_GROUPS: { title: string; links: MoreLink[]; app?: boolean }[] = [
		{
			title: 'Objavuj',
			links: [
				{ href: '/kuchyne', label: 'Kuchyne sveta', hint: 'Od Indie po Mexiko', icon: 'globe' },
				{ href: '/sezona', label: 'Čo je v sezóne', hint: 'Zelenina tohto mesiaca', icon: 'leaf' },
				{
					href: '/zvysky',
					label: 'Zo zvyškov',
					hint: 'Čo uvariť z toho, čo treba minúť',
					icon: 'jar'
				},
				{ href: '/suroviny', label: 'Suroviny', hint: 'Výber, uskladnenie, živiny', icon: 'bean' }
			]
		},
		{
			title: 'Vedieť viac',
			links: [
				{ href: '/wiki', label: 'Wiki', hint: 'Základy varenia, suplementy, pohyb', icon: 'book' },
				{ href: '/kurz', label: 'Kurz varenia', hint: '14 receptov od nuly', icon: 'chef' },
				{
					href: '/ceny',
					label: 'Ceny a akcie',
					hint: 'Čo koľko stojí, čo je v zľave',
					icon: 'tag'
				},
				{
					href: '/data',
					label: 'Dáta',
					hint: 'Vývoj cien, štatistiky, otvorené API',
					icon: 'chart'
				},
				{ href: '/vybavenie', label: 'Vybavenie', hint: 'Čo treba a čím to nahradiť', icon: 'pot' }
			]
		},
		{
			title: 'Ty',
			links: [
				{ href: '/moje', label: 'Moje', hint: 'Obľúbené, história, záloha', icon: 'bookmark' },
				{
					href: '/domacnost',
					label: 'Domácnosť',
					hint: 'Spoločný plán, nákup a špajza',
					icon: 'users'
				},
				{ href: '/navrhni', label: 'Navrhni recept', hint: 'Pošli svoj obľúbený', icon: 'send' }
			]
		},
		{
			title: 'O Receptiu',
			// The guide and "add to home screen" are about the app itself; they end this group.
			app: true,
			links: [
				{
					href: '/o-projekte',
					label: 'O projekte',
					hint: 'Prečo vzniklo a pre koho',
					icon: 'heart'
				},
				{ href: '/sukromie', label: 'Ochrana súkromia', hint: 'Čo sa kde ukladá', icon: 'shield' }
			]
		}
	];

	/**
	 * Pages that light up "Viac". Moje has its own button in the header; lighting both would
	 * mark two places as "you are here".
	 */
	export const MORE_PATHS = MORE_GROUPS.flatMap((g) => g.links.map((l) => l.href)).filter(
		(href) => href !== '/moje'
	);
</script>

<script lang="ts">
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';
	import { onboarding } from '$lib/onboarding.svelte';
	import { acceptInstall, install } from '$lib/install.svelte';

	let menu: HTMLElement;

	const isActive = (href: string) =>
		page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);

	function close() {
		menu.hidePopover();
	}
</script>

<nav
	class="more"
	id={MORE_MENU_ID}
	popover
	bind:this={menu}
	ontoggle={(e) => {
		// Keyboard users land in the menu instead of far down the page where it sits in the DOM.
		if ((e as ToggleEvent).newState === 'open')
			menu.querySelector<HTMLElement>('a, button')?.focus();
	}}
	aria-label="Ďalšie stránky"
>
	<div class="groups">
		{#each MORE_GROUPS as group (group.title)}
			<section>
				<h2>{group.title}</h2>
				<ul>
					{#each group.links as link (link.href)}
						<li>
							<a
								href={link.href}
								class:active={isActive(link.href)}
								aria-current={isActive(link.href) ? 'page' : undefined}
								onclick={close}
							>
								<span class="ico"><Icon name={link.icon} size={20} /></span>
								<span>
									<strong>{link.label}</strong>
									<small>{link.hint}</small>
								</span>
							</a>
						</li>
					{/each}
					{#if group.app}
						<li>
							<button
								onclick={() => {
									close();
									onboarding.open = true;
								}}
							>
								<span class="ico"><Icon name="info" size={20} /></span>
								<span>
									<strong>Ako to funguje</strong>
									<small>Krátky sprievodca appkou</small>
								</span>
							</button>
						</li>
						{#if install.prompt || install.hint}
							<li>
								<button
									onclick={() => {
										close();
										void acceptInstall();
									}}
								>
									<span class="ico"><Icon name="download" size={20} /></span>
									<span>
										<strong>Pridať na plochu</strong>
										<!-- The how-to stays on phones too: it's the instruction, not a hint. -->
										<small class="keep"
											>{install.prompt
												? 'Ako appka, funguje aj offline'
												: install.hint === 'ios'
													? 'Zdieľať → Pridať na plochu'
													: 'Menu prehliadača ⋮ → Pridať na plochu'}</small
										>
									</span>
								</button>
							</li>
						{/if}
					{/if}
				</ul>
			</section>
		{/each}
	</div>
</nav>

<style>
	.more {
		position: fixed;
		/* Above the floating bottom navigation (its height plus its 10px gap). */
		inset: auto 10px calc(86px + env(safe-area-inset-bottom)) 10px;
		width: auto;
		margin: 0;
		max-height: calc(100dvh - 170px);
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 14px;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		background: var(--card);
		color: var(--ink);
		box-shadow: var(--shadow-lift);
		opacity: 1;
		transform: none;
		transition:
			opacity 0.2s,
			transform 0.3s var(--ease-spring),
			display 0.3s allow-discrete,
			overlay 0.3s allow-discrete;
	}
	.more:not(:popover-open) {
		opacity: 0;
		transform: translateY(16px) scale(0.98);
	}
	@starting-style {
		.more:popover-open {
			opacity: 0;
			transform: translateY(16px) scale(0.98);
		}
	}
	.more::backdrop {
		background: var(--backdrop);
	}
	@media (min-width: 900px) {
		.more {
			inset: calc(var(--header-h) + 8px) max(16px, calc((100vw - 1180px) / 2)) auto auto;
			width: 620px;
			max-height: calc(100dvh - 100px);
		}
		.more:not(:popover-open) {
			transform: translateY(-8px) scale(0.98);
		}
		@starting-style {
			.more:popover-open {
				transform: translateY(-8px) scale(0.98);
			}
		}
		.more::backdrop {
			background: transparent;
		}
	}
	.groups {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 14px 12px;
	}
	h2 {
		margin: 0 0 4px 8px;
		font-family: var(--font-body);
		font-size: var(--fs-xs);
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--muted);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 2px;
	}
	a,
	button {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		min-height: var(--tap);
		padding: 7px 8px;
		border: 0;
		border-radius: var(--radius-sm);
		background: none;
		color: inherit;
		font: inherit;
		text-align: left;
		text-decoration: none;
		cursor: pointer;
		transition: background 0.15s;
	}
	a:hover,
	button:hover {
		background: var(--paper);
	}
	a.active {
		background: var(--leaf-soft);
	}
	.ico {
		display: grid;
		place-items: center;
		flex: none;
		width: 36px;
		height: 36px;
		border-radius: var(--radius-xs);
		background: var(--paper-2);
		color: var(--leaf);
	}
	strong {
		display: block;
		font-size: var(--fs-sm);
		line-height: 1.25;
	}
	small {
		display: block;
		font-size: var(--fs-xs);
		color: var(--muted);
	}
	/* Phones keep two columns and drop the hints, so the whole menu fits without scrolling. */
	@media (max-width: 480px) {
		.groups {
			gap: 10px 6px;
		}
		small:not(.keep) {
			display: none;
		}
		.ico {
			width: 30px;
			height: 30px;
		}
		a,
		button {
			gap: 8px;
			padding-inline: 6px;
		}
	}
</style>
