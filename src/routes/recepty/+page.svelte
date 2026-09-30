<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import { onMount, tick } from 'svelte';
	import { goto, replaceState } from '$app/navigation';
	import type { Snapshot } from './$types';
	import { useCatalog } from '$lib/catalog';
	import {
		RECIPE_CATEGORIES,
		SPICY_LABELS,
		TASTE_LABELS,
		inCategory,
		isCategoryId,
		type CategoryId
	} from '$lib/categories';
	import Icon from '$lib/components/Icon.svelte';
	import CategoryTiles from '$lib/components/CategoryTiles.svelte';
	import RecipeCard from '$lib/components/RecipeCard.svelte';
	import {
		CATEGORY_LABELS,
		MEAL_LABELS,
		normalizeSearch,
		searchMatcher,
		pluralRecipes
	} from '$lib/labels';
	import {
		ALLERGEN_LABELS,
		COMPUTED_TAG_LABELS,
		SALT_HIGH_G,
		computedTags,
		cookingStyle
	} from '$lib/nutrition';
	import { recipeSeason } from '$lib/season';
	import { rankByPantry, type PantryMatch } from '$lib/pantry';
	import { LIST_SEARCH_KEY, likes, pantry, ui } from '$lib/state.svelte';
	import {
		MEALS,
		TASTES,
		type Allergen,
		type IngredientCategory,
		type Meal,
		type RecipeSummary,
		type Taste
	} from '$lib/types';

	const catalog = useCatalog();

	const SORTS = {
		odporucane: 'Odporúčané',
		'protein-eur': 'Bielkoviny za €',
		protein: 'Najviac bielkovín',
		cas: 'Najrýchlejšie',
		cena: 'Najlacnejšie',
		spajza: 'Podľa špajze'
	} as const;
	type Sort = keyof typeof SORTS;
	const EXCLUDABLE: Allergen[] = ['soy', 'peanuts', 'nuts', 'sesame', 'celery', 'mustard'];
	const TIME_STEPS = [15, 20, 30, 45, 60, 0];
	const PROTEIN_STEP = 5;
	const PROTEIN_MAX = 30;

	let q = $state('');
	/** 0 = all, 1 = strictly GF (+ label-check risk), 2 = also GF after swaps */
	let gf = $state(0);
	let cuisine = $state('');
	let meal = $state<Meal | ''>('');
	/** Dessert and DIY are browsed as categories; the meal filter is about when you eat it. */
	const MEAL_FILTERS: Meal[] = ['ranajky', 'obed', 'vecera', 'snack'];
	let category = $state<CategoryId | ''>('');
	let sub = $state('');
	/** Exact heat levels to show; empty = any. */
	let spicy = $state<number[]>([]);
	let maxTimeIndex = $state(TIME_STEPS.length - 1);
	let minProtein = $state(0);
	let excluded = $state<Allergen[]>([]);
	let missingTools = $state<string[]>([]);
	let taste = $state<Taste | ''>('');
	/** Ingredient ids; a recipe is hidden when it uses anything from the same group. */
	let withoutIngredients = $state<string[]>([]);
	let ingredientQuery = $state('');
	/** Quick picks: one pot, no cooking, oven only, mild (kids), in season now. */
	const QUICK = [
		'jeden-hrniec',
		'bez-varenia',
		'len-rura',
		'jemne',
		'palive',
		'sezonne',
		'menej-soli'
	] as const;
	type Quick = (typeof QUICK)[number];
	const QUICK_LABELS: Record<Quick, string> = {
		'jeden-hrniec': COMPUTED_TAG_LABELS['jeden-hrniec'],
		'bez-varenia': COMPUTED_TAG_LABELS['bez-varenia'],
		'len-rura': COMPUTED_TAG_LABELS['len-rura'],
		jemne: 'Nepálivé, pre deti',
		palive: 'Pálivé',
		sezonne: 'Z toho, čo je v sezóne',
		'menej-soli': 'Menej soli'
	};
	let quick = $state<Quick[]>([]);
	/** Salty recipes still count when their automatic "Menej soli" version gets under the line. */
	const lowSalt = (r: RecipeSummary) =>
		r.perServing.salt <= SALT_HIGH_G ||
		r.variants.some((v) => v.name === 'Menej soli' && v.perServing.salt <= SALT_HIGH_G);
	const month = new Date().getMonth() + 1;
	/** all | bez = works without vegan substitutes | s = uses them (base or a variant) */
	let subs = $state<'all' | 'bez' | 's'>('all');
	let difficulty = $state<0 | 1 | 2 | 3>(0);
	let onlyPantry = $state(false);
	let sort = $state<Sort>('odporucane');
	let filtersOpen = $state(false);

	const PAGE_SIZE = 24;
	let limit = $state(PAGE_SIZE);

	const maxTime = $derived(TIME_STEPS[maxTimeIndex]);

	/** Everyone has the basic tools; a filtered-for one stays so it can be switched off. */
	const toolOptions = $derived(
		catalog.equipment.filter(
			(e) =>
				missingTools.includes(e.id) ||
				(e.level !== 'zaklad' && catalog.recipes.some((r) => r.equipment.includes(e.id)))
		)
	);

	const recipeGroups = $derived(
		new Map(
			catalog.recipes.map((r) => [
				r.id,
				new Set(r.lines.map((l) => catalog.ingredientsById.get(l.ingredientId)?.group))
			])
		)
	);
	const excludedGroups = $derived(
		withoutIngredients.map((id) => catalog.ingredientsById.get(id)?.group ?? id)
	);
	/** Ingredients some recipe uses, one per group (dry and canned chickpeas are one choice). */
	const excludableIngredients = $derived.by(() => {
		const used = new Set(catalog.recipes.flatMap((r) => r.lines.map((l) => l.ingredientId)));
		const seen = new Set<string>();
		return catalog.ingredients.filter((i) => {
			if (!used.has(i.id) || i.id === 'voda' || seen.has(i.group)) return false;
			seen.add(i.group);
			return true;
		});
	});
	const ingredientSuggestions = $derived.by(() => {
		const query = normalizeSearch(ingredientQuery.trim());
		if (!query) return [];
		const found = excludableIngredients
			.filter((i) => !excludedGroups.includes(i.group))
			.map((i) => ({ i, name: normalizeSearch(i.name) }))
			.filter(({ name }) => name.includes(query));
		// Names starting with the query first: "mrk" → mrkva before "sušená mrkva".
		found.sort((a, b) => Number(!a.name.startsWith(query)) - Number(!b.name.startsWith(query)));
		return found.slice(0, 6).map(({ i }) => i);
	});

	/** "Cícer sterilizovaný (scedený)" → "Cícer sterilizovaný", short enough for a chip. */
	const shortName = (id: string) =>
		(catalog.ingredientsById.get(id)?.name ?? id).replace(/\s*\(.*\)/, '');

	function excludeIngredient(id: string) {
		withoutIngredients = [...withoutIngredients, id];
		ingredientQuery = '';
	}

	/** Categories almost every recipe has; searching them would match everything. */
	const UNSEARCHED_CATEGORIES = new Set<IngredientCategory>(['koreniny', 'oleje', 'ine']);
	const searchIndex = $derived(
		new Map(
			catalog.recipes.map((r) => [
				r.id,
				normalizeSearch(
					[
						r.title,
						r.description,
						catalog.cuisinesById.get(r.cuisine)?.name ?? '',
						...r.meals.map((m) => MEAL_LABELS[m]),
						...r.lines.map((l) => catalog.ingredientsById.get(l.ingredientId)?.name ?? ''),
						// "strukoviny", "orechy" or "ovocie" find recipes by what's in them.
						...new Set(
							r.lines
								.map((l) => catalog.ingredientsById.get(l.ingredientId)?.category)
								.filter((c) => c && !UNSEARCHED_CATEGORIES.has(c))
								.map((c) => CATEGORY_LABELS[c!])
						)
					].join(' ')
				)
			])
		)
	);

	const matches = $derived(
		new Map<string, PantryMatch>(
			rankByPantry(catalog.recipes, pantry.current, catalog.ingredientsById).map((m) => [
				m.recipe.id,
				m
			])
		)
	);
	const hasPantry = $derived(ui.loaded && Object.keys(pantry.current).length > 0);

	const matchesQuery = $derived(searchMatcher([...searchIndex.values()], q));

	/** Every filter except the category, so the tiles can count what each one would show. */
	function passesFilters(r: RecipeSummary): boolean {
		if (!matchesQuery(searchIndex.get(r.id)!)) return false;
		if (gf === 1 && r.gluten === 'contains') return false;
		if (gf === 2 && r.gluten === 'contains' && !r.gfSwappable) return false;
		if (cuisine && r.cuisine !== cuisine) return false;
		if (meal && !r.meals.includes(meal)) return false;
		if (maxTime && r.time > maxTime) return false;
		if (r.perServing.protein < minProtein) return false;
		if (excluded.some((a) => r.allergens.includes(a))) return false;
		if (missingTools.some((t) => r.equipment.includes(t))) return false;
		if (taste && r.taste !== taste) return false;
		if (excludedGroups.length) {
			const groups = recipeGroups.get(r.id)!;
			if (excludedGroups.some((g) => groups.has(g))) return false;
		}
		for (const q of quick) {
			if (q === 'jemne' && r.spicy > 0) return false;
			if (q === 'palive' && r.spicy < 2) return false;
			if (q === 'sezonne' && !recipeSeason(r, catalog.ingredientsById, month).inSeason) {
				return false;
			}
			if (q === 'menej-soli' && !lowSalt(r)) return false;
			if (
				q !== 'jemne' &&
				q !== 'palive' &&
				q !== 'sezonne' &&
				q !== 'menej-soli' &&
				cookingStyle(r.equipment) !== q
			) {
				return false;
			}
		}
		if (subs === 'bez' && r.substitutes === 'required') return false;
		if (subs === 's' && !r.usesSubstitutes && !r.variants.some((v) => v.usesSubstitutes)) {
			return false;
		}
		if (difficulty && r.difficulty !== difficulty) return false;
		if (spicy.length && !spicy.includes(r.spicy)) return false;
		return true;
	}
	const unfiltered = $derived(catalog.recipes.filter(passesFilters));
	const categoryCounts = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const r of unfiltered) {
			const seen = new Set<string>();
			for (const path of r.categories) {
				const top = path.split('/')[0];
				if (!seen.has(top)) counts.set(top, (counts.get(top) ?? 0) + 1);
				seen.add(top);
				counts.set(path, (counts.get(path) ?? 0) + 1);
			}
		}
		return counts;
	});
	const subOptions = $derived(
		category
			? Object.entries(RECIPE_CATEGORIES[category].subs as Record<string, string>).filter(
					([id]) => id === sub || categoryCounts.get(`${category}/${id}`)
				)
			: []
	);

	const filtered = $derived.by(() => {
		const list = unfiltered.filter((r) => !category || inCategory(r.categories, category, sub));
		const by: Record<Sort, (a: (typeof list)[number], b: (typeof list)[number]) => number> = {
			odporucane: (a, b) =>
				(likes.counts[b.id] ?? 0) - (likes.counts[a.id] ?? 0) ||
				computedTags(b).length - computedTags(a).length,
			'protein-eur': (a, b) =>
				b.perServing.protein / b.costPerServing - a.perServing.protein / a.costPerServing,
			protein: (a, b) => b.perServing.protein - a.perServing.protein,
			cas: (a, b) => a.time - b.time,
			cena: (a, b) => a.costPerServing - b.costPerServing,
			spajza: (a, b) => matches.get(b.id)!.score - matches.get(a.id)!.score
		};
		if (!onlyPantry) return { list: list.sort(by[sort]), closest: 0 };
		const missingCount = (r: (typeof list)[number]) => matches.get(r.id)!.missing.length;
		const cookable = list.filter((r) => missingCount(r) === 0);
		if (cookable.length || !list.length) return { list: cookable.sort(by[sort]), closest: 0 };
		// Nothing cookable from the pantry alone → the nearest recipes, fewest missing first.
		const closest = Math.max(2, Math.min(...list.map(missingCount)));
		return {
			list: list
				.filter((r) => missingCount(r) <= closest)
				.sort((a, b) => missingCount(a) - missingCount(b) || by[sort](a, b)),
			closest
		};
	});
	const results = $derived(filtered.list);

	/** A random recipe from what the current filters allow (or from all, if none match). */
	function surprise() {
		const pool = results.length ? results : catalog.recipes;
		const pick = pool[Math.floor(Math.random() * pool.length)];
		if (pick) void goto(`/recepty/${pick.id}`);
	}

	const shown = $derived(results.slice(0, limit));

	const activeFilterCount = $derived(
		[
			gf,
			cuisine,
			category,
			meal,
			spicy.length,
			maxTime,
			minProtein,
			excluded.length,
			missingTools.length,
			taste,
			withoutIngredients.length,
			quick.length,
			onlyPantry,
			subs !== 'all',
			difficulty
		].filter(Boolean).length
	);

	function pickCategory(id: CategoryId) {
		category = category === id ? '' : id;
		sub = '';
	}

	function toggleSpicy(level: number) {
		spicy = spicy.includes(level) ? spicy.filter((l) => l !== level) : [...spicy, level].sort();
	}

	function toggleAllergen(a: Allergen) {
		excluded = excluded.includes(a) ? excluded.filter((x) => x !== a) : [...excluded, a];
	}

	function toggleQuick(q: Quick) {
		quick = quick.includes(q) ? quick.filter((x) => x !== q) : [...quick, q];
	}

	function toggleTool(tool: string) {
		missingTools = missingTools.includes(tool)
			? missingTools.filter((t) => t !== tool)
			: [...missingTools, tool];
	}

	function reset() {
		q = '';
		gf = 0;
		cuisine = '';
		category = '';
		sub = '';
		meal = '';
		spicy = [];
		maxTimeIndex = TIME_STEPS.length - 1;
		minProtein = 0;
		excluded = [];
		missingTools = [];
		taste = '';
		withoutIngredients = [];
		ingredientQuery = '';
		quick = [];
		subs = 'all';
		difficulty = 0;
		onlyPantry = false;
		sort = 'odporucane';
	}

	// Filters live in the URL so links like /recepty?gf=1 work and Back returns to the same
	// list; prerendered pages can only read it on mount.
	const search = $derived.by(() => {
		const p = new URLSearchParams();
		if (q) p.set('q', q);
		if (gf) p.set('gf', String(gf));
		if (cuisine) p.set('kuchyna', cuisine);
		if (category) p.set('kategoria', category);
		if (category && sub) p.set('pod', sub);
		if (meal) p.set('jedlo', meal);
		if (taste) p.set('chut', taste);
		if (spicy.length) p.set('palivost', spicy.join(','));
		if (maxTime) p.set('cas', String(maxTime));
		if (minProtein) p.set('bielkoviny', String(minProtein));
		if (excluded.length) p.set('alergeny', excluded.join(','));
		if (withoutIngredients.length) p.set('bez', withoutIngredients.join(','));
		if (sort !== 'odporucane') p.set('sort', sort);
		if (onlyPantry) p.set('spajza', '1');
		if (subs !== 'all') p.set('nahrady', subs);
		if (difficulty) p.set('narocnost', String(difficulty));
		if (missingTools.length) p.set('nemam', missingTools.join(','));
		if (quick.length) p.set('rychlo', quick.join(','));
		return p.toString();
	});
	const list = (value: string | null) => (value ?? '').split(',').filter(Boolean);

	/** The filters the current page of results belongs to; set once the URL has been read. */
	let pagedSearch: string | undefined;
	onMount(() => {
		const p = new URLSearchParams(location.search);
		q = p.get('q') ?? '';
		gf = Math.min(2, Math.max(0, Number(p.get('gf')) || 0));
		cuisine = catalog.cuisinesById.has(p.get('kuchyna') ?? '') ? p.get('kuchyna')! : '';
		const m = p.get('jedlo');
		meal = (MEALS as readonly string[]).includes(m ?? '') ? (m as Meal) : '';
		// Old links used the meal filter for DIY and desserts.
		if (meal === 'domace' || meal === 'dezert') {
			category = meal === 'domace' ? 'domace' : 'dezerty';
			meal = '';
		}
		const k = p.get('kategoria') ?? '';
		if (isCategoryId(k)) {
			category = k;
			const pod = p.get('pod') ?? '';
			if (pod in RECIPE_CATEGORIES[k].subs) sub = pod;
		}
		const t = p.get('chut');
		taste = (TASTES as readonly string[]).includes(t ?? '') ? (t as Taste) : '';
		spicy = list(p.get('palivost'))
			.map(Number)
			.filter((n) => n >= 0 && n <= 3);
		const time = TIME_STEPS.indexOf(Number(p.get('cas')));
		if (time >= 0) maxTimeIndex = time;
		const protein = Number(p.get('bielkoviny'));
		if (protein > 0 && protein <= PROTEIN_MAX && protein % PROTEIN_STEP === 0) {
			minProtein = protein;
		}
		excluded = list(p.get('alergeny')).filter((a): a is Allergen =>
			(EXCLUDABLE as string[]).includes(a)
		);
		withoutIngredients = [
			...new Set(list(p.get('bez')).filter((id) => catalog.ingredientsById.has(id)))
		];
		const s = p.get('sort');
		if (s && s in SORTS) sort = s as Sort;
		if (p.get('spajza') === '1') onlyPantry = true;
		const n = p.get('nahrady');
		if (n === 'bez' || n === 's') subs = n;
		const d = Number(p.get('narocnost'));
		if (d === 1 || d === 2 || d === 3) difficulty = d;
		const tools = new Set(catalog.equipment.map((e) => e.id));
		missingTools = list(p.get('nemam')).filter((id) => tools.has(id));
		quick = list(p.get('rychlo')).filter((q): q is Quick =>
			(QUICK as readonly string[]).includes(q)
		);
		pagedSearch = search;
	});

	$effect(() => {
		const current = search;
		if (pagedSearch === undefined) return;
		// The URL as opened stays as it is (the router isn't ready for replaceState yet on mount).
		if (current !== pagedSearch) {
			// Other filters start from the first page again.
			limit = PAGE_SIZE;
			pagedSearch = current;
			if (current !== location.search.slice(1)) {
				replaceState(current ? `?${current}` : location.pathname, {});
			}
		}
		try {
			sessionStorage.setItem(LIST_SEARCH_KEY, current);
		} catch {
			// Private mode: the recipe page's back link just goes to all recipes.
		}
	});

	// Back from a recipe restores how far the list was expanded. SvelteKit restores the scroll
	// before the extra cards render, so it's clamped to the first page – scroll again after them.
	export const snapshot: Snapshot<{ limit: number; filtersOpen: boolean; scrollY: number }> = {
		capture: () => ({ limit, filtersOpen, scrollY }),
		restore: (value) => {
			limit = value.limit;
			filtersOpen = value.filtersOpen;
			void tick().then(() => scrollTo(scrollX, value.scrollY));
		}
	};
</script>

<Seo
	title="Recepty"
	description="Vegánske a bezlepkové recepty z celého sveta so živinami a cenou porcie."
/>

<div class="wrap page">
	<header class="page-head rise">
		<p class="eyebrow">Recepty</p>
		<h1>Čo dnes uvaríme?</h1>
	</header>

	<div class="toolbar">
		<div class="field grow">
			<Icon name="search" size={20} />
			<label for="q" class="sr-only">Hľadať</label>
			<input id="q" type="search" bind:value={q} placeholder="Názov, surovina, kuchyňa…" />
		</div>
		<label class="field sort">
			<span class="sr-only">Zoradiť</span>
			<select bind:value={sort}>
				{#each Object.entries(SORTS) as [value, label] (value)}
					<option {value} disabled={value === 'spajza' && !hasPantry}>{label}</option>
				{/each}
			</select>
		</label>
		<button
			class="btn ghost filter-toggle"
			aria-expanded={filtersOpen}
			aria-controls="filters"
			onclick={() => (filtersOpen = !filtersOpen)}
		>
			<Icon name="sliders" size={18} /> Filtre
			{#if activeFilterCount}<span class="count">{activeFilterCount}</span>{/if}
		</button>
	</div>

	<CategoryTiles counts={categoryCounts} selected={category} onpick={pickCategory} />
	{#if category}
		{@const c = RECIPE_CATEGORIES[category]}
		<div class="subs" style:--tone={c.tone} role="group" aria-label="Podkategórie: {c.label}">
			<button class="chip" aria-pressed={!sub} onclick={() => (sub = '')}>
				Všetky {c.label.toLowerCase()}
			</button>
			{#each subOptions as [id, label] (id)}
				<button class="chip" aria-pressed={sub === id} onclick={() => (sub = sub === id ? '' : id)}>
					{label} <span class="sub-count">{categoryCounts.get(`${category}/${id}`) ?? 0}</span>
				</button>
			{/each}
		</div>
	{/if}

	<nav class="ideas" aria-label="Nevieš, čo variť?">
		<span class="ideas-label">Nevieš, čo variť?</span>
		<a class="idea" href="/spajza" style:--tone="var(--turmeric)"
			><span class="idea-ico"><Icon name="jar" size={16} /></span> Z toho, čo mám doma</a
		>
		<a class="idea" href="/zvysky" style:--tone="var(--leaf-2)"
			><span class="idea-ico"><Icon name="history" size={16} /></span> Zo zvyškov</a
		>
		<a class="idea" href="/sezona" style:--tone="var(--leaf)"
			><span class="idea-ico"><Icon name="leaf" size={16} /></span> V sezóne</a
		>
		<a class="idea" href="/plan#navrh" style:--tone="var(--sky)"
			><span class="idea-ico"><Icon name="calendar" size={16} /></span> Navrhni mi týždeň</a
		>
		<button class="idea" style:--tone="var(--tomato)" onclick={surprise}
			><span class="idea-ico"><Icon name="sparkle" size={16} /></span> Prekvap ma</button
		>
	</nav>

	<div class="layout">
		<aside id="filters" class="filters card" class:open={filtersOpen}>
			<fieldset>
				<legend>Rýchly výber</legend>
				<div class="chips">
					{#each QUICK as q (q)}
						<button class="chip" aria-pressed={quick.includes(q)} onclick={() => toggleQuick(q)}>
							{QUICK_LABELS[q]}
						</button>
					{/each}
				</div>
			</fieldset>

			<fieldset>
				<legend>Chuť</legend>
				<div class="chips">
					{#each TASTES as t (t)}
						<button
							class="chip"
							aria-pressed={taste === t}
							onclick={() => (taste = taste === t ? '' : t)}
						>
							{TASTE_LABELS[t]}
						</button>
					{/each}
				</div>
			</fieldset>

			<fieldset>
				<legend>Lepok</legend>
				<div class="chips">
					{#each ['Všetko', 'Bezlepkové', 'Aj s bezlepkovou verziou'] as label, i (label)}
						<button class="chip" aria-pressed={gf === i} onclick={() => (gf = i)}>{label}</button>
					{/each}
				</div>
				{#if gf}
					<p class="hint">
						Bezlepkové* = niektorá surovina (bujón, tortilly…) môže mať lepok, kontroluj etiketu.
					</p>
				{/if}
			</fieldset>

			<fieldset>
				<legend>Kedy to zješ</legend>
				<div class="chips">
					{#each MEAL_FILTERS as m (m)}
						<button
							class="chip"
							aria-pressed={meal === m}
							onclick={() => (meal = meal === m ? '' : m)}
						>
							{MEAL_LABELS[m]}
						</button>
					{/each}
				</div>
			</fieldset>

			<fieldset>
				<legend>Pálivosť</legend>
				<div class="chips">
					{#each SPICY_LABELS as label, level (label)}
						<button
							class="chip heat"
							aria-pressed={spicy.includes(level)}
							onclick={() => toggleSpicy(level)}
						>
							<span class="peppers" aria-hidden="true">
								{#each [1, 2, 3] as n (n)}<span class:on={level >= n}
										><Icon name="chili" size={13} stroke={2.2} /></span
									>{/each}
							</span>
							{label}
						</button>
					{/each}
				</div>
			</fieldset>

			<fieldset>
				<legend>Vegánske náhrady</legend>
				<div class="chips">
					<button class="chip" aria-pressed={subs === 'all'} onclick={() => (subs = 'all')}
						>Všetko</button
					>
					<button class="chip" aria-pressed={subs === 'bez'} onclick={() => (subs = 'bez')}>
						Bez náhrad
					</button>
					<button class="chip" aria-pressed={subs === 's'} onclick={() => (subs = 's')}>
						S náhradami
					</button>
				</div>
				<p class="hint">
					Rastlinná smotana, maslo, syr, jogurt, majonéza, sójové mäso. <a href="/wiki/nahrady"
						>Čo kupovať</a
					>
				</p>
			</fieldset>

			<fieldset>
				<legend>Náročnosť</legend>
				<div class="chips">
					{#each ['Jednoduché', 'Stredné', 'Náročnejšie'] as label, i (label)}
						<button
							class="chip"
							aria-pressed={difficulty === i + 1}
							onclick={() => (difficulty = difficulty === i + 1 ? 0 : ((i + 1) as 1 | 2 | 3))}
						>
							{label}
						</button>
					{/each}
				</div>
			</fieldset>

			<fieldset>
				<legend>Kuchyňa</legend>
				<label class="field">
					<span class="sr-only">Kuchyňa</span>
					<select bind:value={cuisine}>
						<option value="">Všetky kuchyne</option>
						{#each catalog.cuisines as c (c.id)}
							<option value={c.id}>{c.name}</option>
						{/each}
					</select>
				</label>
			</fieldset>

			<fieldset>
				<legend>Čas: <strong>{maxTime ? `do ${maxTime} min` : 'hocikoľko'}</strong></legend>
				<input
					type="range"
					min="0"
					max={TIME_STEPS.length - 1}
					step="1"
					bind:value={maxTimeIndex}
					aria-label="Maximálny čas"
				/>
			</fieldset>

			<fieldset>
				<legend
					>Bielkoviny: <strong>{minProtein ? `aspoň ${minProtein} g/porcia` : 'hocikoľko'}</strong
					></legend
				>
				<input
					type="range"
					min="0"
					max={PROTEIN_MAX}
					step={PROTEIN_STEP}
					bind:value={minProtein}
					aria-label="Minimum bielkovín"
				/>
			</fieldset>

			<fieldset>
				<legend>Bez alergénov</legend>
				<div class="chips">
					{#each EXCLUDABLE as a (a)}
						<button
							class="chip"
							aria-pressed={excluded.includes(a)}
							onclick={() => toggleAllergen(a)}
						>
							bez: {ALLERGEN_LABELS[a]}
						</button>
					{/each}
				</div>
			</fieldset>

			<fieldset>
				<legend>Bez týchto surovín</legend>
				{#if withoutIngredients.length}
					<div class="chips">
						{#each withoutIngredients as id (id)}
							<button
								class="chip"
								aria-pressed="true"
								aria-label="Zrušiť: bez {shortName(id)}"
								onclick={() => (withoutIngredients = withoutIngredients.filter((x) => x !== id))}
							>
								bez: {shortName(id)}
								<Icon name="x" size={14} />
							</button>
						{/each}
					</div>
				{/if}
				<label class="field small-field">
					<Icon name="search" size={16} />
					<span class="sr-only">Surovina, ktorú nechceš alebo nemáš</span>
					<input
						type="search"
						bind:value={ingredientQuery}
						placeholder="Napr. huby, koriander…"
						autocomplete="off"
						onkeydown={(e) => {
							if (e.key === 'Enter' && ingredientSuggestions[0]) {
								e.preventDefault();
								excludeIngredient(ingredientSuggestions[0].id);
							}
						}}
					/>
				</label>
				{#if ingredientSuggestions.length}
					<div class="chips" aria-label="Návrhy surovín">
						{#each ingredientSuggestions as i (i.id)}
							<button
								class="chip"
								aria-label="Skryť recepty s: {shortName(i.id)}"
								onclick={() => excludeIngredient(i.id)}
							>
								<Icon name="plus" size={13} />
								{shortName(i.id)}
							</button>
						{/each}
					</div>
				{:else if ingredientQuery.trim()}
					<p class="hint">Takú surovinu v receptoch nemáme.</p>
				{:else}
					<p class="hint">
						Čo nemáš doma alebo nejete. Skryje aj iné podoby (sušený aj varený cícer).
					</p>
				{/if}
			</fieldset>

			<fieldset>
				<legend>Nemám doma</legend>
				<div class="chips">
					{#each toolOptions as tool (tool.id)}
						<button
							class="chip"
							aria-pressed={missingTools.includes(tool.id)}
							onclick={() => toggleTool(tool.id)}
						>
							{tool.name}
						</button>
					{/each}
				</div>
			</fieldset>

			<fieldset>
				<legend>Špajza</legend>
				<button
					class="chip"
					aria-pressed={onlyPantry}
					disabled={!hasPantry}
					onclick={() => (onlyPantry = !onlyPantry)}
				>
					<Icon name="jar" size={16} /> Len z toho, čo mám
				</button>
				{#if !hasPantry}<p class="hint"><a href="/spajza">Nakliknúť špajzu →</a></p>{/if}
			</fieldset>

			{#if activeFilterCount || q}
				<button class="btn ghost small" onclick={reset}
					><Icon name="x" size={16} /> Zrušiť filtre</button
				>
			{/if}
		</aside>

		<section class="results" aria-live="polite">
			<p class="count-line muted">
				{#if category}
					<strong
						>{[RECIPE_CATEGORIES[category].label, subOptions.find(([id]) => id === sub)?.[1]]
							.filter(Boolean)
							.join(' · ')}</strong
					>
					<span aria-hidden="true">·</span>
				{/if}
				{results.length}
				{pluralRecipes(results.length)}
			</p>
			{#if filtered.closest}
				<p class="closest card">
					<Icon name="jar" size={18} />
					Len z toho, čo máš doma, sa nedá uvariť nič. Najbližšie sú tieto – chýba im najviac
					{filtered.closest}
					{filtered.closest < 5 ? 'veci' : 'vecí'}.
				</p>
			{/if}
			{#if results.length}
				<div class="grid">
					{#each shown as recipe, i (recipe.id)}
						<RecipeCard
							{recipe}
							index={i % PAGE_SIZE}
							match={hasPantry ? matches.get(recipe.id) : undefined}
						/>
					{/each}
				</div>
				{#if results.length > shown.length}
					<div class="more">
						<button class="btn ghost" onclick={() => (limit += PAGE_SIZE)}>
							Zobraziť ďalšie ({results.length - shown.length})
						</button>
					</div>
				{/if}
			{:else}
				<div class="empty card">
					<svg viewBox="0 0 120 90" width="140" aria-hidden="true">
						<path
							d="M10 45h100a50 40 0 0 1-100 0Z"
							fill="var(--paper-2)"
							stroke="var(--line)"
							stroke-width="2"
						/>
						<path
							d="M45 30c-4-6 4-10 0-16M60 28c-4-6 4-10 0-16M75 30c-4-6 4-10 0-16"
							stroke="var(--muted)"
							stroke-width="2.5"
							fill="none"
							stroke-linecap="round"
						/>
					</svg>
					<h3>Nič také zatiaľ nemáme</h3>
					<p class="muted">Skús uvoľniť filtre, alebo si recept vyžiadaj a pridáme ho.</p>
					<button class="btn" onclick={reset}>Zrušiť filtre</button>
				</div>
			{/if}
		</section>
	</div>
</div>

<style>
	.subs {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-bottom: 14px;
		padding: 12px;
		border-radius: 16px;
		background: color-mix(in srgb, var(--tone) 9%, transparent);
		animation: rise 0.3s var(--ease-out);
	}
	.sub-count {
		opacity: 0.6;
		font-size: 0.78em;
	}
	.peppers {
		display: inline-flex;
		margin-right: 2px;
	}
	.peppers span {
		display: inline-flex;
		opacity: 0.25;
	}
	.peppers span.on {
		opacity: 1;
		color: var(--tomato);
	}
	.heat:first-child .peppers {
		display: none;
	}
	.ideas {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 14px -16px 0;
		padding: 2px 16px 6px;
		overflow-x: auto;
		scrollbar-width: none;
	}
	.ideas::-webkit-scrollbar {
		display: none;
	}
	.ideas-label {
		flex: none;
		margin-right: 4px;
		font-size: 0.85rem;
		font-weight: 650;
		color: var(--muted);
	}
	.idea {
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 5px 14px 5px 5px;
		border: 1.5px solid var(--line);
		border-radius: 999px;
		background: var(--card);
		color: var(--ink);
		font: inherit;
		font-size: 0.88rem;
		font-weight: 650;
		text-decoration: none;
		cursor: pointer;
		transition:
			transform 0.25s var(--ease-spring),
			border-color 0.2s;
	}
	.idea:hover {
		transform: translateY(-2px);
		border-color: var(--tone);
	}
	.idea-ico {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: color-mix(in srgb, var(--tone) 18%, transparent);
		color: color-mix(in srgb, var(--tone) 75%, var(--ink));
		transition: transform 0.3s var(--ease-spring);
	}
	.idea:hover .idea-ico {
		transform: rotate(-12deg) scale(1.08);
	}
	.page {
		padding-top: 28px;
	}
	.page-head h1 {
		margin-bottom: 18px;
	}
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		margin-bottom: 18px;
	}
	.grow {
		flex: 1 1 260px;
	}
	.sort {
		flex: 0 1 220px;
	}
	.count {
		display: inline-grid;
		place-items: center;
		min-width: 20px;
		height: 20px;
		border-radius: 999px;
		background: var(--tomato);
		color: #fff;
		font-size: 0.72rem;
	}
	.layout {
		display: grid;
		gap: 22px;
	}
	.filters {
		display: none;
		padding: 18px;
		flex-direction: column;
		gap: 18px;
		align-self: start;
	}
	.filters.open {
		display: flex;
		animation: rise 0.35s var(--ease-out);
	}
	fieldset {
		border: 0;
		margin: 0;
		padding: 0;
		min-width: 0;
		display: grid;
		gap: 10px;
	}
	legend {
		font-weight: 700;
		font-size: 0.9rem;
		margin-bottom: 8px;
		padding: 0;
	}
	legend strong {
		font-weight: 600;
		color: var(--leaf);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.filters .chip {
		max-width: 100%;
		white-space: normal;
		text-align: left;
	}
	.small-field input {
		padding-block: 8px;
		font-size: 0.9rem;
	}
	.chip:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.hint {
		font-size: 0.82rem;
		color: var(--muted);
		margin: 0;
	}
	.closest {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		padding: 12px 14px;
		margin: 0 0 14px;
		background: var(--turmeric-soft);
		border-color: transparent;
	}
	.count-line {
		margin: 0 0 12px;
		font-size: 0.9rem;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
		gap: 18px;
	}
	.more {
		display: flex;
		justify-content: center;
		margin-top: 24px;
	}
	.empty {
		display: grid;
		justify-items: center;
		text-align: center;
		padding: 40px 20px;
		gap: 6px;
	}
	@media (min-width: 980px) {
		.filter-toggle {
			display: none;
		}
		.layout {
			grid-template-columns: 280px 1fr;
		}
		.filters {
			display: flex;
			position: sticky;
			top: 84px;
			/* Taller than the viewport: scroll inside, or the bottom filters are unreachable. */
			max-height: calc(100vh - 100px);
			overflow-y: auto;
			overscroll-behavior: contain;
			scrollbar-width: thin;
		}
	}
</style>
