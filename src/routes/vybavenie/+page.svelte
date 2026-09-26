<script lang="ts">
	import Icon, { isIconName } from '$lib/components/Icon.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import { pluralRecipes } from '$lib/labels';
	import type { EquipmentLevel } from '$lib/types';

	let { data } = $props();

	const LEVELS: { id: EquipmentLevel; title: string; text: string; tone: string }[] = [
		{
			id: 'zaklad',
			title: 'Základ',
			text: 'S týmto uvaríš skoro všetko. Ak začínaš, kúp najprv toto – netreba drahé.',
			tone: 'var(--leaf-2)'
		},
		{
			id: 'uzitocne',
			title: 'Oplatí sa',
			text: 'Otvorí ďalšie recepty: pečenie, krémové polievky, hummus a smoothie.',
			tone: 'var(--turmeric)'
		},
		{
			id: 'specialne',
			title: 'Na pár receptov',
			text: 'Nie je nutné. Pri každom je napísané, čím ho nahradíš.',
			tone: 'var(--plum)'
		}
	];
	/** Tools the recipe list can filter out ("Nemám doma"). */
	const FILTERABLE = new Set(['rura', 'mixer', 'sekacik', 'teplomer']);
</script>

<Seo
	title="Vybavenie kuchyne"
	description="Čo potrebuješ na varenie – panvice, hrnce, mixér, rúra – a čím to nahradíš, keď to nemáš."
/>

<div class="wrap page">
	<header class="rise">
		<p class="eyebrow">Wiki · Základy</p>
		<h1>Vybavenie kuchyne</h1>
		<p class="lede">
			Netreba plnú kuchyňu. Každý recept ukazuje, čo budeš potrebovať, a keď niečo nemáš, ťukni na
			„Nemám“ – ukáže sa náhrada. Tu je celý zoznam.
		</p>
	</header>

	<section class="card starter">
		<h2><Icon name="sparkle" size={22} /> Štartovacia výbava za ~50 €</h2>
		<p>
			Ostrý nôž a doska, veľká panvica, stredný a veľký hrniec s pokrievkou, sitko, strúhadlo,
			metlička, dve misky a lacná digitálna váha. Neskôr tyčový mixér (od 20 €) a plech s papierom
			na pečenie – s tým zvládneš aj väčšinu receptov, kde sa mixuje alebo pečie.
		</p>
	</section>

	{#each LEVELS as level (level.id)}
		<section class="level" style:--tone={level.tone}>
			<h2>{level.title}</h2>
			<p class="muted">{level.text}</p>
			<div class="grid">
				{#each data.equipment.filter((e) => e.level === level.id) as tool, i (tool.id)}
					<article class="tool card rise" id={tool.id} style:--i={i}>
						<div class="head">
							<span class="ico"
								><Icon name={isIconName(tool.icon) ? tool.icon : 'spoon'} size={26} /></span
							>
							<div>
								<h3><a href="/vybavenie/{tool.id}">{tool.name}</a></h3>
								{#if tool.recipeCount}
									<span class="muted small"
										>{tool.recipeCount} {pluralRecipes(tool.recipeCount)}</span
									>
								{/if}
							</div>
						</div>
						<p>{tool.about}</p>
						<div class="alt">
							<strong>Nemáš?</strong>
							<ul>
								{#each tool.alternatives as alt, j (j)}<li>{alt}</li>{/each}
							</ul>
						</div>
						{#if FILTERABLE.has(tool.id)}
							<a class="filter-link" href="/recepty?nemam={tool.id}">
								Recepty bez tohto <Icon name="arrow-right" size={14} />
							</a>
						{/if}
					</article>
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
		max-width: 44em;
	}
	.starter {
		padding: 20px;
		margin-top: 8px;
		background: var(--leaf-soft);
		border-color: transparent;
	}
	.starter h2 {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 1.2rem;
		margin: 0 0 6px;
	}
	.starter p {
		margin: 0;
	}
	.level {
		margin-top: 36px;
	}
	.level h2 {
		margin-bottom: 4px;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
		gap: 14px;
		margin-top: 14px;
	}
	.tool {
		padding: 18px;
		animation-delay: calc(var(--i) * 40ms);
		scroll-margin-top: 90px;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.head h3 {
		margin: 0;
		font-size: 1.15rem;
	}
	.head h3 a {
		color: inherit;
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
	.tool p {
		font-size: 0.93rem;
		color: var(--ink-2);
		margin: 12px 0;
	}
	.alt {
		padding: 10px 12px;
		border-radius: 12px;
		background: var(--paper);
		font-size: 0.9rem;
	}
	.alt ul {
		margin: 4px 0 0;
		padding-left: 1.1em;
	}
	.alt li {
		margin: 3px 0;
	}
	.small {
		font-size: 0.82rem;
	}
	.filter-link {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		margin-top: 10px;
		font-size: 0.85rem;
		font-weight: 650;
	}
</style>
