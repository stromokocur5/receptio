<script lang="ts">
	import { useCatalog } from '$lib/catalog';
	import Icon, { type IconName } from '$lib/components/Icon.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import { pluralRecipes } from '$lib/labels';
	import { onboarding } from '$lib/onboarding.svelte';

	const catalog = useCatalog();

	const PRINCIPLES: { icon: IconName; title: string; text: string }[] = [
		{
			icon: 'shield',
			title: 'Bez reklám, bez sledovania, bez konta',
			text: 'Žiadne vyskakovacie okná ani analytika. Plán, špajza a obľúbené sú v tvojom prehliadači; synchronizácia je šifrovaná tak, že ju nikto iný neprečíta.'
		},
		{
			icon: 'scale',
			title: 'Čísla, ktorým sa dá veriť',
			text: 'Recept odkazuje na databázu surovín a živiny, cena, lepok aj alergény sa z nej počítajú. Keď je cena len odhad, je to napísané.'
		},
		{
			icon: 'euro',
			title: 'Lacno a zdravo',
			text: 'Pri každom recepte vidíš cenu porcie a bielkoviny, železo, vápnik či zinok – živiny, na ktoré si pri rastlinnej strave treba dať pozor. B12 z jedla nezískaš, ten treba suplementovať.'
		},
		{
			icon: 'book',
			title: 'Aj pre začiatočníkov',
			text: 'Recepty odkazujú na návody – ako uvariť strukoviny, ako na tofu, čo znamená PL a ČL. Režim varenia ťa prevedie krok za krokom.'
		},
		{
			icon: 'users',
			title: 'Otvorené pre každého',
			text: 'Zadarmo a nekomerčne. Recept môže navrhnúť ktokoľvek, pred zverejnením sa skontroluje a dopočíta.'
		}
	];
</script>

<Seo
	title="O projekte"
	description="Prečo Receptio vzniklo, čo sa v ňom dá robiť a na čom si zakladá."
/>

<div class="wrap page">
	<header class="rise">
		<p class="eyebrow">O projekte</p>
		<h1>Prečo Receptio vzniklo</h1>
		<p class="lede">
			Rastlinné jedlo, ktoré sedí telu aj peňaženke – a nástroj, ktorý pri ňom pomáha, namiesto
			toho, aby zavadzal.
		</p>
	</header>

	<section class="story card rise">
		<span class="quote" aria-hidden="true"><Icon name="heart" size={28} /></span>
		<div class="prose">
			<p>
				Receptio vzniklo pre mňa a kamarátov. Varíme rastlinne a chýbali nám dobré vegánske a
				bezlepkové recepty <strong>po slovensky</strong>, pri ktorých by bolo hneď jasné, koľko
				bielkovín či železa v nich je a <strong>koľko stojí porcia</strong>.
			</p>
			<p>
				Weby s receptami boli plné reklám, vyskakovacích okien a príbehov nad receptom. Čísla
				chýbali, nákupný zoznam sa písal ručne a čo bolo doma v špajzi, nevedel nikto.
			</p>
			<p>
				Tak vznikol jeden nástroj, ktorý to spája: <strong
					>recepty, plán na týždeň, nákup, špajzu</strong
				>
				a neskôr aj pestovanie. Dnes je otvorený pre každého – zadarmo, bez reklám a bez sledovania.
			</p>
		</div>
	</section>

	<section class="numbers">
		<div>
			<strong>{catalog.recipes.length}</strong><span>{pluralRecipes(catalog.recipes.length)}</span>
		</div>
		<div><strong>{catalog.cuisines.length}</strong><span>kuchýň sveta</span></div>
		<div><strong>{catalog.ingredients.length}</strong><span>surovín v databáze</span></div>
		<div><strong>{catalog.wiki.length}</strong><span>návodov vo wiki</span></div>
	</section>

	<section class="block">
		<h2>Na čom si Receptio zakladá</h2>
		<ul class="principles">
			{#each PRINCIPLES as p, i (p.title)}
				<li class="card rise" style:--i={i}>
					<span class="ico"><Icon name={p.icon} size={24} /></span>
					<div>
						<strong>{p.title}</strong>
						<p>{p.text}</p>
					</div>
				</li>
			{/each}
		</ul>
	</section>

	<section class="block">
		<h2>Čo sa tu dá robiť</h2>
		<div class="doors">
			<a class="card door" href="/recepty"><Icon name="bowl" size={22} /> Hľadať recepty</a>
			<a class="card door" href="/plan"><Icon name="calendar" size={22} /> Plánovať a nakupovať</a>
			<a class="card door" href="/spajza"><Icon name="jar" size={22} /> Variť z toho, čo mám</a>
			<a class="card door" href="/pestuj"><Icon name="sprout" size={22} /> Pestovať</a>
			<a class="card door" href="/wiki"><Icon name="book" size={22} /> Učiť sa základy</a>
			<button class="card door" onclick={() => (onboarding.open = true)}
				><Icon name="play" size={22} /> Pozrieť sprievodcu</button
			>
		</div>
	</section>

	<section class="block contact card">
		<div>
			<h2>Kto za tým je</h2>
			<p>
				Receptio robí <strong>Gabriel Kohut</strong>. Nápady, chyby v receptoch alebo otázky pošli
				na <a href="mailto:gabriel@kohut.xyz">gabriel@kohut.xyz</a>, recept cez formulár.
			</p>
			<p class="muted small">
				Podrobnosti o výpočtoch: <a href="/wiki/o-receptiu">Ako Receptio funguje</a> · O dátach:
				<a href="/sukromie">Ochrana súkromia</a>
			</p>
		</div>
		<a class="btn leaf" href="/navrhni"><Icon name="send" size={18} /> Navrhni recept</a>
	</section>
</div>

<style>
	.page {
		padding-top: 28px;
		padding-bottom: 40px;
	}
	.lede {
		color: var(--ink-2);
		max-width: 44em;
		font-size: 1.1rem;
	}
	.story {
		position: relative;
		margin-top: 24px;
		padding: 28px 24px 24px;
		max-width: 760px;
		background:
			radial-gradient(circle at 100% 0%, var(--turmeric-soft), transparent 45%),
			radial-gradient(circle at 0% 100%, var(--leaf-soft), transparent 50%), var(--card);
	}
	.story .prose p {
		font-size: 1.05rem;
	}
	.quote {
		position: absolute;
		top: -18px;
		left: 20px;
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		border-radius: 50%;
		background: var(--tomato);
		color: var(--paper);
		box-shadow: var(--shadow);
	}
	.numbers {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
		gap: 10px;
		margin-top: 28px;
	}
	.numbers div {
		display: grid;
		padding: 14px 16px;
		border-radius: var(--radius-sm);
		background: var(--leaf-soft);
	}
	.numbers strong {
		font-family: var(--font-display);
		font-size: 2rem;
		line-height: 1.1;
		color: var(--leaf);
	}
	.numbers span {
		color: var(--ink-2);
		font-size: 0.9rem;
	}
	.block {
		margin-top: 44px;
	}
	.principles {
		list-style: none;
		margin: 14px 0 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: 12px;
	}
	.principles li {
		display: flex;
		gap: 14px;
		padding: 16px;
		animation-delay: calc(var(--i) * 70ms);
	}
	.principles p {
		margin: 4px 0 0;
		color: var(--ink-2);
		font-size: 0.92rem;
	}
	.ico {
		flex: none;
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		border-radius: 14px;
		background: var(--leaf-soft);
		color: var(--leaf);
		transform: rotate(-4deg);
	}
	.doors {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
		gap: 10px;
		margin-top: 14px;
	}
	.door {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 14px 16px;
		color: var(--ink);
		font: inherit;
		font-weight: 650;
		text-align: left;
		text-decoration: none;
		cursor: pointer;
		transition: transform 0.25s var(--ease-spring);
	}
	.door:hover {
		transform: translateY(-3px);
	}
	.door :global(svg) {
		color: var(--leaf);
	}
	.contact {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 22px;
	}
	.contact h2 {
		margin: 0 0 6px;
	}
	.contact p {
		margin: 0 0 6px;
		max-width: 60ch;
	}
	.small {
		font-size: 0.85rem;
	}
</style>
