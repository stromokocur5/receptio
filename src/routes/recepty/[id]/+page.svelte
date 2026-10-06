<script lang="ts">
	import { afterNavigate, pushState } from '$app/navigation';
	import { page } from '$app/state';
	import { formatAmount, formatEur, formatNumber, formatPiece } from '$lib/amounts';
	import {
		RECIPE_CATEGORIES,
		SPICY_LABELS,
		splitCategory,
		subLabel,
		vesselFor
	} from '$lib/categories';
	import { scaleStep, stepGuides, stepLines } from '$lib/cooking';
	import { flyToPlan } from '$lib/fly';
	import CookMode from '$lib/components/CookMode.svelte';
	import { useCatalog } from '$lib/catalog';
	import GlutenBadge from '$lib/components/GlutenBadge.svelte';
	import Icon, { isIconName } from '$lib/components/Icon.svelte';
	import LikeButton from '$lib/components/LikeButton.svelte';
	import CollectionChips from '$lib/components/CollectionChips.svelte';
	import NutrientBars from '$lib/components/NutrientBars.svelte';
	import PlateArt from '$lib/components/PlateArt.svelte';
	import RecipeCard from '$lib/components/RecipeCard.svelte';
	import RecipeFeedback from '$lib/components/RecipeFeedback.svelte';
	import CookedBadge from '$lib/components/CookedBadge.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import {
		ALLERGEN_LABELS,
		COMPUTED_TAG_LABELS,
		DAILY_REFERENCE,
		SALT_HIGH_G,
		VEGAN_PROTEIN_G_PER_KG,
		computedTags,
		scaleNutrients,
		treatText
	} from '$lib/nutrition';
	import { isAssumedAtHome, matchRecipe, pantryByGroup, TAP_WATER_ID } from '$lib/pantry';
	import { bestPrice, shelfCost } from '$lib/pricing';
	import { IN_MONTH, recipeSeason } from '$lib/season';
	import { SITE_ORIGIN } from '$lib/site';
	import {
		addToPlan,
		favorites,
		history,
		journal,
		likes,
		logPortion,
		LIST_SEARCH_KEY,
		notes,
		pantry,
		preserves,
		RATING_LABELS,
		servingsInPlan,
		setNote,
		settings,
		toggleFavorite,
		ui
	} from '$lib/state.svelte';
	import { breadcrumbJsonLd, recipeJsonLd } from '$lib/structured-data';
	import { jarsFromYield } from '$lib/preserves';
	import { shortName } from '$lib/avoid';

	let { data } = $props();
	const catalog = useCatalog();

	const base = $derived(data.recipe);

	/** Back to the list with the filters it had; a real Back also restores scroll and paging. */
	let listHref = $state('/recepty');
	let cameFromList = false;
	afterNavigate(({ from }) => {
		cameFromList = from?.url.pathname === '/recepty';
		try {
			const search = sessionStorage.getItem(LIST_SEARCH_KEY);
			listHref = search ? `/recepty?${search}` : '/recepty';
		} catch {
			listHref = '/recepty';
		}
	});
	function backToList(event: MouseEvent) {
		if (!cameFromList || event.metaKey || event.ctrlKey || event.shiftKey) return;
		event.preventDefault();
		window.history.back();
	}

	let variantName = $state<string | null>(null);
	const variant = $derived(
		variantName ? base.variants.find((v) => v.name === variantName) : undefined
	);
	/** The recipe as currently shown: variant data (lines, nutrition, cost…) over the base recipe. */
	const recipe = $derived.by(() => {
		if (!variant) return base;
		const { name: _name, description: _description, ahead, ...computed } = variant;
		return { ...base, ...computed, ahead: ahead === undefined ? base.ahead : (ahead ?? undefined) };
	});
	$effect.pre(() => {
		void base.id;
		variantName = null;
	});
	const cuisine = $derived(catalog.cuisinesById.get(recipe.cuisine));
	/**
	 * Calcium and B12 of soy drink and yogurt are what the producer adds. Homemade and plain ones
	 * have next to none, so the numbers need that said when they lean on it.
	 */
	const fortified = $derived.by(() => {
		const lines = recipe.lines.flatMap((line) => {
			const ingredient = catalog.ingredientsById.get(line.ingredientId);
			return ingredient && ingredient.per100g.b12 > 0 && !line.notEaten
				? [{ ingredient, grams: line.grams / recipe.servings }]
				: [];
		});
		const calcium = lines.reduce(
			(sum, l) => sum + (l.ingredient.per100g.calcium * l.grams) / 100,
			0
		);
		const b12 = lines.reduce((sum, l) => sum + (l.ingredient.per100g.b12 * l.grams) / 100, 0);
		if (calcium < 50 && b12 < 0.2) return undefined;
		return {
			names: lines.map((l) => l.ingredient.name),
			calcium: Math.round((calcium * 0.8) / 10) * 10
		};
	});
	/** What each step uses, so the amounts are right there while cooking. */
	const stepUses = $derived(
		recipe.steps.map((step) => stepLines(step, recipe.lines, catalog.ingredientsById))
	);
	// The glossary fits nearly every step; it stays in "Ako na to" instead of on each one.
	const stepLinks = $derived(
		recipe.steps.map((step, i) => {
			const titles = new Map(recipe.howto.map((h) => [h.slug, h.title] as const));
			return stepGuides(step, stepUses[i], catalog.ingredientsById, [...titles.keys()]).flatMap(
				(slug) =>
					slug !== 'slovnik' && titles.has(slug) ? [{ slug, title: titles.get(slug)! }] : []
			);
		})
	);
	const jsonLd = $derived([
		recipeJsonLd(base, catalog.ingredientsById, cuisine?.name, SITE_ORIGIN),
		breadcrumbJsonLd(
			[
				{ name: 'Recepty', path: '/recepty' },
				...(cuisine ? [{ name: cuisine.name, path: `/kuchyne/${cuisine.id}` }] : []),
				{ name: base.title, path: `/recepty/${base.id}` }
			],
			SITE_ORIGIN
		)
	]);

	let justLogged = $state(false);
	let loggedTimer: ReturnType<typeof setTimeout> | undefined;
	function logEaten() {
		logPortion(base.id, variantName ?? undefined);
		justLogged = true;
		clearTimeout(loggedTimer);
		loggedTimer = setTimeout(() => (justLogged = false), 2000);
	}

	let servings = $state(0);
	$effect.pre(() => {
		// Reset the scaler when navigating between recipes.
		servings = recipe.servings;
	});
	const factor = $derived(servings / recipe.servings);

	/**
	 * Buying everything for the recipe from scratch, in whole packs. Spices and oils are left out
	 * like on the shopping list – a jar lasts for many recipes.
	 */
	const shelfTotal = $derived.by(() => {
		const today = new Date(catalog.builtAt);
		const grams = new Map<string, number>();
		for (const line of recipe.lines) {
			grams.set(line.ingredientId, (grams.get(line.ingredientId) ?? 0) + line.grams * factor);
		}
		let total = 0;
		for (const [id, g] of grams) {
			const ingredient = catalog.ingredientsById.get(id)!;
			if (ingredient.byproduct || isAssumedAtHome(ingredient)) continue;
			const used = (bestPrice(ingredient, catalog.prices, today).perKg * g) / 1000;
			total += shelfCost(ingredient, g, catalog.prices, today)?.cost ?? used;
		}
		return total;
	});

	let doneSteps = $state<number[]>([]);
	$effect.pre(() => {
		void recipe.id;
		doneSteps = [];
	});

	const groups = $derived(pantryByGroup(pantry.current, catalog.ingredientsById));
	const match = $derived(matchRecipe(recipe, groups, catalog.ingredientsById));
	const hasPantry = $derived(ui.loaded && Object.keys(pantry.current).length > 0);
	const inPlan = $derived(ui.loaded ? servingsInPlan(recipe.id) : 0);
	let justAdded = $state(false);

	const targets = $derived({
		...DAILY_REFERENCE,
		protein: settings.current.weightKg
			? settings.current.weightKg * VEGAN_PROTEIN_G_PER_KG
			: DAILY_REFERENCE.protein
	});
	const tags = $derived(computedTags(recipe));

	const similar = $derived.by(() => {
		const mine = new Set(
			recipe.lines.map((l) => catalog.ingredientsById.get(l.ingredientId)!.group)
		);
		return catalog.recipes
			.filter((r) => r.id !== recipe.id)
			.map((r) => {
				const shared = new Set(
					r.lines
						.map((l) => catalog.ingredientsById.get(l.ingredientId)!)
						.filter((i) => !i.staple && i.category !== 'koreniny' && mine.has(i.group))
						.map((i) => i.group)
				).size;
				return { r, score: shared + (r.cuisine === recipe.cuisine ? 2 : 0) };
			})
			.sort((a, b) => b.score - a.score)
			.slice(0, 3)
			.map((x) => x.r);
	});

	function isHome(ingredientId: string) {
		const ingredient = catalog.ingredientsById.get(ingredientId)!;
		return ingredient.id === TAP_WATER_ID || groups.has(ingredient.group);
	}

	function toggleStep(i: number) {
		doneSteps = doneSteps.includes(i) ? doneSteps.filter((s) => s !== i) : [...doneSteps, i];
	}

	function plan(event: MouseEvent) {
		addToPlan(recipe.id, servings, variantName ?? undefined);
		flyToPlan(event.currentTarget as HTMLElement, document.querySelector('.hero svg.plate'));
		justAdded = true;
		setTimeout(() => (justAdded = false), 1600);
	}

	/** Preserves go on the shelf in Špajza, where their age is tracked. */
	const isPreserve = $derived(
		recipe.categories.some((c) => c === 'domace/zavarane' || c === 'domace/kvasene')
	);
	let shelved = $state(false);
	function shelve() {
		preserves.current = [
			...preserves.current,
			{
				id: crypto.randomUUID().slice(0, 8),
				name: recipe.title,
				count: jarsFromYield(recipe.yields),
				made: new Date().toISOString().slice(0, 10),
				// Recipes that fill freezer bags (lečo) go to the freezer, jars to the cellar.
				place: /vrec/.test(recipe.yields ?? '') ? 'mraznicka' : 'pivnica',
				recipeId: recipe.id
			}
		];
		shelved = true;
	}

	function startCooking() {
		pushState('', { cooking: true });
	}

	let shared = $state(false);
	async function share() {
		const url = `${SITE_ORIGIN}/recepty/${base.id}`;
		try {
			if (navigator.share) {
				await navigator.share({ title: base.title, text: base.description, url });
				return;
			}
			await navigator.clipboard.writeText(url);
			shared = true;
			setTimeout(() => (shared = false), 2000);
		} catch {
			// Share sheet closed or clipboard blocked; nothing to do.
		}
	}

	/** Ingredients ticked off while preparing; only for this visit. */
	let ready = $state<Record<number, boolean>>({});

	/** Phones: the quick bar appears once the main buttons scroll out of view. */
	let actionsEl = $state<HTMLElement>();
	let actionsGone = $state(false);
	$effect(() => {
		if (!actionsEl) return;
		const observer = new IntersectionObserver(([entry]) => {
			actionsGone = !entry.isIntersecting && entry.boundingClientRect.top < 0;
		});
		observer.observe(actionsEl);
		return () => observer.disconnect();
	});

	/** Near the end of the page the footer takes over; the bar would cover its links. */
	let footerInView = $state(false);
	$effect(() => {
		const footer = document.querySelector('footer');
		if (!footer) return;
		const observer = new IntersectionObserver(([entry]) => (footerInView = entry.isIntersecting));
		observer.observe(footer);
		return () => observer.disconnect();
	});

	const SECTIONS = [
		{ id: 'suroviny', label: 'Suroviny' },
		{ id: 'postup', label: 'Postup' },
		{ id: 'ziviny', label: 'Živiny' }
	] as const;
	let currentSection = $state<string>('suroviny');
	$effect(() => {
		const els = SECTIONS.map((s) => document.getElementById(s.id)).filter((e) => !!e);
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) if (entry.isIntersecting) currentSection = entry.target.id;
			},
			{ rootMargin: '-40% 0px -55% 0px' }
		);
		for (const el of els) observer.observe(el);
		return () => observer.disconnect();
	});

	const isFavorite = $derived(ui.loaded && !!favorites.current[base.id]);
	const cookedTimes = $derived(
		ui.loaded ? history.current.filter((h) => h.recipeId === base.id) : []
	);
	const dateFormat = new Intl.DateTimeFormat('sk-SK', { day: 'numeric', month: 'numeric' });
	const lastRating = $derived(cookedTimes.findLast((h) => h.rating)?.rating);

	const month = new Date().getMonth() + 1;
	const season = $derived(recipeSeason(recipe, catalog.ingredientsById, month));

	let openSwap = $state<string | null>(null);
	$effect.pre(() => {
		void base.id;
		openSwap = null;
	});

	function monthsLabel(n: number) {
		return n === 1 ? '1 mesiac' : n < 5 ? `${n} mesiace` : `${n} mesiacov`;
	}
	/** A long shopping list in one sentence hides the point; the ingredient list has the detail. */
	function shortList(items: { name: string }[], max = 4): string {
		const names = items.map((i) => i.name);
		const rest = names.length - max;
		if (rest < 2) return names.join(', ');
		return `${names.slice(0, max).join(', ')} a ${rest < 5 ? 'ďalšie' : 'ďalších'} ${rest}`;
	}

	function daysLabel(n: number) {
		return n === 1 ? '1 deň' : n < 5 ? `${n} dni` : `${n} dní`;
	}
</script>

<Seo
	title="{base.title} – vegánsky recept"
	description={base.description}
	image="/og/{base.id}.png"
	type="article"
	{jsonLd}
/>

<article class="wrap page">
	<nav class="crumbs" aria-label="Kategória" data-noprint>
		<a class="back" href={listHref} onclick={backToList}
			><Icon name="arrow-left" size={18} /> Recepty</a
		>
		{#each recipe.categories as path (path)}
			{@const { category, sub } = splitCategory(path)}
			<a
				class="crumb"
				href="/recepty?kategoria={category}&pod={sub}"
				style:--tone={RECIPE_CATEGORIES[category].tone}
			>
				<Icon name={RECIPE_CATEGORIES[category].icon} size={15} />
				{RECIPE_CATEGORIES[category].label} · {subLabel(path)}
			</a>
		{/each}
	</nav>

	<header class="hero" style:--accent={cuisine?.color}>
		<div class="art plate-host">
			<div class="halo"></div>
			<PlateArt
				seed={recipe.id}
				lines={recipe.lines}
				byId={catalog.ingredientsById}
				detail
				vessel={vesselFor(recipe.categories)}
				steam={!recipe.meals.includes('dezert') &&
					!/^(salaty|omacky|dezerty)\//.test(recipe.categories[0])}
				label="Ilustrácia jedla {recipe.title}"
			/>
		</div>
		<div class="intro rise">
			{#if cuisine}
				<a class="cuisine" href="/kuchyne/{cuisine.id}"><span class="sw"></span>{cuisine.name}</a>
			{/if}
			<h1>{recipe.title}</h1>
			<p class="lede">{recipe.description}</p>

			<dl class="facts">
				<div>
					<dt><Icon name="clock" size={16} /> Čas</dt>
					<dd>
						{recipe.time} min
						{#if recipe.activeTime < recipe.time}<small>z toho {recipe.activeTime} min práce</small
							>{/if}
						{#if recipe.ahead}<small><a href="#vopred">+ čakanie vopred</a></small>{/if}
					</dd>
				</div>
				<div>
					<dt><Icon name="chef" size={16} /> Náročnosť</dt>
					<dd>{['', 'Jednoduché', 'Stredné', 'Náročnejšie'][recipe.difficulty]}</dd>
				</div>
				<div>
					<dt><Icon name="euro" size={16} /> Cena</dt>
					<dd>
						{formatEur(recipe.costPerServing)} <span class="unit">/ porcia</span>
						<small>celý recept {formatEur(recipe.costPerServing * servings)}</small>
						<small
							title="Keby sa všetko kupovalo od nuly v celých baleniach, bez korenia a oleja – zvyšok balení ostane doma"
							>v obchode {formatEur(shelfTotal)}</small
						>
						{#if recipe.costIsEstimate}<small
								><a
									class="price-note"
									href="/ceny"
									title="Podiel ceny z reálnych cien v obchodoch; zvyšok je odhad"
									>{recipe.costKnownShare >= 0.05
										? `${Math.round(recipe.costKnownShare * 100)} % z cien obchodov`
										: 'odhad ceny'}</a
								></small
							>{/if}
					</dd>
				</div>
				{#if recipe.showNutrition}
					<div>
						<dt><Icon name="bean" size={16} /> Bielkoviny</dt>
						<dd>
							{formatNumber(recipe.perServing.protein, 0)} g <span class="unit">/ porcia</span>
						</dd>
					</div>
				{:else if recipe.yields}
					<div>
						<dt><Icon name="package" size={16} /> Výťažok</dt>
						<dd class="yields">{recipe.yields}</dd>
					</div>
				{/if}
			</dl>

			<div class="badges">
				<GlutenBadge {recipe} />
				{#each tags.filter((t) => t !== 'bezlepkove' && t !== 'jemne') as t (t)}
					<span class="badge leaf">{COMPUTED_TAG_LABELS[t]}</span>
				{/each}
				{#each recipe.allergens as a (a)}
					<span class="badge turmeric">{ALLERGEN_LABELS[a]}</span>
				{/each}
				{#if recipe.treat.length}
					<span class="badge tomato" title={treatText(recipe.treat)}>Na občas</span>
				{/if}
				{#if recipe.showNutrition && recipe.perServing.salt > SALT_HIGH_G}
					<span
						class="badge tomato"
						title="{formatNumber(
							recipe.perServing.salt
						)} g soli na porciu – aspoň polovica denného limitu">Veľa soli</span
					>
				{/if}
				{#if season.inSeason}
					<span class="badge leaf" title={season.produce.map((i) => i.name).join(', ')}
						>Sezónne {IN_MONTH[month - 1]}</span
					>
				{/if}
			</div>

			<ul class="meta" aria-label="O recepte">
				<li class="spicy" title="Pálivosť">
					<span class="chilis" aria-hidden="true">
						{#each [1, 2, 3] as level (level)}<span class:on={recipe.spicy >= level}
								><Icon name="chili" size={16} /></span
							>{/each}
					</span>
					{SPICY_LABELS[recipe.spicy]}
				</li>
				{#if recipe.showNutrition}
					<li title="Hmotnosť surovín na porciu (pred varením)">
						<Icon name="scale" size={16} /> porcia ≈ {recipe.servingGrams} g
					</li>
				{/if}
				{#if base.keeps}
					<li>
						<Icon name="fridge" size={16} />
						{base.keeps.fridge ? `chladnička ${daysLabel(base.keeps.fridge)}` : 'zjedz hneď'}
					</li>
					{#if base.keeps.freezer}
						<li>
							<Icon name="snowflake" size={16} /> mraznička {monthsLabel(base.keeps.freezer)}
						</li>
					{/if}
				{/if}
				{#if base.tested}
					<li class="tested"><Icon name="check" size={16} /> Vyskúšané</li>
				{:else if likes.cooked[base.id]}
					<li class="bare"><CookedBadge recipeId={base.id} /></li>
				{:else}
					<li
						class="untested"
						title="Recept je napísaný podľa overených postupov, ale v Receptiu ho ešte nikto neuvaril. Časy a množstvá ber orientačne."
					>
						Zatiaľ nevyskúšané v praxi
					</li>
				{/if}
			</ul>

			{#if base.variants.length}
				<div class="variants" role="group" aria-label="Verzia receptu" data-noprint>
					<span class="v-label">Verzia</span>
					<button
						class="chip"
						aria-pressed={variantName === null}
						onclick={() => (variantName = null)}
					>
						Pôvodná
					</button>
					{#each base.variants as v (v.name)}
						<button
							class="chip"
							aria-pressed={variantName === v.name}
							onclick={() => (variantName = v.name)}
						>
							{v.name}
						</button>
					{/each}
				</div>
				{#if variant}
					<p class="variant-desc"><Icon name="sparkle" size={16} /> {variant.description}</p>
				{/if}
			{/if}

			{#if recipe.ahead}
				<p class="ahead" id="vopred">
					<Icon name="clock" size={18} /> <strong>Vopred:</strong>
					{recipe.ahead}
				</p>
			{/if}

			<div class="actions" data-noprint bind:this={actionsEl}>
				<div class="main-actions">
					<button class="btn leaf" onclick={plan}>
						{#if justAdded}
							<Icon name="check" size={18} draw /> Pridané
						{:else}
							<Icon name="calendar" size={18} /> Do plánu ({servings}
							{servings === 1 ? 'porcia' : servings < 5 ? 'porcie' : 'porcií'})
						{/if}
					</button>
					<button class="btn ghost" onclick={startCooking}>
						<Icon name="pot" size={18} /> Variť
					</button>
					{#if isPreserve}
						{#if shelved}
							<a class="btn ghost" href="/spajza#shelf-title">
								<Icon name="check" size={18} /> V zásobách
							</a>
						{:else}
							<button class="btn ghost" onclick={shelve}>
								<Icon name="jar" size={18} /> Zapísať do zásob
							</button>
						{/if}
					{/if}
				</div>
				<div class="side-actions">
					<button
						class="icon-btn fav"
						class:on={isFavorite}
						onclick={() => toggleFavorite(base.id)}
						aria-pressed={isFavorite}
						aria-label={isFavorite ? 'Odobrať z obľúbených' : 'Uložiť medzi obľúbené'}
						title={isFavorite ? 'V obľúbených' : 'Uložiť medzi obľúbené'}
					>
						<Icon name="bookmark" size={19} />
					</button>
					<LikeButton recipeId={recipe.id} />
					{#if ui.loaded && journal.current.enabled && recipe.showNutrition}
						<button
							class="icon-btn"
							onclick={logEaten}
							aria-label={justLogged ? 'Zapísané do denníka' : 'Zapísať porciu do denníka'}
							title={justLogged ? 'Zapísané do denníka' : 'Zjedol/a som porciu'}
						>
							<Icon name={justLogged ? 'check' : 'cup'} size={19} />
						</button>
					{/if}
					<button
						class="icon-btn"
						onclick={share}
						aria-label="Zdieľať recept"
						title={shared ? 'Odkaz skopírovaný' : 'Zdieľať'}
					>
						<Icon name={shared ? 'check' : 'share'} size={19} />
					</button>
					<button
						class="icon-btn print-btn"
						onclick={() => window.print()}
						aria-label="Vytlačiť recept"
						title="Vytlačiť"
					>
						<Icon name="printer" size={19} />
					</button>
					{#if inPlan}<a class="in-plan" href="/plan">V pláne: {inPlan} porc.</a>{/if}
				</div>
			</div>
			{#if isFavorite}
				<div data-noprint><CollectionChips recipeId={base.id} /></div>
			{/if}
			{#if justLogged}
				<p class="cooked-line" data-noprint role="status">
					<Icon name="cup" size={18} /> Porcia je zapísaná.
					<a href="/moje#dennik">Otvoriť denník</a>
				</p>
			{/if}
			{#if cookedTimes.length}
				<p class="cooked-line" data-noprint>
					<Icon name="history" size={18} /> Uvarené {cookedTimes.length}×, naposledy
					{dateFormat.format(new Date(cookedTimes[cookedTimes.length - 1].date))}{#if lastRating}
						· {RATING_LABELS[lastRating]}{/if}
				</p>
			{/if}
			{#if hasPantry}
				<p class="pantry-line" data-noprint>
					<Icon name="jar" size={18} />
					{#if match.missing.length === 0 && match.short.length === 0}
						{match.swaps.length ? 'Uvaríš to z toho, čo máš doma.' : 'Máš doma všetko potrebné.'}
					{:else}
						Máš {match.have - match.short.length}/{match.needed}.
						{#if match.missing.length}Chýba: {shortList(match.missing)}.{/if}
						{#if match.short.length}Málo: {shortList(match.short)}.{/if}
					{/if}
					{#if match.swaps.length}
						Použi, čo máš: {match.swaps
							.map((s) => `${s.need.name.split(' (')[0]} → ${s.use.name.split(' (')[0]}`)
							.join(', ')}.
					{/if}
				</p>
			{/if}
		</div>
	</header>

	{#if recipe.warnings.length}
		<section class="warnings" aria-label="Upozornenia">
			{#each recipe.warnings as w, i (i)}
				<div class="warning {w.level}">
					<Icon name={w.level === 'info' ? 'info' : 'alert'} size={20} />
					<span>{w.text}</span>
				</div>
			{/each}
		</section>
	{/if}

	<nav class="jump-bar" class:shown={actionsGone} aria-label="Časti receptu" data-noprint>
		{#each SECTIONS as s (s.id)}
			{#if s.id !== 'ziviny' || recipe.showNutrition}
				<a href="#{s.id}" class:active={currentSection === s.id}>{s.label}</a>
			{/if}
		{/each}
	</nav>

	<div class="main">
		<section class="ingredients card" id="suroviny">
			<div class="ing-head">
				<h2>Suroviny</h2>
				<div class="stepper" role="group" aria-label="Počet porcií">
					<button
						class="icon-btn"
						aria-label="Menej porcií"
						disabled={servings <= 1}
						onclick={() => servings--}
					>
						<Icon name="minus" size={18} />
					</button>
					<span class="servings"><Icon name="users" size={18} /> {servings}</span>
					<button
						class="icon-btn"
						aria-label="Viac porcií"
						disabled={servings >= 40}
						onclick={() => servings++}
					>
						<Icon name="plus" size={18} />
					</button>
				</div>
			</div>
			<ul>
				{#each recipe.lines as line, i (i)}
					{@const ingredient = catalog.ingredientsById.get(line.ingredientId)!}
					{@const home = hasPantry && isHome(line.ingredientId)}
					{@const swaps = base.swaps[line.ingredientId] ?? []}
					{@const amount = formatAmount(
						line.amount === null ? null : line.amount * factor,
						line.unit
					)}
					<li class:home class:ready={ready[i]}>
						<button
							class="amount"
							aria-pressed={!!ready[i]}
							aria-label="Pripravené: {amount} {ingredient.name}"
							title="Odškrtni, keď to máš pripravené"
							onclick={() => (ready[i] = !ready[i])}
							><span class="tick" aria-hidden="true"
								><Icon name="check" size={12} stroke={3} /></span
							>{amount}</button
						>
						<span class="name" class:not-eaten={line.notEaten}>
							<a class="ing-link" href="/suroviny/{ingredient.id}">{ingredient.name}</a>
							{#if line.notEaten}<small
									title="Použije sa pri varení, ale nezje sa – nepočíta sa do živín."
								>
									(nezje sa)</small
								>{/if}
							{#if ingredient.gluten !== 'free'}
								{@const alt = ingredient.gfAlternative
									? catalog.ingredientsById.get(ingredient.gfAlternative)
									: undefined}
								<span
									class="gluten {ingredient.gluten}"
									title={ingredient.gluten === 'contains'
										? `Obsahuje lepok${alt ? ` – nahraď: ${alt.name}` : ''}`
										: `Môže obsahovať lepok${ingredient.note ? ` – ${ingredient.note}` : ''}`}
								>
									<Icon name="wheat" size={14} stroke={2} />
									{#if alt}<span class="swap">→ {alt.name.split(' (')[0]}</span>{/if}
								</span>
							{/if}
							{#if ingredient.piece && line.grams && line.unit !== 'g'}<span class="note"
									>{formatPiece(line.grams * factor, ingredient.piece)}</span
								>{/if}
							{#if line.note}<span class="note">{line.note}</span>{/if}
						</span>
						<span class="side">
							{#if home}<span class="home-dot" title="Máš doma"
									><Icon name="check" size={14} stroke={2.6} /></span
								>{/if}
							{#if swaps.length}
								<button
									data-noprint
									class="swap-btn"
									aria-expanded={openSwap === line.ingredientId}
									onclick={() =>
										(openSwap = openSwap === line.ingredientId ? null : line.ingredientId)}
								>
									Nemám
								</button>
							{/if}
						</span>
						{#if openSwap === line.ingredientId}
							<ul class="swaps">
								{#each swaps as swap, j (j)}
									<li>
										{#if swap.to}
											<strong>{swap.to.name}</strong>
											{#if hasPantry && isHome(swap.to.id)}<span class="has">máš doma</span>{/if}
											{#if swap.note}– {swap.note}{/if}
										{:else}{swap.note}{/if}
									</li>
								{/each}
							</ul>
						{/if}
					</li>
				{/each}
			</ul>
			<a class="units-link" href="/wiki/jednotky" data-noprint
				><Icon name="spoon" size={16} /> Čo znamená PL, ČL, hrnček?</a
			>

			{#if base.equipmentDetail.length}
				<div class="tools">
					<h3>Budeš potrebovať</h3>
					<ul>
						{#each base.equipmentDetail as tool (tool.id)}
							<li>
								<details>
									<summary>
										<Icon name={isIconName(tool.icon) ? tool.icon : 'spoon'} size={18} />
										{tool.name}
										<span class="no-tool" data-noprint>Nemám</span>
									</summary>
									<ul class="alts">
										{#each tool.alternatives as alt, i (i)}<li>{alt}</li>{/each}
										<li class="more-link">
											<a href="/vybavenie/{tool.id}">Viac o tomto nástroji →</a>
										</li>
									</ul>
								</details>
							</li>
						{/each}
					</ul>
					<a class="units-link" href="/vybavenie" data-noprint
						><Icon name="pan" size={16} /> Vybavenie kuchyne a čím ho nahradiť</a
					>
				</div>
			{/if}
		</section>

		<section class="steps" id="postup">
			<h2>Postup</h2>
			{#if recipe.howto.length}
				<p class="steps-sub" data-noprint>
					Podrobnejšie, ako na jednotlivé kroky, nájdeš nižšie v časti
					<a href="#ako-na-to">Ako na to</a>.
				</p>
			{/if}
			<ol>
				{#each recipe.steps as step, i (i)}
					<li>
						<button
							class="step"
							class:done={doneSteps.includes(i)}
							onclick={() => toggleStep(i)}
							aria-pressed={doneSteps.includes(i)}
						>
							<span class="num">{i + 1}</span>
							<span class="text"
								>{scaleStep(step, factor)}
								{#if stepUses[i].length}
									<span class="uses" data-noprint>
										<span class="sr-only">Použiješ:</span>
										{#each stepUses[i] as line, lineIndex (lineIndex)}
											{@const amount = formatAmount(
												line.amount === null ? null : line.amount * factor,
												line.unit
											)}
											<span class="use"
												>{shortName(
													catalog.ingredientsById.get(line.ingredientId)?.name ?? ''
												)}{#if amount}&nbsp;<b>{amount}</b>{/if}</span
											>
										{/each}
									</span>
								{/if}</span
							>
						</button>
						{#if stepLinks[i].length}
							<span class="step-guides" data-noprint>
								{#each stepLinks[i] as guide (guide.slug)}
									<a href="/wiki/{guide.slug}"><Icon name="book" size={14} /> {guide.title}</a>
								{/each}
							</span>
						{/if}
					</li>
				{/each}
			</ol>
			{#if factor !== 1}
				<p class="muted tap-hint">
					Množstvá v postupe sú prepočítané na {servings}
					{servings === 1 ? 'porciu' : servings < 5 ? 'porcie' : 'porcií'}.
				</p>
			{/if}
			<p class="muted tap-hint" data-noprint>
				Ťukni na krok, keď ho máš hotový, alebo
				<button class="linkish" onclick={startCooking}>zapni režim varenia</button> s časovačmi.
				Neznáme slovo? <a href="/wiki/slovnik">Slovník receptov</a>.
			</p>

			<div class="my-note" data-noprint={!notes.current[base.id] || undefined}>
				<label for="note-{base.id}"><Icon name="pencil" size={18} /> Moje poznámky</label>
				<textarea
					id="note-{base.id}"
					rows="3"
					maxlength="2000"
					placeholder="Nabudúce menej soli, tempeh namiesto tofu… Uloží sa len v tomto zariadení."
					value={ui.loaded ? (notes.current[base.id] ?? '') : ''}
					oninput={(e) => setNote(base.id, e.currentTarget.value)}></textarea>
			</div>

			<div class="fb-wrap"><RecipeFeedback recipeId={base.id} /></div>

			{#if recipe.tips.length}
				<div class="tips">
					<h3><Icon name="sparkle" size={20} /> Tipy</h3>
					<ul>
						{#each recipe.tips as tip, i (i)}<li>{tip}</li>{/each}
					</ul>
				</div>
			{/if}

			{#if base.leftovers || base.keeps}
				<div class="leftovers">
					<h3><Icon name="jar" size={20} /> Zvyšky a skladovanie</h3>
					{#if base.keeps}
						<p>
							{#if base.keeps.fridge}
								V chladničke vydrží {daysLabel(base.keeps.fridge)}{base.keeps.freezer
									? `, v mrazničke ${monthsLabel(base.keeps.freezer)}`
									: ', mraziť sa neoplatí'}.
							{:else}
								Najlepšie čerstvé, skladovať sa neoplatí.
							{/if}
						</p>
					{/if}
					{#if base.leftovers}<p>{base.leftovers}</p>{/if}
					<a class="guide" href="/wiki/mrazenie" data-noprint>Ako skladovať a mraziť →</a>
				</div>
			{/if}

			{#if recipe.howto.length}
				<div class="howto" id="ako-na-to" data-noprint>
					<h3>Ako na to</h3>
					<div class="howto-list">
						{#each recipe.howto as h (h.slug)}
							<a class="howto-link draw-host" href="/wiki/{h.slug}">
								<Icon name="book" size={18} />
								{h.title}
							</a>
						{/each}
					</div>
				</div>
			{/if}
		</section>
	</div>

	{#if base.related.length}
		<section class="related-links" data-noprint>
			<h2>Súvisiace</h2>
			<div class="howto-list">
				{#each base.related as rel (rel.id)}
					<a class="howto-link draw-host" href="/recepty/{rel.id}">
						<Icon name="bowl" size={18} />
						{rel.title}
					</a>
				{/each}
			</div>
		</section>
	{/if}

	{#if recipe.showNutrition}
		<section class="nutrition card" id="ziviny">
			<div class="nut-head">
				<h2>Živiny na porciu</h2>
				<p class="muted">
					{formatNumber(recipe.perServing.kcal, 0)} kcal · % z denného cieľa{settings.current
						.weightKg
						? ` (bielkoviny pre ${settings.current.weightKg} kg)`
						: ''}. <a href="/wiki/o-receptiu">Odkiaľ sú čísla?</a>
				</p>
			</div>
			<div class="nut-grid">
				<NutrientBars
					values={scaleNutrients(recipe.perServing, 1)}
					{targets}
					keys={['kcal', 'protein', 'carbs', 'fat', 'fiber', 'salt']}
				/>
				<NutrientBars
					values={recipe.perServing}
					{targets}
					keys={recipe.perServing.b12 >= 0.5
						? ['iron', 'calcium', 'zinc', 'ala', 'b12']
						: ['iron', 'calcium', 'zinc', 'ala']}
				/>
			</div>
			{#if fortified}
				<p class="b12-note">
					<Icon name="info" size={18} />
					<span>
						Vápnik a B12 tu rátame z obohatených surovín: {fortified.names.join(', ')}. S domácimi
						alebo neobohatenými odrátaj asi {fortified.calcium} mg vápnika a B12 nebude žiadna.
					</span>
				</p>
			{/if}
			<p class="b12-note">
				<Icon name="pill" size={18} />
				<span>
					<strong>B12</strong> z rastlinného jedla nezískaš{recipe.perServing.b12 >= 0.5
						? ' (ani z obohatených potravín spoľahlivo)'
						: ''} – treba ho <a href="/wiki/b12">suplementovať</a>.
				</span>
			</p>
		</section>
	{/if}

	{#if similar.length}
		<section class="similar" data-noprint>
			<h2>Podobné recepty</h2>
			<div class="grid">
				{#each similar as r, i (r.id)}<RecipeCard recipe={r} index={i} />{/each}
			</div>
		</section>
	{/if}
</article>

<div
	class="quick-bar"
	class:shown={actionsGone && !footerInView && !page.state.cooking}
	data-noprint
>
	<button class="btn ghost" onclick={plan}>
		<Icon name={justAdded ? 'check' : 'calendar'} size={18} />
		{justAdded ? 'Pridané' : 'Do plánu'}
	</button>
	<button class="btn leaf" onclick={startCooking}><Icon name="pot" size={18} /> Variť</button>
</div>

{#if page.state.cooking}
	<CookMode
		recipeId={base.id}
		title={base.title}
		steps={recipe.steps}
		lines={recipe.lines}
		{servings}
		recipeServings={recipe.servings}
		variant={variantName ?? undefined}
		tools={base.equipmentDetail.map((e) => e.name)}
		guides={recipe.howto}
		onclose={() => window.history.back()}
	/>
{/if}

<style>
	.page {
		padding-top: 18px;
		overflow-x: clip;
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: var(--ink-2);
		text-decoration: none;
		font-weight: 600;
		margin-bottom: 8px;
	}
	.back:hover {
		color: var(--ink);
	}
	.crumbs {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 10px;
		margin-bottom: 8px;
	}
	.crumbs .back {
		margin: 0 4px 0 0;
	}
	.crumb {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 3px 10px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--tone) 14%, transparent);
		color: color-mix(in srgb, var(--tone) 45%, var(--ink));
		font-size: 0.8rem;
		font-weight: 650;
		text-decoration: none;
	}
	.crumb:hover {
		background: color-mix(in srgb, var(--tone) 24%, transparent);
	}

	.hero {
		display: grid;
		gap: 18px;
		align-items: center;
	}
	.art {
		position: relative;
		/* Small enough on a phone that the title is on the first screen. */
		width: min(48%, 230px);
		justify-self: center;
		padding: 6%;
	}
	.art :global(.plate) {
		position: relative;
	}
	.halo {
		position: absolute;
		inset: 0;
		border-radius: 46% 54% 52% 48% / 50% 44% 56% 50%;
		background: radial-gradient(
			circle at 35% 30%,
			color-mix(in srgb, var(--accent, var(--leaf-2)) 30%, transparent),
			color-mix(in srgb, var(--accent, var(--leaf-2)) 10%, transparent)
		);
		animation: spin 30s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	.cuisine {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		font-weight: 700;
		font-size: 0.85rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-2);
		text-decoration: none;
		margin-bottom: 8px;
	}
	.sw {
		width: 14px;
		height: 14px;
		border-radius: 45% 55% 50% 50%;
		background: var(--accent);
	}
	.lede {
		font-size: 1.12rem;
		color: var(--ink-2);
	}
	.facts {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 8px;
		margin: 18px 0;
	}
	.facts div {
		min-width: 0;
		background: var(--card);
		border-radius: var(--radius-sm);
		padding: 8px 10px;
		border: 1px solid var(--line);
	}
	dt {
		display: flex;
		align-items: center;
		gap: 5px;
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--muted);
	}
	dd {
		margin: 2px 0 0;
		font-family: var(--font-display);
		font-size: 1.1rem;
		font-weight: 600;
	}
	.unit {
		font-family: var(--font-body);
		font-size: 0.78rem;
		font-weight: 500;
		color: var(--muted);
	}
	dd small {
		display: block;
		margin-top: 2px;
		font-family: var(--font-body);
		font-size: 0.8rem;
		line-height: 1.35;
		color: var(--ink-2);
		font-weight: 500;
	}
	.price-note {
		color: inherit;
	}
	.badges {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.variants {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		margin-top: 16px;
	}
	.v-label {
		font-size: 0.78rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--muted);
		margin-right: 4px;
	}
	.variant-desc {
		display: flex;
		align-items: flex-start;
		gap: 6px;
		margin: 10px 0 0;
		font-size: 0.92rem;
		color: var(--plum);
		animation: rise 0.3s var(--ease-out);
	}
	.ahead {
		scroll-margin-top: 90px;
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 14px 0 0;
		padding: 8px 12px;
		border-radius: 12px;
		background: var(--turmeric-soft);
		font-size: 0.92rem;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px 14px;
		margin-top: 18px;
	}
	.main-actions,
	.side-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}
	@media (max-width: 599px) {
		.main-actions {
			width: 100%;
		}
		.main-actions .btn {
			flex: 1 1 auto;
			justify-content: center;
		}
		.side-actions .icon-btn {
			width: 44px;
			height: 44px;
		}
	}
	.in-plan {
		font-size: 0.88rem;
		font-weight: 600;
	}
	.ing-link {
		color: inherit;
		text-decoration: none;
		background-image: linear-gradient(currentColor, currentColor);
		background-size: 0 1.5px;
		background-position: 0 100%;
		background-repeat: no-repeat;
		transition: background-size 0.25s var(--ease-out);
	}
	.ing-link:hover {
		background-size: 100% 1.5px;
	}
	.tools .alts .more-link {
		list-style: none;
		margin-top: 6px;
		font-weight: 650;
	}
	.meta {
		list-style: none;
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin: 10px 0 0;
		padding: 0;
	}
	.meta li {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 5px 10px;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--paper-2);
		color: var(--ink);
		font-size: 0.88rem;
		font-weight: 600;
	}
	.meta li > :global(svg) {
		flex: none;
		color: var(--leaf);
	}
	.meta .tested {
		border-color: transparent;
		background: var(--leaf-soft);
		color: var(--leaf);
	}
	.meta .untested {
		border-style: dashed;
		background: none;
		color: var(--ink-2);
		font-weight: 500;
	}
	.meta .bare {
		padding: 0;
		border: 0;
		background: none;
	}
	.chilis {
		display: inline-flex;
	}
	.chilis span {
		display: inline-flex;
		color: color-mix(in srgb, var(--muted) 45%, transparent);
	}
	.chilis span.on {
		color: var(--tomato);
	}
	.chilis span + span {
		margin-left: -7px;
	}
	.side {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		align-self: center;
	}
	.swap-btn {
		padding: 0 7px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: transparent;
		color: var(--muted);
		font-size: 0.72rem;
		font-weight: 650;
		vertical-align: middle;
	}
	.swap-btn[aria-expanded='true'] {
		background: var(--turmeric-soft);
		border-color: transparent;
		color: var(--ink);
	}
	.ingredients .swaps {
		grid-column: 1 / -1;
		margin: 2px 0 4px;
		padding: 8px 12px 8px 26px;
		border-radius: 10px;
		background: var(--turmeric-soft);
		list-style: disc;
		font-size: 0.86rem;
		animation: rise 0.25s var(--ease-out);
	}
	.ingredients .swaps li {
		display: list-item;
		padding: 2px 0;
		border: 0;
	}
	.has {
		margin: 0 4px;
		padding: 0 6px;
		border-radius: 6px;
		background: var(--leaf-soft);
		color: var(--leaf);
		font-size: 0.75rem;
		font-weight: 700;
	}
	.leftovers {
		margin-top: 26px;
		padding: 14px 16px;
		border-radius: var(--radius-sm);
		background: var(--sky-soft);
	}
	.leftovers h3 {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0 0 6px;
	}
	.leftovers p {
		margin: 4px 0 0;
	}
	.leftovers .guide {
		display: inline-block;
		margin-top: 8px;
		font-size: 0.88rem;
		font-weight: 650;
	}
	.fav.on {
		background: var(--turmeric-soft);
		color: color-mix(in srgb, var(--turmeric) 60%, var(--ink));
	}
	.fav.on :global(path) {
		fill: currentColor;
	}
	.cooked-line {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 12px 0 0;
		font-size: 0.9rem;
		color: var(--ink-2);
	}
	.linkish {
		border: 0;
		padding: 0;
		background: none;
		color: var(--leaf);
		font: inherit;
		font-weight: 650;
		text-decoration: underline;
		cursor: pointer;
	}
	.fb-wrap {
		margin-top: 18px;
	}
	.my-note {
		margin-top: 26px;
	}
	.my-note label {
		display: flex;
		align-items: center;
		gap: 8px;
		font-family: var(--font-display);
		font-weight: 650;
		font-size: 1.15rem;
		margin-bottom: 8px;
	}
	.my-note textarea {
		width: 100%;
		resize: vertical;
		border: 1.5px solid var(--line);
		border-radius: var(--radius-sm);
		background: var(--card);
		color: var(--ink);
		padding: 10px 12px;
		font: inherit;
	}
	.my-note textarea:focus {
		outline: none;
		border-color: var(--leaf-2);
	}
	.pantry-line {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		margin: 14px 0 0;
		font-size: 0.92rem;
		color: var(--ink-2);
	}

	.warnings {
		display: grid;
		gap: 8px;
		margin: 28px 0 0;
	}
	.warning {
		display: flex;
		gap: 10px;
		align-items: flex-start;
		padding: 12px 16px;
		border-radius: var(--radius-sm);
		font-size: 0.95rem;
	}
	.warning.danger {
		background: var(--tomato-soft);
		color: color-mix(in srgb, var(--tomato) 70%, var(--ink));
	}
	.warning.warn {
		background: var(--turmeric-soft);
		color: color-mix(in srgb, var(--turmeric) 45%, var(--ink));
	}
	.warning.info {
		background: var(--sky-soft);
		color: color-mix(in srgb, var(--sky) 60%, var(--ink));
	}
	.warning :global(.icon) {
		margin-top: 2px;
	}

	.main {
		display: grid;
		gap: 28px;
		margin-top: 28px;
	}
	.ingredients {
		padding: 22px;
		align-self: start;
	}
	.ing-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 10px;
		margin-bottom: 10px;
	}
	.ing-head h2 {
		margin: 0;
	}
	.stepper {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.stepper .icon-btn {
		width: 32px;
		height: 32px;
	}
	.stepper .icon-btn:disabled {
		opacity: 0.4;
	}
	.servings {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		min-width: 52px;
		justify-content: center;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.ingredients ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.ingredients li {
		display: grid;
		grid-template-columns: 6.6em 1fr auto;
		gap: 10px;
		padding: 9px 0;
		border-bottom: 1px dashed var(--line);
		align-items: baseline;
	}
	.ingredients li:last-child {
		border-bottom: 0;
	}
	.amount {
		display: inline-flex;
		align-items: baseline;
		gap: 6px;
		padding: 0;
		border: 0;
		background: none;
		font: inherit;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: var(--leaf);
		white-space: nowrap;
		text-align: left;
		cursor: pointer;
	}
	.tick {
		display: inline-grid;
		place-items: center;
		flex: none;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		border: 1.5px solid var(--muted);
		color: transparent;
		transform: translateY(2px);
		transition:
			background 0.2s,
			border-color 0.2s,
			color 0.2s;
	}
	.ready .tick {
		background: var(--leaf);
		border-color: var(--leaf);
		color: var(--paper);
		animation: tick-pop 0.3s var(--ease-spring);
	}
	@keyframes tick-pop {
		50% {
			transform: translateY(2px) scale(1.3);
		}
	}
	.ingredients li.ready > :not(.swaps) {
		opacity: 0.5;
	}
	.ingredients li.ready .name {
		text-decoration: line-through;
	}
	.ingredients li.ready .amount {
		opacity: 1;
	}

	/* Section tabs and quick buttons exist for phones, where the page is long. */
	.jump-bar {
		position: sticky;
		top: 64px;
		z-index: 6;
		display: flex;
		gap: 4px;
		margin: 16px -16px 0;
		padding: 6px 16px;
		background: color-mix(in srgb, var(--paper) 90%, transparent);
		backdrop-filter: blur(10px);
		border-bottom: 1px solid transparent;
		transition: border-color 0.2s;
	}
	.jump-bar.shown {
		border-bottom-color: var(--line);
	}
	.jump-bar a {
		flex: 1;
		padding: 7px 10px;
		border-radius: 999px;
		text-align: center;
		color: var(--ink-2);
		font-weight: 650;
		font-size: 0.9rem;
		text-decoration: none;
		transition:
			background 0.2s,
			color 0.2s;
	}
	.jump-bar a.active {
		background: var(--ink);
		color: var(--paper);
	}
	#suroviny,
	#postup,
	#ziviny {
		scroll-margin-top: 120px;
	}
	.quick-bar {
		position: fixed;
		left: 16px;
		right: 16px;
		bottom: calc(92px + env(safe-area-inset-bottom));
		z-index: 45;
		display: grid;
		grid-template-columns: 1fr 1.4fr;
		gap: 8px;
		padding: 8px;
		border-radius: 20px;
		background: color-mix(in srgb, var(--card) 92%, transparent);
		backdrop-filter: blur(12px);
		border: 1px solid var(--line);
		box-shadow: var(--shadow-lift);
		opacity: 0;
		transform: translateY(20px);
		pointer-events: none;
		transition:
			opacity 0.25s,
			transform 0.35s var(--ease-spring);
	}
	.quick-bar.shown {
		opacity: 1;
		transform: none;
		pointer-events: auto;
	}
	.quick-bar .btn {
		justify-content: center;
	}
	@media (max-width: 899px) {
		.page {
			padding-bottom: 80px;
		}
	}
	@media (min-width: 900px) {
		.jump-bar,
		.quick-bar {
			display: none;
		}
	}
	.note {
		display: block;
		font-size: 0.82rem;
		color: var(--muted);
	}
	.gluten {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		font-size: 0.75rem;
		font-weight: 700;
		vertical-align: middle;
		padding: 1px 6px;
		border-radius: 6px;
		margin-left: 4px;
	}
	.gluten.contains {
		background: var(--tomato-soft);
		color: var(--tomato);
	}
	.gluten.risk {
		background: var(--turmeric-soft);
		color: color-mix(in srgb, var(--turmeric) 60%, var(--ink));
	}
	.home .name {
		color: var(--ink-2);
	}
	.home-dot {
		display: inline-grid;
		place-items: center;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: var(--leaf-soft);
		color: var(--leaf);
	}
	.units-link {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin-top: 14px;
		font-size: 0.88rem;
		font-weight: 600;
	}

	.tools {
		margin-top: 18px;
		padding-top: 14px;
		border-top: 1px dashed var(--line);
	}
	.tools h3 {
		font-size: 1.1rem;
		margin: 0 0 8px;
	}
	.tools > ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 4px;
	}
	/* Undo the ingredient-row grid (.ingredients li) for these nested lists. */
	.tools li {
		display: block;
		padding: 0;
		border: 0;
	}
	.tools .alts li {
		display: list-item;
		margin: 3px 0;
	}
	.tools summary {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 8px;
		border-radius: 10px;
		cursor: pointer;
		list-style: none;
		font-weight: 600;
	}
	.tools summary::-webkit-details-marker {
		display: none;
	}
	.tools summary:hover {
		background: var(--paper-2);
	}
	.no-tool {
		margin-left: auto;
		font-size: 0.75rem;
		font-weight: 650;
		color: var(--muted);
		border: 1px solid var(--line);
		border-radius: 999px;
		padding: 1px 8px;
	}
	details[open] .no-tool {
		background: var(--turmeric-soft);
		border-color: transparent;
		color: var(--ink);
	}
	/* Beats `.ingredients ul`, which resets margins and bullets for the ingredient list. */
	.tools .alts {
		list-style: disc;
		margin: 2px 0 10px 34px;
		padding-left: 1.1em;
		font-size: 0.88rem;
		color: var(--ink-2);
		animation: rise 0.25s var(--ease-out);
	}
	.steps ol {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 10px;
	}
	.step {
		display: grid;
		grid-template-columns: 44px 1fr;
		gap: 14px;
		width: 100%;
		text-align: left;
		background: transparent;
		border: 0;
		padding: 12px 12px 12px 0;
		border-radius: var(--radius-sm);
		transition: background 0.2s;
	}
	.uses {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 6px;
		margin-top: 8px;
	}
	.step-guides {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin: -4px 0 8px 58px;
	}
	.step-guides a {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 2px 10px;
		border-radius: 999px;
		border: 1px solid var(--line);
		color: var(--plum);
		font-size: 0.8rem;
		text-decoration: none;
	}
	.step-guides a:hover {
		background: var(--paper-2);
	}
	.use {
		padding: 1px 8px;
		border-radius: 999px;
		background: var(--paper-2);
		color: var(--ink-2);
		font-size: 0.8rem;
	}
	.use b {
		font-weight: 700;
		color: color-mix(in srgb, var(--leaf) 80%, var(--ink));
	}
	.done .uses {
		display: none;
	}
	.step:hover {
		background: color-mix(in srgb, var(--card) 70%, transparent);
	}
	.num {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		border-radius: 46% 54% 50% 50%;
		background: var(--turmeric-soft);
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 1.3rem;
		color: color-mix(in srgb, var(--turmeric) 50%, var(--ink));
		transition:
			background 0.3s,
			transform 0.4s var(--ease-spring);
	}
	.text {
		font-size: 1.04rem;
		padding-top: 8px;
		transition:
			color 0.3s,
			opacity 0.3s;
	}
	.done .num {
		background: var(--leaf);
		color: var(--paper);
		transform: rotate(-8deg) scale(0.92);
	}
	.done .text {
		opacity: 0.5;
		text-decoration: line-through;
		text-decoration-color: var(--leaf-2);
	}
	.steps-sub {
		margin: -6px 0 14px;
		font-size: 0.86rem;
		color: var(--muted);
	}
	.howto {
		scroll-margin-top: 90px;
	}
	.tap-hint {
		font-size: 0.82rem;
		margin: 6px 0 0 58px;
	}
	.tips,
	.howto {
		margin-top: 26px;
	}
	.tips h3 {
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--plum);
	}
	.tips ul {
		padding-left: 1.2em;
		margin: 0;
	}
	.tips li {
		margin: 6px 0;
	}
	.howto-list {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.howto-link {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 8px 12px;
		border-radius: 12px;
		background: var(--leaf-soft);
		color: var(--leaf);
		font-weight: 600;
		font-size: 0.9rem;
		text-decoration: none;
		transition: transform 0.25s var(--ease-spring);
	}
	.howto-link:hover {
		transform: translateY(-2px);
	}

	.nutrition {
		margin-top: 36px;
		padding: 22px;
	}
	.nut-head p {
		margin: 0 0 18px;
		font-size: 0.9rem;
	}
	.nut-grid {
		display: grid;
		gap: 12px 40px;
	}
	.b12-note {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 18px 0 0;
		font-size: 0.9rem;
		color: var(--sky);
	}

	.similar,
	.related-links {
		margin-top: 48px;
	}
	.yields {
		font-size: 1rem;
	}
	.not-eaten small {
		color: var(--muted);
		font-size: 0.78rem;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
		gap: 18px;
	}

	@media (min-width: 720px) {
		.facts {
			grid-template-columns: 0.9fr 1fr 1.3fr 0.9fr;
			gap: 10px;
		}
		.facts div {
			padding: 10px 12px;
		}
		dd {
			font-size: 1.2rem;
		}
		.nut-grid {
			grid-template-columns: 1fr 1fr;
		}
	}
	@media print {
		.page {
			padding-top: 0;
		}
		.hero {
			grid-template-columns: 120px 1fr;
			gap: 20px;
		}
		.art {
			width: 120px;
			padding: 0;
		}
		.halo {
			display: none;
		}
		.main {
			grid-template-columns: 0.8fr 1.2fr;
			gap: 28px;
			margin-top: 16px;
		}
		.ingredients {
			position: static;
			padding: 0;
			border: 0;
		}
		.step {
			padding: 4px 0;
		}
		.done .text {
			opacity: 1;
			text-decoration: none;
		}
		.nutrition {
			break-inside: avoid;
		}
	}
	@media (min-width: 900px) {
		.hero {
			grid-template-columns: minmax(300px, 0.8fr) 1.2fr;
			gap: 40px;
		}
		.art {
			width: min(100%, 380px);
		}
		.main {
			grid-template-columns: minmax(320px, 0.85fr) 1.15fr;
			gap: 40px;
		}
		.ingredients {
			position: sticky;
			top: 84px;
			/* A long list scrolls inside, or its end is unreachable while it sticks. */
			max-height: calc(100vh - 100px);
			overflow-y: auto;
			overscroll-behavior: contain;
			scrollbar-width: thin;
		}
	}
</style>
