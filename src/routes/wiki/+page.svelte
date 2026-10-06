<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import { useCatalog } from '$lib/catalog';
	import Icon, { isIconName, type IconName } from '$lib/components/Icon.svelte';
	import { normalizeSearch } from '$lib/labels';
	import type { WikiGroup, WikiSection } from '$lib/types';

	const catalog = useCatalog();

	const SECTIONS: {
		id: WikiSection;
		title: string;
		text: string;
		tone: string;
		icon: IconName;
		/** Tools elsewhere in the app that belong with these articles. */
		extras?: { href: string; title: string; text: string; icon: IconName }[];
	}[] = [
		{
			id: 'zaklady',
			title: 'Základy varenia',
			text: 'Pre tých, čo nikdy nevarili. Každý recept na tieto návody odkazuje sám.',
			tone: 'var(--leaf-2)',
			icon: 'chef',
			extras: [
				{
					href: '/suroviny',
					title: 'Suroviny – čo je čo',
					text: 'Druhy, ako vybrať, skladovanie, náhrady a sezóna.',
					icon: 'bean'
				},
				{
					href: '/vybavenie',
					title: 'Vybavenie kuchyne',
					text: 'Čo treba a čím to nahradiť.',
					icon: 'pan'
				}
			]
		},
		{
			id: 'suplementy',
			title: 'Výživa a suplementy',
			text: 'Čo brať, koľko a prečo. B12 je povinná, zvyšok s rozumom.',
			tone: 'var(--sky)',
			icon: 'pill'
		},
		{
			id: 'navody',
			title: 'Vegánsky život',
			text: 'Bezlepkovo, náhrady, uhlíková stopa a ako Receptio počíta.',
			tone: 'var(--turmeric)',
			icon: 'leaf',
			extras: [
				{
					href: '/sezona',
					title: 'Sezónny kalendár',
					text: 'Čo sa na Slovensku kedy zbiera.',
					icon: 'calendar'
				}
			]
		},
		{
			id: 'pestovanie',
			title: 'Pestovanie',
			text: 'Od okna v byte po lesnú záhradu – polykultúry, stromy a kry, semená, huby, kompost.',
			tone: 'var(--leaf)',
			icon: 'sprout',
			extras: [
				{
					href: '/pestuj',
					title: 'Plánovač záhradky',
					text: 'Čo sa oplatí pestovať a kalendár prác.',
					icon: 'sparkle'
				}
			]
		},
		{
			id: 'pohyb',
			title: 'Pohyb',
			text: 'K dobrému jedlu aj trochu cvičenia. Bez posilňovne.',
			tone: 'var(--tomato)',
			icon: 'dumbbell'
		},
		{
			id: 'svet',
			title: 'Techniky zo sveta',
			text: 'Osvedčené postupy z iných krajín – v kuchyni, na záhrade, v špajzi aj pri pohybe. U nás málo známe, ale fungujú.',
			tone: 'var(--sky)',
			icon: 'globe'
		}
	];

	const GROUPS: Partial<Record<WikiSection, { id: WikiGroup; title: string }[]>> = {
		zaklady: [
			{ id: 'prve-kroky', title: 'Prvé kroky' },
			{ id: 'prilohy', title: 'Prílohy a bielkoviny' },
			{ id: 'techniky', title: 'Techniky' },
			{ id: 'domaca-vyroba', title: 'Kvasenie a domáca výroba' },
			{ id: 'konzervovanie', title: 'Konzervovanie a zásoby na zimu' },
			{ id: 'organizacia', title: 'Zásoby a plánovanie' }
		],
		pestovanie: [
			{ id: 'zaciname', title: 'Začíname' },
			{ id: 'techniky-pestovania', title: 'Techniky pestovania' },
			{ id: 'stromy-huby', title: 'Stromy, kry a huby' },
			{ id: 'uroda', title: 'Úroda a semená' }
		],
		svet: [
			{ id: 'svet-kuchyna', title: 'V kuchyni' },
			{ id: 'svet-spajza', title: 'Domáca výroba a uchovávanie' },
			{ id: 'svet-zahrada', title: 'Na záhrade' },
			{ id: 'svet-telo', title: 'Pohyb a stravovanie' }
		]
	};

	/** A short path for someone who opens the wiki for the first time. */
	const START_HERE = ['slovnik', 'jednotky', 'strukoviny', 'b12', 'o-receptiu'];

	let query = $state('');
	const matches = $derived.by(() => {
		const q = normalizeSearch(query.trim());
		if (q.length < 2) return null;
		return catalog.wiki.filter((w) => normalizeSearch(`${w.title} ${w.summary}`).includes(q));
	});
	const startHere = $derived(
		START_HERE.map((slug) => catalog.wiki.find((w) => w.slug === slug)).filter((w) => !!w)
	);
	const inSection = (id: WikiSection) => catalog.wiki.filter((w) => w.section === id);
	const toneOf = (id: WikiSection) => SECTIONS.find((s) => s.id === id)?.tone ?? 'var(--leaf-2)';
</script>

<Seo
	title="Wiki"
	description="Ako uvariť strukoviny, čo so suplementmi, ako zavárať či začať pestovať – krátke návody bez zbytočných rečí."
/>

<div class="wrap page">
	<header class="rise">
		<p class="eyebrow">Wiki</p>
		<h1>Vedieť, nie hádať</h1>
		<p class="lede">
			Krátke a praktické návody – od toho, ako uvariť ryžu, po to, koľko B12 treba. Nie sme lekári,
			pri zdravotných problémoch sa poraď s odborníkom. Začínaš s varením? Skús
			<a href="/kurz">kurz varenia</a> – 14 receptov, ktoré ťa to postupne naučia.
		</p>
		<label class="field search">
			<Icon name="search" size={20} />
			<input
				type="search"
				bind:value={query}
				placeholder="Hľadať v návodoch (tofu, železo, kompost…)"
				aria-label="Hľadať v návodoch"
			/>
		</label>
		{#if !matches}
			<nav class="jump" aria-label="Sekcie">
				{#each SECTIONS as s (s.id)}
					<a class="chip" href="#{s.id}" style:--tone={s.tone}
						><Icon name={s.icon} size={16} />
						{s.title}
						<span class="n">{inSection(s.id).length}</span></a
					>
				{/each}
			</nav>
		{/if}
	</header>

	{#if matches}
		<section class="section" aria-live="polite">
			<h2>
				{matches.length
					? `Nájdené: ${matches.length}`
					: 'Nič som nenašiel – skús iné slovo alebo prezri sekcie nižšie.'}
			</h2>
			<div class="grid">
				{#each matches as page, i (page.slug)}
					<a
						class="item card draw-host"
						href="/wiki/{page.slug}"
						style:--tone={toneOf(page.section)}
						style:--i={i}
					>
						<span class="ico"
							><Icon name={isIconName(page.icon) ? page.icon : 'leaf'} size={24} /></span
						>
						<span>
							<strong>{page.title}</strong>
							<span class="sum">{page.summary}</span>
						</span>
					</a>
				{/each}
			</div>
		</section>
	{:else}
		<section class="start card rise">
			<h2><Icon name="sparkle" size={22} /> Začni tu</h2>
			<ol>
				{#each startHere as page, i (page.slug)}
					<li>
						<a href="/wiki/{page.slug}">
							<span class="num">{i + 1}</span>
							<span>
								<strong>{page.title}</strong>
								<small>{page.summary}</small>
							</span>
						</a>
					</li>
				{/each}
			</ol>
		</section>

		{#each SECTIONS as section (section.id)}
			<section id={section.id} class="section" style:--tone={section.tone}>
				<div class="section-head">
					<span class="section-ico"><Icon name={section.icon} size={24} /></span>
					<div>
						<h2>{section.title}</h2>
						<p class="muted">{section.text}</p>
					</div>
				</div>

				{#if GROUPS[section.id]}
					{#each GROUPS[section.id] ?? [] as group (group.id)}
						<h3 class="group">{group.title}</h3>
						<div class="grid">
							{#each inSection(section.id).filter((w) => w.group === group.id) as page, i (page.slug)}
								<a class="item card draw-host rise" href="/wiki/{page.slug}" style:--i={i}>
									<span class="ico"
										><Icon name={isIconName(page.icon) ? page.icon : 'leaf'} size={24} /></span
									>
									<span>
										<strong>{page.title}</strong>
										<span class="sum">{page.summary}</span>
									</span>
								</a>
							{/each}
						</div>
					{/each}
				{:else}
					<div class="grid">
						{#each inSection(section.id) as page, i (page.slug)}
							<a class="item card draw-host rise" href="/wiki/{page.slug}" style:--i={i}>
								<span class="ico"
									><Icon name={isIconName(page.icon) ? page.icon : 'leaf'} size={24} /></span
								>
								<span>
									<strong>{page.title}</strong>
									<span class="sum">{page.summary}</span>
								</span>
							</a>
						{/each}
					</div>
				{/if}

				{#if section.extras}
					{#if section.id === 'zaklady'}<h3 class="group">V appke</h3>{/if}
					<div class="grid extras">
						{#each section.extras as extra (extra.href)}
							<a class="item tool draw-host" href={extra.href}>
								<span class="ico"><Icon name={extra.icon} size={24} /></span>
								<span>
									<strong>{extra.title} <Icon name="arrow-right" size={14} /></strong>
									<span class="sum">{extra.text}</span>
								</span>
							</a>
						{/each}
					</div>
				{/if}
			</section>
		{/each}
	{/if}
</div>

<style>
	.page {
		padding-top: 28px;
	}
	.lede {
		color: var(--ink-2);
		max-width: 44em;
	}
	.search {
		max-width: 560px;
		margin: 18px 0 14px;
	}
	.search input {
		flex: 1;
		min-width: 0;
	}
	.jump {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.jump .chip :global(svg) {
		color: var(--tone);
	}
	.n {
		font-size: 0.72rem;
		color: var(--muted);
	}
	.start {
		margin-top: 28px;
		padding: 20px;
		background:
			radial-gradient(circle at 100% 0%, var(--turmeric-soft), transparent 45%), var(--card);
	}
	.start h2 {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0 0 12px;
	}
	.start ol {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 8px;
	}
	.start a {
		display: flex;
		gap: 10px;
		align-items: flex-start;
		padding: 10px;
		border-radius: var(--radius-sm);
		color: inherit;
		text-decoration: none;
		transition: background 0.2s;
	}
	.start a:hover {
		background: var(--paper);
	}
	.num {
		flex: none;
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: var(--leaf);
		color: var(--paper);
		font-weight: 800;
		font-size: 0.85rem;
	}
	.start small {
		display: block;
		font-size: 0.82rem;
		color: var(--ink-2);
	}
	.section {
		margin-top: 44px;
		scroll-margin-top: 80px;
	}
	.section-head {
		display: flex;
		gap: 14px;
		align-items: center;
		margin-bottom: 8px;
	}
	.section-head h2 {
		margin: 0;
	}
	.section-head p {
		margin: 2px 0 0;
	}
	.section-ico {
		flex: none;
		display: grid;
		place-items: center;
		width: 48px;
		height: 48px;
		border-radius: 50%;
		background: var(--tone);
		color: var(--paper);
	}
	.group {
		margin: 22px 0 0;
		font-size: 0.8rem;
		font-family: var(--font-body);
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--muted);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
		gap: 12px;
		margin-top: 12px;
	}
	.item {
		display: flex;
		gap: 14px;
		padding: 14px 16px;
		color: inherit;
		text-decoration: none;
		transition:
			transform 0.3s var(--ease-spring),
			box-shadow 0.3s;
		animation-delay: calc(min(var(--i), 12) * 40ms);
	}
	.item:hover {
		transform: translateY(-3px) rotate(-0.5deg);
		box-shadow: var(--shadow-lift);
	}
	.tool {
		border: 1.5px dashed color-mix(in srgb, var(--tone) 55%, var(--line));
		border-radius: var(--radius);
		background: color-mix(in srgb, var(--tone) 7%, transparent);
	}
	.tool strong {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
	.ico {
		flex: none;
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		border-radius: 14px;
		background: color-mix(in srgb, var(--tone) 18%, transparent);
		color: color-mix(in srgb, var(--tone) 80%, var(--ink));
		transform: rotate(-4deg);
	}
	.sum {
		display: block;
		font-size: 0.86rem;
		color: var(--ink-2);
		margin-top: 2px;
	}
	@media (max-width: 560px) {
		.item {
			padding: 12px;
		}
		.sum {
			display: -webkit-box;
			-webkit-line-clamp: 2;
			line-clamp: 2;
			-webkit-box-orient: vertical;
			overflow: hidden;
		}
	}
</style>
