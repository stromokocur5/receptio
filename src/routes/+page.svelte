<script lang="ts">
	import { goto } from '$app/navigation';
	import { useCatalog } from '$lib/catalog';
	import CategoryTiles from '$lib/components/CategoryTiles.svelte';
	import Icon, { isIconName, type IconName } from '$lib/components/Icon.svelte';
	import PlateArt from '$lib/components/PlateArt.svelte';
	import { vesselFor } from '$lib/categories';
	import RecipeCard from '$lib/components/RecipeCard.svelte';
	import TodayPicker from '$lib/components/TodayPicker.svelte';
	import IngredientExcluder from '$lib/components/IngredientExcluder.svelte';
	import { avoidFilter } from '$lib/avoid';
	import { rankByLeftovers } from '$lib/pantry';
	import Seo from '$lib/components/Seo.svelte';
	import { SITE_ORIGIN } from '$lib/site';
	import { websiteJsonLd } from '$lib/structured-data';
	import Squiggle from '$lib/components/Squiggle.svelte';
	import { pluralRecipes } from '$lib/labels';
	import { IN_MONTH, recipeSeason } from '$lib/season';
	import { bedPlants, localizeGuide, monthTasks, seasonDelayWeeks } from '$lib/garden';
	import { install } from '$lib/install.svelte';
	import InstallCard from '$lib/components/InstallCard.svelte';
	import { onboarding } from '$lib/onboarding.svelte';
	import { avoid, favorites, gardens, pantry, plan, settings, ui } from '$lib/state.svelte';
	import type { GrowGuide } from '$lib/types';
	import { activeSales, recipesOnSale } from '$lib/pricing';

	const catalog = useCatalog();
	const categoryCounts = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const r of catalog.recipes) {
			for (const top of new Set(r.categories.map((path) => path.split('/')[0]))) {
				counts.set(top, (counts.get(top) ?? 0) + 1);
			}
		}
		return counts;
	});

	let query = $state('');

	/** "What do I have?" without filling in the pantry: pick a few things, see recipes right away. */
	let haveIds = $state<string[]>([]);
	const haveMatches = $derived(
		haveIds.length
			? rankByLeftovers(
					ui.loaded
						? catalog.recipes.filter(avoidFilter(avoid.current, catalog.ingredientsById))
						: catalog.recipes,
					haveIds,
					catalog.ingredientsById
				).slice(0, 4)
			: []
	);

	/** Grandma's classics shown on the home page, in this order when they exist. */
	const HOME_CLASSICS = [
		'halusky-kesu-bryndza',
		'kapustnica',
		'lokse',
		'segedin',
		'parene-buchty',
		'kysla-sosovica',
		'strapacky-s-kapustou',
		'langos'
	];
	const classics = $derived(
		HOME_CLASSICS.flatMap((id) => catalog.recipesById.get(id) ?? []).slice(0, 4)
	);
	const slovakCount = $derived(catalog.recipes.filter((r) => r.cuisine === 'slovenska').length);

	const heroRecipe = $derived(catalog.recipesById.get('zelene-kari-tofu') ?? catalog.recipes[0]);
	const month = new Date().getMonth() + 1;

	/** Reminder for people with a saved garden; calendars load only then. */
	let growGuides = $state<GrowGuide[]>([]);
	$effect(() => {
		if (!ui.loaded || !gardens.current.length || growGuides.length) return;
		fetch('/pestuj/plodiny.json')
			.then((r) => (r.ok ? (r.json() as Promise<GrowGuide[]>) : []))
			.then((g: GrowGuide[]) => (growGuides = g))
			.catch(() => {});
	});
	const localGuides = $derived(
		growGuides.map((g) =>
			localizeGuide(g, seasonDelayWeeks(settings.current.location?.elevation ?? 150))
		)
	);
	/** What is left to do this month in any of the gardens, each task once. */
	const gardenTasks = $derived.by(() => {
		if (!growGuides.length) return [];
		const open = gardens.current.flatMap((g) => {
			const plants = [...g.plants, ...g.beds.flatMap((b) => bedPlants(b, localGuides))];
			return monthTasks(
				[...new Map(plants.map((p) => [p.ingredientId, p])).values()],
				localGuides,
				g.done,
				new Date().getFullYear(),
				month
			).filter((t) => !g.done[t.key]);
		});
		return [...new Map(open.map((t) => [t.key, t])).values()];
	});
	/** Recipes whose main ingredients are on sale in the user's shops right now. */
	const onSale = $derived.by(() => {
		// Before the settings load, the user's shops aren't known yet: no list rather than a wrong one.
		if (!ui.loaded) return [];
		const mine = settings.current.myStores;
		const deals = activeSales(catalog.prices, new Date()).filter(
			(d) => !mine.length || mine.includes(d.entry.storeId)
		);
		return recipesOnSale(
			catalog.recipes.filter((r) => r.treat.length === 0),
			deals
		).slice(0, 4);
	});
	const seasonal = $derived(
		catalog.recipes
			.map((r) => ({ r, season: recipeSeason(r, catalog.ingredientsById, month) }))
			.filter((x) => x.season.inSeason)
			.sort((a, b) => b.season.produce.length - a.season.produce.length)
			.slice(0, 4)
			.map((x) => x.r)
	);
	const basics = $derived(catalog.wiki.filter((w) => w.section === 'zaklady').slice(0, 6));

	/** The four things Receptio does, each with its main door and a couple of side doors. */
	const PILLARS: {
		title: string;
		text: string;
		icon: IconName;
		tone: string;
		href: string;
		cta: string;
		more: { href: string; label: string }[];
	}[] = [
		{
			title: 'Nájdi, čo uvariť',
			text: `Stovky receptov z ${catalog.cuisines.length} kuchýň – od babkiných klasík po street food zo sveta. Pri každom vidíš cenu porcie, bielkoviny aj alergény.`,
			icon: 'bowl',
			tone: 'var(--tomato)',
			href: '/recepty',
			cta: 'Recepty',
			more: [
				{ href: '/recepty?gf=1', label: 'Bezlepkové' },
				{ href: '/recepty?sort=protein-eur', label: 'Najviac bielkovín za euro' },
				{ href: '/recepty?kategoria=domace', label: 'Urob si doma' }
			]
		},
		{
			title: 'Naplánuj týždeň a nakúp',
			text: 'Vyber recepty alebo si nechaj plán navrhnúť. Dostaneš jeden nákupný zoznam s cenami, bez toho, čo máš doma.',
			icon: 'calendar',
			tone: 'var(--sky)',
			href: '/plan',
			cta: 'Plán a nákup',
			more: [
				{ href: '/plan#navrh', label: 'Navrhni mi týždeň' },
				{ href: '/ceny', label: 'Ceny v obchodoch' }
			]
		},
		{
			title: 'Var z toho, čo máš',
			text: 'Naklikaj, čo máš v špajzi, a recepty sa zoradia podľa zhody. Po uvarení sa suroviny samy odpočítajú.',
			icon: 'jar',
			tone: 'var(--turmeric)',
			href: '/spajza',
			cta: 'Špajza',
			more: [
				{ href: '/zvysky', label: 'Zo zvyškov' },
				{ href: '/sezona', label: 'Čo je v sezóne' }
			]
		},
		{
			title: 'Dopestuj si to',
			text: 'Čo sa u nás oplatí pestovať a plánovač pre okno, balkón aj záhradu – s kalendárom prác a zápisom úrody.',
			icon: 'sprout',
			tone: 'var(--leaf-2)',
			href: '/pestuj',
			cta: 'Pestuj',
			more: [{ href: '/wiki/ako-zacat-pestovat', label: 'Ako začať' }]
		}
	];

	const VALUES: { icon: IconName; title: string; text: string }[] = [
		{
			icon: 'shield',
			title: 'Bez reklám a sledovania',
			text: 'Žiadne pop-upy, cookies na reklamu ani konto. Tvoje dáta ostávajú v tvojom telefóne.'
		},
		{
			icon: 'scale',
			title: 'Čísla sa počítajú, nie odhadujú',
			text: 'Živiny, cena aj lepok vychádzajú zo surovín receptu. Kde je cena len odhad, je to napísané.'
		},
		{
			icon: 'euro',
			title: 'Lacno a zdravo',
			text: 'Uvidíš, koľko stojí porcia a či máš dosť bielkovín, železa a vápnika.'
		},
		{
			icon: 'users',
			title: 'Pre každého, zadarmo',
			text: 'Nekomerčný projekt. Recept môže navrhnúť ktokoľvek.'
		}
	];

	/** Where a returning visitor left off. */
	const inPlan = $derived(ui.loaded ? plan.current.length : 0);
	const inPantry = $derived(ui.loaded ? Object.keys(pantry.current).length : 0);
	const favCount = $derived(ui.loaded ? Object.keys(favorites.current).length : 0);

	function search(event: SubmitEvent) {
		event.preventDefault();
		void goto(`/recepty${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`);
	}
</script>

<Seo
	description="Vegánske recepty z celého sveta, pri ktorých hneď vidíš, koľko ťa porcia vyjde a či ťa zasýti. Naplánuj si týždeň, nakúp naraz a var z toho, čo máš doma."
	jsonLd={[websiteJsonLd(SITE_ORIGIN)]}
/>

<section class="hero">
	<div class="wrap hero-grid">
		<div class="copy rise">
			<p class="eyebrow">Vegánske · aj bez lepku · zadarmo</p>
			<h1>
				Rastlinné jedlo,<br />ktoré <span class="hl">sedí<Squiggle width={130} /></span> telu aj peňaženke.
			</h1>
			<p class="lede">
				Jedlá z celého sveta, pri ktorých hneď vidíš, koľko ťa porcia vyjde, či ťa zasýti a či je v
				nich lepok. Bez reklám, bez registrácie – len dobré jedlo.
			</p>
			<form class="field search" onsubmit={search} role="search">
				<Icon name="search" size={20} />
				<label for="home-q" class="sr-only">Hľadať recept</label>
				<input id="home-q" bind:value={query} placeholder="cícer, kari, raňajky…" />
				<button class="btn leaf">Hľadať</button>
			</form>
			<nav class="chips quick-start" aria-label="Rýchly štart">
				<a class="chip" href="/recepty?cas=20"><Icon name="clock" size={16} /> Do 20 minút</a>
				<a class="chip" href="#co-mam-doma"><Icon name="jar" size={16} /> Z toho, čo mám</a>
				<a class="chip" href="/plan?rozpocet=20#navrh"
					><Icon name="calendar" size={16} /> Týždeň do 20 €</a
				>
				<a class="chip" href="/recepty?chut=sladke"><Icon name="cake" size={16} /> Niečo sladké</a>
			</nav>
			<div class="stats">
				<span
					><strong>{catalog.recipes.length}</strong> {pluralRecipes(catalog.recipes.length)}</span
				>
				<span><strong>{catalog.cuisines.length}</strong> kuchýň</span>
				<span><strong>{catalog.ingredients.length}</strong> surovín</span>
			</div>
			<p class="hero-links">
				<button class="btn-link" onclick={() => (onboarding.open = true)}
					><Icon name="play" size={16} /> Ako to funguje</button
				>
				<a href="/o-projekte"><Icon name="sprout" size={16} /> Prečo Receptio vzniklo</a>
			</p>
		</div>
		<div class="hero-art plate-host" aria-hidden="true">
			<div class="blob"></div>
			{#if heroRecipe}
				<div class="big-plate">
					<PlateArt
						seed={heroRecipe.id}
						lines={heroRecipe.lines}
						byId={catalog.ingredientsById}
						vessel={vesselFor(heroRecipe.categories)}
						detail
						steam
					/>
				</div>
			{/if}
			<svg class="float f1" viewBox="0 0 40 40"
				><path d="M8 32C6 18 14 8 34 6c1 16-9 26-26 26Z" fill="var(--leaf-2)" /><path
					d="M8 32c6-8 12-14 22-22"
					stroke="var(--paper)"
					stroke-width="1.6"
					fill="none"
					stroke-linecap="round"
				/></svg
			>
			<svg class="float f2" viewBox="0 0 40 40"
				><circle cx="20" cy="20" r="14" fill="var(--tomato)" /><path
					d="M20 8c-2-3 1-5 3-4"
					stroke="var(--leaf)"
					stroke-width="2.5"
					fill="none"
					stroke-linecap="round"
				/><ellipse cx="15" cy="15" rx="4" ry="2.5" fill="#fff" opacity=".35" /></svg
			>
			<svg class="float f3" viewBox="0 0 40 40"
				><path d="M10 26c-2-10 6-18 14-16s10 12 4 18-16 6-18-2Z" fill="var(--turmeric)" /><path
					d="M16 20c3-2 7-2 9 1"
					stroke="var(--paper)"
					stroke-width="1.6"
					fill="none"
					stroke-linecap="round"
				/></svg
			>
			<svg class="float f4" viewBox="0 0 40 40"
				><ellipse cx="20" cy="20" rx="9" ry="13" transform="rotate(35 20 20)" fill="#c9a063" /><path
					d="M16 14c2 4 5 9 8 12"
					stroke="rgba(0,0,0,.18)"
					stroke-width="1.6"
					fill="none"
					stroke-linecap="round"
				/></svg
			>
		</div>
	</div>
</section>

{#if inPlan || inPantry || favCount}
	<section class="wrap continue" aria-label="Pokračuj">
		{#if inPlan}
			<a class="card cont accent-edge" href="/plan" style:--accent="var(--sky)">
				<Icon name="calendar" size={22} />
				<span
					><strong>{inPlan} {pluralRecipes(inPlan)} v pláne</strong><small
						>Pozri nákupný zoznam</small
					></span
				>
			</a>
		{/if}
		{#if inPantry}
			<a class="card cont accent-edge" href="/recepty?sort=spajza" style:--accent="var(--turmeric)">
				<Icon name="jar" size={22} />
				<span><strong>Čo uvarím zo špajze</strong><small>{inPantry} surovín doma</small></span>
			</a>
		{/if}
		{#if favCount}
			<a class="card cont accent-edge" href="/moje" style:--accent="var(--plum)">
				<Icon name="bookmark" size={22} />
				<span><strong>Uložené</strong><small>{favCount} {pluralRecipes(favCount)}</small></span>
			</a>
		{/if}
	</section>
{/if}

{#if install.offer}
	<section class="wrap install-wrap">
		<InstallCard />
	</section>
{/if}

<TodayPicker />

<section class="wrap block" id="co-mam-doma">
	<div class="have card">
		<div class="have-copy">
			<p class="eyebrow">Bez vypĺňania špajze</p>
			<h2>Čo máš doma?</h2>
			<p>Napíš dve-tri veci z chladničky a hneď uvidíš, čo z nich uvaríš.</p>
		</div>
		<div class="have-pick">
			<IngredientExcluder
				selected={haveIds}
				onchange={(ids) => (haveIds = ids.slice(0, 5))}
				prefix=""
				placeholder="cícer, špenát, ryža…"
				fieldLabel="Surovina, ktorú máš doma"
				hint="Stačia aj zvyšky – pol cukety, ryža zo včera."
			/>
		</div>
	</div>
	{#if haveIds.length}
		<div class="grid have-results" aria-live="polite">
			{#each haveMatches as m, i (m.recipe.id)}
				<RecipeCard recipe={m.recipe} index={i} />
			{/each}
		</div>
		{#if haveMatches.length}
			<a class="btn ghost small more-have" href="/zvysky?s={haveIds.join(',')}"
				>Viac receptov a čo ešte treba <Icon name="arrow-right" size={16} /></a
			>
		{:else}
			<p class="muted">Z tohto tu zatiaľ recept nie je. Skús pridať ešte niečo.</p>
		{/if}
	{/if}
</section>

<section class="wrap block">
	<div class="head">
		<h2>Na čo máš chuť?</h2>
		<a class="btn ghost small" href="/recepty"
			>Všetky recepty <Icon name="arrow-right" size={16} /></a
		>
	</div>
	<CategoryTiles counts={categoryCounts} />
</section>

<section class="wrap block pillars-block">
	<div class="head">
		<h2>Čo tu môžeš robiť</h2>
	</div>
	<div class="pillars">
		{#each PILLARS as p, i (p.href)}
			<article class="card pillar rise" style:--tone={p.tone} style:--i={i}>
				<span class="p-icon"><Icon name={p.icon} size={28} draw /></span>
				<h3>{p.title}</h3>
				<p>{p.text}</p>
				<div class="p-links">
					<a class="btn small p-main" href={p.href}>{p.cta} <Icon name="arrow-right" size={16} /></a
					>
					{#each p.more as m (m.href)}<a class="p-more" href={m.href}>{m.label}</a>{/each}
				</div>
			</article>
		{/each}
	</div>
</section>

{#if gardenTasks.length}
	<section class="wrap block">
		<a class="card garden-note accent-edge" href="/pestuj#moja-zahradka">
			<Icon name="sprout" size={26} />
			<span>
				<strong>Záhradka {IN_MONTH[month - 1]}</strong>
				<span>
					{#each ['indoor', 'sow', 'harvest'] as const as kind (kind)}
						{@const names = gardenTasks.filter((t) => t.kind === kind).map((t) => t.name)}
						{#if names.length}
							<span class="gn-line"
								>{kind === 'indoor'
									? 'Predpestuj doma'
									: kind === 'sow'
										? 'Zasej alebo vysaď von'
										: 'Zbieraj'}: {names.slice(0, 8).join(', ')}{names.length > 8
									? ` a ďalšie (${names.length - 8})`
									: ''}</span
							>
						{/if}
					{/each}
				</span>
			</span>
			<Icon name="arrow-right" size={18} />
		</a>
	</section>
{/if}

{#if seasonal.length}
	<section class="wrap block">
		<div class="head">
			<h2>Teraz v sezóne</h2>
			<a class="btn ghost small" href="/sezona"
				>Sezónny kalendár <Icon name="arrow-right" size={16} /></a
			>
		</div>
		<p class="muted season-note">
			Zelenina, ktorá sa na Slovensku práve zbiera {IN_MONTH[month - 1]} – najchutnejšia a najlacnejšia.
		</p>
		<div class="grid">
			{#each seasonal as recipe, i (recipe.id)}
				<RecipeCard {recipe} index={i} />
			{/each}
		</div>
	</section>
{/if}

{#if onSale.length}
	<section class="wrap block">
		<div class="head">
			<h2>Lacnejšie vďaka akciám</h2>
			<a class="btn ghost small" href="/ceny#akcie"
				>Všetky akcie <Icon name="arrow-right" size={16} /></a
			>
		</div>
		<p class="muted season-note">
			Hlavné suroviny týchto receptov sú teraz v akcii:
			{[...new Set(onSale.flatMap((s) => s.onSale))]
				.map((id) => catalog.ingredientsById.get(id)?.name.split(' (')[0].toLowerCase())
				.join(', ')}.
		</p>
		<div class="grid">
			{#each onSale as { recipe }, i (recipe.id)}
				<RecipeCard {recipe} index={i} />
			{/each}
		</div>
	</section>
{/if}

<section class="wrap block roots">
	<div class="roots-copy">
		<p class="eyebrow">Od babky aj zo sveta</p>
		<h2>Kapustnica ako na Štedrý deň. Kebab ako o druhej v noci. Kari ako v Kérale.</h2>
		<p>
			Nemusíš si vyberať medzi chuťami z detstva a tým, čo ťa zlákalo na cestách. Halušky s
			bryndzou, lokše s lekvárom, segedín, parené buchty – {slovakCount} slovenských klasík urobených
			rastlinne tak, že rozdiel spoznáš len podľa toho, že ti po nich nie je ťažko.
		</p>
		<p>
			A keď zatúžiš po niečom inom, máš tu {catalog.cuisines.length} kuchýň sveta: etiópsku injeru, mexické
			tacos, kórejský bibimbap, japonské ramen či turecký lahmacun. Každý deň iná krajina, stále ten istý
			nákup.
		</p>
	</div>
	{#if classics.length}
		<div class="grid">
			{#each classics as recipe, i (recipe.id)}
				<RecipeCard {recipe} index={i} />
			{/each}
		</div>
	{/if}
	<p class="roots-more">
		<a class="btn ghost small" href="/kuchyne"
			>Všetkých {catalog.cuisines.length} kuchýň <Icon name="arrow-right" size={16} /></a
		>
	</p>
</section>

<section class="wrap block">
	<div class="basics card">
		<div class="basics-copy">
			<p class="eyebrow">Začínaš s varením?</p>
			<h2>Základy krok po kroku</h2>
			<p>
				Ako uvariť ryžu, aby nebola kaša, ako na strukoviny, aby nenafukovali, a prečo tofu nie je
				mdlé. Každý recept na tieto návody odkazuje sám.
			</p>
		</div>
		<div class="basics-list">
			{#each basics as b (b.slug)}
				<a href="/wiki/{b.slug}" class="basic draw-host">
					<Icon name={isIconName(b.icon) ? b.icon : 'leaf'} size={22} />
					<span>{b.title}</span>
				</a>
			{/each}
		</div>
	</div>
</section>

<section class="wrap block">
	<div class="story">
		<div class="story-copy">
			<p class="eyebrow">Prečo Receptio vzniklo</p>
			<h2>Z domácej potreby</h2>
			<p>
				Receptio vzniklo pre mňa a kamarátov. Chýbali dobré rastlinné a bezlepkové recepty po
				slovensky, pri ktorých by bolo jasné, koľko bielkovín či železa v nich je a koľko stojí
				porcia. Weby s receptami boli plné reklám a vyskakovacích okien, čísla na nich chýbali.
			</p>

			<a class="btn ghost small" href="/o-projekte"
				>Viac o projekte <Icon name="arrow-right" size={16} /></a
			>
		</div>
		<ul class="values">
			{#each VALUES as v, i (v.title)}
				<li class="card rise" style:--i={i}>
					<span class="v-icon"><Icon name={v.icon} size={22} /></span>
					<strong>{v.title}</strong>
					<p>{v.text}</p>
				</li>
			{/each}
		</ul>
	</div>
</section>

<section class="wrap block">
	<a class="b12 card draw-host" href="/wiki/b12">
		<span class="pill-ico"><Icon name="pill" size={30} /></span>
		<div>
			<strong>Nezabudni na B12.</strong>
			Je to jediný suplement, bez ktorého sa pri vegánskej strave nezaobídeš. Pozri aj D3, jód a omega-3.
		</div>
		<Icon name="arrow-right" size={20} />
	</a>
</section>

<section class="wrap block">
	<div class="cta-final card">
		<div>
			<h2>Máš recept, ktorý tu chýba?</h2>
			<p>Pošli ho. Skontrolujem ho, dopočítam živiny aj cenu a pridám ho pre všetkých.</p>
		</div>
		<a class="btn leaf" href="/navrhni"><Icon name="send" size={18} /> Navrhni recept</a>
	</div>
</section>

<style>
	.garden-note {
		display: grid;
		grid-template-columns: auto 1fr auto;
		gap: 14px;
		align-items: center;
		padding: 16px 18px;
		color: var(--ink);
		text-decoration: none;
		--accent: var(--leaf-2);
	}
	.garden-note strong {
		display: block;
		font-family: var(--font-display);
		font-size: 1.1rem;
	}
	.gn-line {
		display: block;
		color: var(--ink-2);
		font-size: 0.92rem;
	}
	.hero {
		padding: 36px 0 20px;
		overflow: hidden;
	}
	.hero-grid {
		display: grid;
		gap: 24px;
		align-items: center;
	}
	/* The italic's last letter leans past its box; the padding keeps it off the next word. */
	.hl {
		position: relative;
		display: inline-block;
		padding-right: 0.08em;
		color: var(--leaf);
		font-style: italic;
	}
	.hl :global(.squiggle) {
		position: absolute;
		left: 0;
		right: 0;
		bottom: -6px;
		width: 100%;
	}
	.lede {
		font-size: 1.1rem;
		color: var(--ink-2);
		max-width: 36em;
	}
	.search {
		max-width: 520px;
		margin: 22px 0 16px;
		padding-right: 5px;
	}
	.stats {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 18px;
		color: var(--muted);
		font-size: 0.92rem;
	}
	.stats strong {
		color: var(--ink);
		font-family: var(--font-display);
		font-size: 1.2rem;
	}
	.hero-art {
		position: relative;
		width: min(100%, 440px);
		justify-self: center;
		aspect-ratio: 1;
	}
	.blob {
		position: absolute;
		inset: 4%;
		border-radius: 42% 58% 55% 45% / 48% 42% 58% 52%;
		background: radial-gradient(circle at 30% 30%, var(--turmeric-soft), var(--leaf-soft));
		animation: morph 14s ease-in-out infinite alternate;
	}
	@keyframes morph {
		50% {
			border-radius: 58% 42% 45% 55% / 42% 58% 42% 58%;
			transform: rotate(8deg);
		}
		100% {
			border-radius: 45% 55% 60% 40% / 55% 45% 55% 45%;
			transform: rotate(-6deg);
		}
	}
	.big-plate {
		position: absolute;
		inset: 12%;
		animation: rise 0.9s var(--ease-out) both;
	}
	.float {
		position: absolute;
		width: 13%;
		animation: bob 6s ease-in-out infinite;
		filter: drop-shadow(0 6px 8px rgba(60, 40, 10, 0.18));
	}
	.f1 {
		top: 4%;
		left: 8%;
	}
	.f2 {
		top: 10%;
		right: 4%;
		animation-delay: -1.5s;
	}
	.f3 {
		bottom: 6%;
		left: 2%;
		animation-delay: -3s;
	}
	.f4 {
		bottom: 2%;
		right: 14%;
		animation-delay: -4.5s;
	}
	@keyframes bob {
		50% {
			transform: translateY(-12px) rotate(10deg);
		}
	}

	.hero-links {
		display: flex;
		flex-wrap: wrap;
		gap: 8px 18px;
		margin: 14px 0 0;
		font-size: 0.92rem;
		font-weight: 650;
	}
	.hero-links a,
	.hero-links .btn-link {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: var(--tap);
	}

	.install-wrap {
		margin-top: 16px;
	}
	.continue {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
		gap: 10px;
		margin-top: 8px;
	}
	.cont {
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
		padding: 12px 14px;
		color: var(--ink);
		line-height: 1.3;
		text-decoration: none;
		transition: transform 0.25s var(--ease-spring);
	}
	.cont:hover {
		transform: translateY(-2px);
	}
	.cont :global(svg) {
		color: var(--accent);
		flex: none;
	}
	.cont span {
		display: grid;
		text-wrap: balance;
	}
	.cont small {
		color: var(--ink-2);
	}

	.pillars {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
		gap: 14px;
	}
	.pillar {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 20px;
		animation-delay: calc(var(--i) * 80ms + 150ms);
		/* A stripe along the top; a border would bend with the rounded corners. */
		box-shadow:
			inset 0 4px 0 var(--tone),
			var(--shadow);
		transition:
			transform 0.3s var(--ease-spring),
			box-shadow 0.3s;
	}
	.pillar:hover {
		transform: translateY(-4px);
		box-shadow:
			inset 0 4px 0 var(--tone),
			var(--shadow-lift);
	}
	.p-icon {
		display: grid;
		place-items: center;
		width: 52px;
		height: 52px;
		border-radius: var(--radius-sm);
		background: color-mix(in srgb, var(--tone) 18%, transparent);
		color: color-mix(in srgb, var(--tone) 80%, var(--ink));
		transform: rotate(-4deg);
		transition: transform 0.35s var(--ease-spring);
	}
	.pillar:hover .p-icon {
		transform: rotate(4deg) scale(1.06);
	}
	.pillar h3 {
		margin: 4px 0 0;
		font-size: 1.2rem;
	}
	.pillar p {
		margin: 0;
		color: var(--ink-2);
		font-size: 0.93rem;
	}
	.p-links {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 12px;
		margin-top: auto;
		padding-top: 8px;
	}
	.p-main {
		background: color-mix(in srgb, var(--tone) 20%, var(--card));
		color: var(--ink);
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.p-more {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--ink-2);
	}

	.story {
		display: grid;
		gap: 22px;
	}
	.story-copy h2 {
		margin: 4px 0 10px;
	}
	.story-copy p {
		color: var(--ink-2);
		max-width: 60ch;
	}
	.values {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
		gap: 12px;
	}
	.values li {
		display: grid;
		gap: 6px;
		align-content: start;
		padding: 16px;
		animation-delay: calc(var(--i) * 80ms + 100ms);
	}
	.v-icon {
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border-radius: var(--radius-sm);
		background: var(--leaf-soft);
		color: var(--leaf);
	}
	.values p {
		margin: 0;
		font-size: 0.88rem;
		color: var(--ink-2);
	}

	.cta-final {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 24px;
		background:
			radial-gradient(circle at 90% 20%, var(--turmeric-soft), transparent 50%), var(--leaf-soft);
	}
	.cta-final h2 {
		margin: 0 0 4px;
	}
	.cta-final p {
		margin: 0;
		color: var(--ink-2);
	}

	.block {
		margin-top: 56px;
	}
	.season-note {
		margin: -6px 0 14px;
	}
	/* Title left, its "all" link right, on one line even on a phone. */
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 18px;
	}
	.head h2 {
		min-width: 0;
		margin: 0;
	}
	.head .btn {
		flex: none;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: 18px;
	}

	.have {
		display: grid;
		gap: 16px;
		padding: 20px;
		background: color-mix(in srgb, var(--turmeric) 10%, var(--card));
	}
	.have h2 {
		margin: 0 0 4px;
	}
	.have-copy p:last-child {
		margin: 0;
		color: var(--ink-2);
	}
	.have-results {
		margin-top: 18px;
	}
	.more-have {
		margin-top: 14px;
	}
	@media (min-width: 800px) {
		.have {
			grid-template-columns: 1fr 1.2fr;
			align-items: center;
			padding: 24px 28px;
		}
	}
	.roots-copy {
		max-width: 46em;
		margin-bottom: 20px;
	}
	.roots-copy h2 {
		font-size: clamp(1.5rem, 3.4vw, 2.2rem);
		line-height: 1.15;
		margin: 0 0 12px;
	}
	.roots-copy p:not(.eyebrow) {
		color: var(--ink-2);
		font-size: 1.05rem;
	}
	.roots-more {
		margin: 20px 0 0;
	}

	.basics {
		display: grid;
		gap: 20px;
		padding: 26px;
		background: radial-gradient(circle at 100% 0%, var(--leaf-soft), transparent 55%), var(--card);
	}
	.basics-copy p:last-child {
		margin: 0;
		color: var(--ink-2);
	}
	.basics-list {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 10px;
	}
	.basic {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px 14px;
		border-radius: var(--radius-sm);
		background: var(--paper);
		color: var(--ink);
		text-decoration: none;
		font-weight: 600;
		transition: transform 0.25s var(--ease-spring);
	}
	.basic:hover {
		transform: translateX(4px);
	}
	.basic :global(.icon) {
		color: var(--leaf);
	}

	.b12 {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 18px 22px;
		text-decoration: none;
		color: var(--ink);
		background: var(--sky-soft);
		border: 0;
	}
	.pill-ico {
		color: var(--sky);
		animation: wiggle 4s ease-in-out infinite;
	}
	@keyframes wiggle {
		0%,
		90%,
		100% {
			transform: rotate(0);
		}
		93% {
			transform: rotate(-12deg);
		}
		96% {
			transform: rotate(10deg);
		}
	}
	.b12 div {
		flex: 1;
	}

	@media (max-width: 859px) {
		/* Decoration only: on a phone it shouldn't push everything a screen further down. */
		.hero-art {
			width: min(56%, 240px);
		}
	}
	@media (max-width: 600px) {
		.block {
			margin-top: 40px;
		}
		/* Three cards make two rows; the odd one takes the whole second row. */
		.cont:last-child:nth-child(odd) {
			grid-column: 1 / -1;
		}
	}
	@media (min-width: 860px) {
		.story {
			grid-template-columns: 1fr 1.2fr;
			align-items: center;
		}
		.hero {
			padding: 56px 0 30px;
		}
		.hero-grid {
			grid-template-columns: 1.15fr 1fr;
		}
		.basics {
			grid-template-columns: 1fr 1.3fr;
			align-items: center;
			padding: 36px;
		}
	}
	.quick-start {
		margin: 14px 0 18px;
	}
	.quick-start .chip {
		color: var(--ink);
	}
</style>
