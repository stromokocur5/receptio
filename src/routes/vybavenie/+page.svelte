<script lang="ts">
	import Icon, { isIconName } from '$lib/components/Icon.svelte';
	import JumpNav from '$lib/components/JumpNav.svelte';
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
	description="Bez čoho sa v kuchyni nezaobídeš, čo sa oplatí dokúpiť a čím nahradíš to, čo doma nemáš."
/>

<div class="wrap page">
	<header class="rise">
		<p class="eyebrow">Vedieť viac</p>
		<h1>Vybavenie kuchyne</h1>
		<p class="lede">
			Netreba plnú kuchyňu. Každý recept ukazuje, čo budeš potrebovať, a keď niečo nemáš, ťukni na
			„Nemám“ – ukáže sa náhrada. Tu je celý zoznam.
		</p>
	</header>

	<JumpNav
		links={LEVELS.map((l) => ({
			id: `uroven-${l.id}`,
			label: l.title,
			count: data.equipment.filter((e) => e.level === l.id).length
		}))}
	/>

	<section class="card box starter">
		<h2 class="section-title"><Icon name="sparkle" size={22} /> Štartovacia výbava za ~50 €</h2>
		<p>
			Ostrý nôž a doska, veľká panvica, stredný a veľký hrniec s pokrievkou, sitko, strúhadlo,
			metlička, dve misky a lacná digitálna váha. Neskôr tyčový mixér (od 20 €) a plech s papierom
			na pečenie – s tým zvládneš aj väčšinu receptov, kde sa mixuje alebo pečie.
		</p>
	</section>

	{#each LEVELS as level (level.id)}
		<section class="level" id="uroven-{level.id}" style:--tone={level.tone}>
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
								Recepty, ktoré sa bez toho zaobídu <Icon name="arrow-right" size={14} />
							</a>
						{/if}
					</article>
				{/each}
			</div>
		</section>
	{/each}
</div>

<style>
	.starter {
		background: var(--leaf-soft);
		border-color: transparent;
	}
	.starter h2 {
		font-size: var(--fs-lg);
		margin-bottom: var(--sp-2);
	}
	.starter p {
		margin: 0;
	}
	.level {
		margin-top: var(--sp-6);
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
		border-radius: var(--radius-sm);
		background: color-mix(in srgb, var(--tone) 18%, transparent);
		color: var(--tone);
		transform: rotate(-4deg);
	}
	.tool p {
		font-size: var(--fs-md);
		color: var(--ink-2);
		margin: 12px 0;
	}
	.alt {
		padding: 10px 12px;
		border-radius: var(--radius-sm);
		background: var(--sunk);
		font-size: var(--fs-md);
	}
	.alt ul {
		margin: 4px 0 0;
		padding-left: 1.1em;
	}
	.alt li {
		margin: 3px 0;
	}
	.filter-link {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		min-height: var(--tap);
		font-size: var(--fs-sm);
		font-weight: 650;
	}
</style>
