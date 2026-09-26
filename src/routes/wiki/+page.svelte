<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import { useCatalog } from '$lib/catalog';
	import Icon, { isIconName } from '$lib/components/Icon.svelte';
	import type { WikiSection } from '$lib/types';

	const catalog = useCatalog();

	const SECTIONS: { id: WikiSection; title: string; text: string; tone: string }[] = [
		{
			id: 'zaklady',
			title: 'Základy varenia',
			text: 'Pre tých, čo nikdy nevarili. Ryža, strukoviny, tofu, korenie.',
			tone: 'var(--leaf-2)'
		},
		{
			id: 'suplementy',
			title: 'Suplementy a živiny',
			text: 'Čo brať, koľko a prečo. B12 je povinná, zvyšok s rozumom.',
			tone: 'var(--sky)'
		},
		{
			id: 'navody',
			title: 'Návody',
			text: 'Bezlepkovo, zásoby, nákup vo veľkom a ako Receptio počíta.',
			tone: 'var(--turmeric)'
		}
	];
</script>

<Seo title="Wiki" description="Základy varenia, suplementy a návody pre rastlinnú stravu." />

<div class="wrap page">
	<header class="rise">
		<p class="eyebrow">Wiki</p>
		<h1>Vedieť, nie hádať</h1>
		<p class="lede">
			Krátke a praktické návody. Nie sme lekári, pri zdravotných problémoch sa poraď s odborníkom.
		</p>
	</header>

	{#each SECTIONS as section (section.id)}
		<section class="section" style:--tone={section.tone}>
			<h2>{section.title}</h2>
			<p class="muted">{section.text}</p>
			<div class="grid">
				{#if section.id === 'zaklady'}
					<a class="item card draw-host rise" href="/vybavenie">
						<span class="ico"><Icon name="pan" size={26} /></span>
						<span>
							<strong>Vybavenie kuchyne</strong>
							<span class="sum">Panvice, hrnce, mixér, rúra – čo treba a čím to nahradiť.</span>
						</span>
					</a>
				{/if}
				{#each catalog.wiki.filter((w) => w.section === section.id) as page, i (page.slug)}
					<a class="item card draw-host rise" href="/wiki/{page.slug}" style:--i={i}>
						<span class="ico"
							><Icon name={isIconName(page.icon) ? page.icon : 'leaf'} size={26} /></span
						>
						<span>
							<strong>{page.title}</strong>
							<span class="sum">{page.summary}</span>
						</span>
					</a>
				{/each}
			</div>
		</section>
	{/each}
</div>

<style>
	.page {
		padding-top: 28px;
	}
	.lede {
		color: var(--ink-2);
		max-width: 40em;
	}
	.section {
		margin-top: 36px;
	}
	.section h2 {
		margin-bottom: 4px;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
		gap: 12px;
		margin-top: 14px;
	}
	.item {
		display: flex;
		gap: 14px;
		padding: 16px;
		color: inherit;
		text-decoration: none;
		transition:
			transform 0.3s var(--ease-spring),
			box-shadow 0.3s;
		animation-delay: calc(var(--i) * 50ms);
	}
	.item:hover {
		transform: translateY(-3px) rotate(-0.5deg);
		box-shadow: var(--shadow-lift);
	}
	.ico {
		flex: none;
		display: grid;
		place-items: center;
		width: 48px;
		height: 48px;
		border-radius: 16px;
		background: color-mix(in srgb, var(--tone) 18%, transparent);
		color: var(--tone);
		transform: rotate(-4deg);
	}
	.sum {
		display: block;
		font-size: 0.88rem;
		color: var(--ink-2);
		margin-top: 2px;
	}
</style>
