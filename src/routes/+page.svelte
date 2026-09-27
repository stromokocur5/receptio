<script lang="ts">
	import { goto } from '$app/navigation';
	import { useCatalog } from '$lib/catalog';
	import Icon, { isIconName, type IconName } from '$lib/components/Icon.svelte';
	import PlateArt from '$lib/components/PlateArt.svelte';
	import RecipeCard from '$lib/components/RecipeCard.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import Squiggle from '$lib/components/Squiggle.svelte';
	import { pluralRecipes } from '$lib/labels';
	import { IN_MONTH, recipeSeason } from '$lib/season';
	import { likes } from '$lib/state.svelte';

	const catalog = useCatalog();

	let query = $state('');

	const heroRecipe = $derived(catalog.recipesById.get('zelene-kari-tofu') ?? catalog.recipes[0]);
	const featured = $derived(
		[...catalog.recipes]
			.sort(
				(a, b) =>
					(likes.counts[b.id] ?? 0) - (likes.counts[a.id] ?? 0) ||
					b.perServing.protein / b.costPerServing - a.perServing.protein / a.costPerServing
			)
			.slice(0, 8)
	);
	const month = new Date().getMonth() + 1;
	const seasonal = $derived(
		catalog.recipes
			.map((r) => ({ r, season: recipeSeason(r, catalog.ingredientsById, month) }))
			.filter((x) => x.season.inSeason)
			.sort((a, b) => b.season.produce.length - a.season.produce.length)
			.slice(0, 4)
			.map((x) => x.r)
	);
	const basics = $derived(catalog.wiki.filter((w) => w.section === 'zaklady').slice(0, 6));
	const cuisineCounts = $derived(
		new Map(
			catalog.cuisines.map((c) => [c.id, catalog.recipes.filter((r) => r.cuisine === c.id).length])
		)
	);

	const QUICK: { href: string; title: string; text: string; icon: IconName; tone: string }[] = [
		{
			href: '/spajza',
			title: 'Čo uvarím z toho, čo mám?',
			text: 'Nakliknem, čo mám doma, a appka zoradí recepty podľa zhody.',
			icon: 'jar',
			tone: 'var(--turmeric)'
		},
		{
			href: '/zvysky',
			title: 'Čo uvariť zo zvyškov',
			text: 'Pol cukety, ryža zo včera? Vyber, čo treba minúť, a nájde sa recept.',
			icon: 'jar',
			tone: 'var(--leaf-2)'
		},
		{
			href: '/pestuj',
			title: 'Pestuj si sám',
			text: 'Čo sa u nás oplatí pestovať a plánovač pre okno, balkón aj záhradu.',
			icon: 'sprout',
			tone: 'var(--leaf-2)'
		},
		{
			href: '/recepty?gf=1',
			title: 'Bezlepkovo',
			text: 'Lepok odvodený zo surovín vrátane zámen typu tamari.',
			icon: 'wheat-off',
			tone: 'var(--leaf-2)'
		},
		{
			href: '/recepty?sort=protein-eur',
			title: 'Najviac bielkovín za euro',
			text: 'Strukoviny a tofu zoradené podľa toho, koľko bielkovín dostaneš za peniaze.',
			icon: 'bean',
			tone: 'var(--tomato)'
		},
		{
			href: '/recepty?jedlo=domace',
			title: 'Urob si sám',
			text: 'Domáce tofu, tempeh, sójové mlieko, jogurt, tahini či arašidové maslo.',
			icon: 'cube',
			tone: 'var(--plum)'
		},
		{
			href: '/plan',
			title: 'Týždenný plán a nákup',
			text: 'Vyber recepty a dostaneš jeden nákupný zoznam bez vecí, ktoré máš doma.',
			icon: 'basket',
			tone: 'var(--sky)'
		}
	];

	function search(event: SubmitEvent) {
		event.preventDefault();
		void goto(`/recepty${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`);
	}
</script>

<Seo />

<section class="hero">
	<div class="wrap hero-grid">
		<div class="copy rise">
			<p class="eyebrow">Vegánske · bezlepkové · pre kamošov</p>
			<h1>
				Rastlinné jedlo,<br />ktoré <span class="hl">sedí<Squiggle width={130} /></span> telu aj peňaženke.
			</h1>
			<p class="lede">
				Recepty z celého sveta so živinami, cenou na porciu, upozorneniami na lepok a alergény,
				špajzou a nákupným zoznamom. Bez reklám a bez registrácie.
			</p>
			<form class="field search" onsubmit={search} role="search">
				<Icon name="search" size={20} />
				<label for="home-q" class="sr-only">Hľadať recept</label>
				<input id="home-q" bind:value={query} placeholder="cícer, kari, raňajky…" />
				<button class="btn leaf">Hľadať</button>
			</form>
			<div class="stats">
				<span
					><strong>{catalog.recipes.length}</strong> {pluralRecipes(catalog.recipes.length)}</span
				>
				<span><strong>{catalog.cuisines.length}</strong> kuchýň</span>
				<span><strong>{catalog.ingredients.length}</strong> surovín</span>
			</div>
		</div>
		<div class="hero-art plate-host" aria-hidden="true">
			<div class="blob"></div>
			{#if heroRecipe}
				<div class="big-plate">
					<PlateArt
						seed={heroRecipe.id}
						lines={heroRecipe.lines}
						byId={catalog.ingredientsById}
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

<section class="wrap quick">
	{#each QUICK as q, i (q.href)}
		<a class="quick-card card draw-host rise" href={q.href} style:--tone={q.tone} style:--i={i}>
			<span class="q-icon"><Icon name={q.icon} size={26} /></span>
			<h3>{q.title}</h3>
			<p>{q.text}</p>
			<span class="go"><Icon name="arrow-right" size={18} /></span>
		</a>
	{/each}
</section>

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

<section class="wrap block">
	<div class="head">
		<h2>Obľúbené a výhodné</h2>
		<a class="btn ghost small" href="/recepty"
			>Všetky recepty <Icon name="arrow-right" size={16} /></a
		>
	</div>
	<div class="grid">
		{#each featured as recipe, i (recipe.id)}
			<RecipeCard {recipe} index={i} />
		{/each}
	</div>
</section>

<section class="wrap block">
	<div class="head">
		<h2>Kuchyne sveta</h2>
		<a class="btn ghost small" href="/kuchyne">Všetky <Icon name="arrow-right" size={16} /></a>
	</div>
	<div class="cuisines">
		{#each catalog.cuisines as c (c.id)}
			<a class="cuisine-pill" href="/kuchyne/{c.id}" style:--c={c.color}>
				<span class="swatch"></span>
				{c.name}
				<span class="n">{cuisineCounts.get(c.id)}</span>
			</a>
		{/each}
	</div>
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
	<a class="b12 card draw-host" href="/wiki/b12">
		<span class="pill-ico"><Icon name="pill" size={30} /></span>
		<div>
			<strong>Nezabudni na B12.</strong>
			Je to jediný suplement, bez ktorého sa pri vegánskej strave nezaobídeš. Pozri aj D3, jód a omega-3.
		</div>
		<Icon name="arrow-right" size={20} />
	</a>
</section>

<style>
	.hero {
		padding: 36px 0 20px;
		overflow: hidden;
	}
	.hero-grid {
		display: grid;
		gap: 24px;
		align-items: center;
	}
	.hl {
		position: relative;
		display: inline-block;
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
		gap: 18px;
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

	.quick {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
		gap: 14px;
		margin-top: 18px;
	}
	.quick-card {
		position: relative;
		padding: 20px 20px 18px;
		text-decoration: none;
		color: inherit;
		transition:
			transform 0.3s var(--ease-spring),
			box-shadow 0.3s;
		animation-delay: calc(var(--i) * 70ms + 200ms);
	}
	.quick-card:hover {
		transform: translateY(-4px);
		box-shadow: var(--shadow-lift);
	}
	.q-icon {
		display: inline-grid;
		place-items: center;
		width: 48px;
		height: 48px;
		border-radius: 16px;
		background: color-mix(in srgb, var(--tone) 18%, transparent);
		color: var(--tone);
		margin-bottom: 12px;
		transform: rotate(-4deg);
	}
	.quick-card h3 {
		font-size: 1.12rem;
		margin-bottom: 0.3em;
	}
	.quick-card p {
		margin: 0;
		color: var(--ink-2);
		font-size: 0.92rem;
	}
	.go {
		position: absolute;
		top: 20px;
		right: 18px;
		color: var(--muted);
		transition: transform 0.3s var(--ease-spring);
	}
	.quick-card:hover .go {
		transform: translateX(4px);
		color: var(--ink);
	}

	.block {
		margin-top: 56px;
	}
	.season-note {
		margin: -6px 0 14px;
	}
	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
		flex-wrap: wrap;
		margin-bottom: 18px;
	}
	.head h2 {
		margin: 0;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: 18px;
	}

	.cuisines {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}
	.cuisine-pill {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 8px 14px 8px 8px;
		border-radius: 999px;
		background: var(--card);
		border: 1.5px solid var(--line);
		color: var(--ink);
		text-decoration: none;
		font-weight: 600;
		transition:
			transform 0.25s var(--ease-spring),
			border-color 0.2s;
	}
	.cuisine-pill:hover {
		transform: translateY(-2px) rotate(-1deg);
		border-color: var(--c);
	}
	.swatch {
		width: 22px;
		height: 22px;
		border-radius: 45% 55% 50% 50%;
		background: var(--c);
	}
	.n {
		font-size: 0.78rem;
		color: var(--muted);
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

	@media (min-width: 860px) {
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
</style>
