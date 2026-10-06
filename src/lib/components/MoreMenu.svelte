<script lang="ts" module>
	import type { IconName } from '$lib/components/Icon.svelte';

	export const MORE_MENU_ID = 'more-menu';

	interface MoreLink {
		href: string;
		label: string;
		hint: string;
		icon: IconName;
	}

	/** Everything outside the four main areas, grouped by what people come for. */
	export const MORE_GROUPS: { title: string; links: MoreLink[] }[] = [
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
				{ href: '/ceny', label: 'Ceny', hint: 'Čo koľko stojí v obchodoch', icon: 'tag' },
				{ href: '/vybavenie', label: 'Vybavenie', hint: 'Čo treba a čím to nahradiť', icon: 'pot' }
			]
		},
		{
			title: 'Ty',
			links: [
				{ href: '/moje', label: 'Moje', hint: 'Obľúbené, história, záloha', icon: 'bookmark' },
				{ href: '/navrhni', label: 'Navrhni recept', hint: 'Pošli svoj obľúbený', icon: 'send' }
			]
		},
		{
			title: 'O Receptiu',
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

	export const MORE_PATHS = MORE_GROUPS.flatMap((g) => g.links.map((l) => l.href));
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

<div
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
					{#if group.title === 'O Receptiu'}
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
										<small
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
</div>

<style>
	.more {
		position: fixed;
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
		background: rgba(17, 26, 20, 0.25);
	}
	@media (min-width: 900px) {
		.more {
			inset: 72px max(16px, calc((100vw - 1180px) / 2)) auto auto;
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
	@media (max-width: 420px) {
		.groups {
			grid-template-columns: 1fr;
			gap: 10px;
		}
	}
	h2 {
		margin: 0 0 4px 8px;
		font-family: var(--font-body);
		font-size: 0.72rem;
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
		padding: 7px 8px;
		border: 0;
		border-radius: 12px;
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
		border-radius: 11px;
		background: var(--paper-2);
		color: var(--leaf);
	}
	strong {
		display: block;
		font-size: 0.92rem;
	}
	small {
		display: block;
		font-size: 0.78rem;
		color: var(--muted);
	}
</style>
