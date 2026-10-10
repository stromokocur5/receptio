<script lang="ts">
	import { cleanSearchTerm } from '$lib/search-miss';
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
		splitCategory,
		type CategoryId
	} from '$lib/categories';
	import Icon, { type IconName } from '$lib/components/Icon.svelte';
	import CategoryTiles from '$lib/components/CategoryTiles.svelte';
	import RecipeCard from '$lib/components/RecipeCard.svelte';
	import {
		CATEGORY_LABELS,
		MEAL_LABELS,
		countTerms,
		normalizeSearch,
		searchMatcher,
		termsFound,
		pluralRecipes
	} from '$lib/labels';
	import {
		ALLERGEN_LABELS,
		COMPUTED_TAG_LABELS,
		SALT_HIGH_G,
		computedTags,
		cookingStyle,
		everydayVersion
	} from '$lib/nutrition';
	import { recipeSeason } from '$lib/season';
	import { isAssumedAtHome, rankByPantry, type PantryMatch } from '$lib/pantry';
	import { avoidFilter, isAvoiding, missableTools, shortName } from '$lib/avoid';
	import { hasNeeds, householdFilter } from '$lib/household';
	import { household, tableMembers, tableNeeds } from '$lib/household.svelte';
	import {
		LIST_SEARCH_KEY,
		MAX_PRESETS,
		avoid,
		likes,
		pantry,
		presets,
		ui
	} from '$lib/state.svelte';
	import IngredientExcluder from '$lib/components/IngredientExcluder.svelte';
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
	const PROTEIN_MAX = 40;
	/** Calorie caps per serving; the last step means no cap. */
	const KCAL_STEPS = [300, 400, 500, 600, 700, 800, 0] as const;

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
	let maxKcalIndex = $state(KCAL_STEPS.length - 1);
	const maxKcal = $derived(KCAL_STEPS[maxKcalIndex]);
	let excluded = $state<Allergen[]>([]);
	let missingTools = $state<string[]>([]);
	let taste = $state<Taste | ''>('');
	/** Ingredient ids; a recipe is hidden when it uses anything from the same group. */
	let withoutIngredients = $state<string[]>([]);
	/** Ingredient ids picked without a pantry; a recipe must use each (in any form). */
	let withIngredients = $state<string[]>([]);
	const MAX_WITH = 6;
	/** Yes/no picks kept in the `rychlo` URL param: how it's cooked, in season, low salt, not a treat. */
	const QUICK = [
		'jeden-hrniec',
		'bez-varenia',
		'len-rura',
		'sezonne',
		'menej-soli',
		'na-kazdy-den'
	] as const;
	type Quick = (typeof QUICK)[number];
	const COOKING_STYLES = ['jeden-hrniec', 'bez-varenia', 'len-rura'] as const;
	const QUICK_LABELS: Record<Quick, string> = {
		'jeden-hrniec': COMPUTED_TAG_LABELS['jeden-hrniec'],
		'bez-varenia': COMPUTED_TAG_LABELS['bez-varenia'],
		'len-rura': COMPUTED_TAG_LABELS['len-rura'],
		sezonne: 'V sezóne',
		'menej-soli': 'Menej soli',
		'na-kazdy-den': 'Na každý deň'
	};
	const DIFFICULTY_LABELS = ['', 'Jednoduché', 'Stredné', 'Náročnejšie'] as const;
	const GF_LABELS = ['Všetko', 'Bezlepkové', 'Aj s bezlepkovou verziou'] as const;

	/** The filter panel's sections; a crowded list of 14 filters was hard to take in. */
	type Group = 'chut' | 'cas' | 'strava' | 'doma';
	let openGroups = $state<Record<Group, boolean>>({
		chut: true,
		cas: true,
		strava: false,
		doma: false
	});
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

	const toolOptions = $derived(
		missableTools(catalog.equipment, catalog.recipes, [...missingTools, ...avoid.current.tools])
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
	const wantedGroups = $derived(
		withIngredients.map((id) => catalog.ingredientsById.get(id)?.group ?? id)
	);
	/** What else a recipe needs beyond the picked ingredients and the basics everyone has. */
	const extraCount = (r: RecipeSummary) =>
		new Set(
			r.lines
				.map((l) => catalog.ingredientsById.get(l.ingredientId))
				.filter((i) => i && !wantedGroups.includes(i.group) && !isAssumedAtHome(i))
				.map((i) => i!.id)
		).size;
	const nameOf = (id: string) => shortName(catalog.ingredientsById.get(id)?.name ?? id);

	/** What Špajza says is never at home; one switch turns it off for this visit. */
	let ignoreAvoid = $state(false);
	const avoiding = $derived(ui.loaded && !ignoreAvoid && isAvoiding(avoid.current));
	const allowedByAvoid = $derived(avoidFilter(avoid.current, catalog.ingredientsById));

	/** Only what everyone in the household can eat. */
	let forTable = $state(false);
	const needs = $derived(household.doc ? tableNeeds() : null);
	const tableReady = $derived(!!needs && hasNeeds(needs));
	const allowedAtTable = $derived(
		needs ? householdFilter(needs, catalog.ingredientsById) : () => true
	);

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
						// "polievky", "dezerty" or "kari" find recipes by where they're filed.
						...r.categories.map((path) => {
							const { category, sub } = splitCategory(path);
							const subs: Record<string, string> = RECIPE_CATEGORIES[category].subs;
							return `${RECIPE_CATEGORIES[category].label} ${subs[sub] ?? ''}`;
						}),
						...r.tags,
						...r.lines.flatMap((l) => {
							const i = catalog.ingredientsById.get(l.ingredientId);
							return i ? [i.name, ...(i.aliases ?? [])] : [];
						}),
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
			rankByPantry(catalog.recipes, ui.loaded ? pantry.current : {}, catalog.ingredientsById).map(
				(m) => [m.recipe.id, m]
			)
		)
	);
	const hasPantry = $derived(ui.loaded && Object.keys(pantry.current).length > 0);

	const matchesQuery = $derived(searchMatcher([...searchIndex.values()], q));
	/** How many of the searched words are in a recipe's name – those results go first. */
	const titleHits = $derived(
		new Map(
			q.trim() ? catalog.recipes.map((r) => [r.id, termsFound(normalizeSearch(r.title), q)]) : []
		)
	);

	/** Every filter except the category, so the tiles can count what each one would show. */
	function passesFilters(r: RecipeSummary): boolean {
		if (!matchesQuery(searchIndex.get(r.id)!)) return false;
		if (avoiding && !allowedByAvoid(r)) return false;
		if (forTable && tableReady && !allowedAtTable(r)) return false;
		if (gf === 1 && r.gluten === 'contains') return false;
		if (gf === 2 && r.gluten === 'contains' && !r.gfSwappable) return false;
		if (cuisine && r.cuisine !== cuisine) return false;
		if (meal && !r.meals.includes(meal)) return false;
		if (maxTime && r.time > maxTime) return false;
		if (r.perServing.protein < minProtein) return false;
		if (maxKcal && (!r.showNutrition || r.perServing.kcal > maxKcal)) return false;
		if (excluded.some((a) => r.allergens.includes(a))) return false;
		if (missingTools.some((t) => r.equipment.includes(t))) return false;
		if (taste && r.taste !== taste) return false;
		if (excludedGroups.length) {
			const groups = recipeGroups.get(r.id)!;
			if (excludedGroups.some((g) => groups.has(g))) return false;
		}
		if (wantedGroups.length) {
			const groups = recipeGroups.get(r.id)!;
			if (!wantedGroups.every((g) => groups.has(g))) return false;
		}
		for (const q of quick) {
			if (q === 'sezonne') {
				if (!recipeSeason(r, catalog.ingredientsById, month).inSeason) return false;
			} else if (q === 'menej-soli') {
				if (!lowSalt(r)) return false;
			} else if (q === 'na-kazdy-den') {
				if (!everydayVersion(r)) return false;
			} else if (cookingStyle(r.equipment) !== q) {
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
				(titleHits.get(b.id) ?? 0) - (titleHits.get(a.id) ?? 0) ||
				// Picked ingredients: the recipes that need the least on top of them go first.
				(wantedGroups.length ? extraCount(a) - extraCount(b) : 0) ||
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

	const MAX_NEAREST = 4;
	/**
	 * What to offer when nothing matches: the same search without the filters, or – when the
	 * words aren't found together anywhere – the recipes that have the most of them.
	 */
	const nearest = $derived.by((): { kind: 'filters' | 'words' | 'none'; list: RecipeSummary[] } => {
		if (results.length || !q.trim()) return { kind: 'none', list: [] };
		const byRelevance = (a: RecipeSummary, b: RecipeSummary) =>
			(titleHits.get(b.id) ?? 0) - (titleHits.get(a.id) ?? 0) ||
			(likes.counts[b.id] ?? 0) - (likes.counts[a.id] ?? 0);
		const withoutFilters = catalog.recipes
			.filter((r) => matchesQuery(searchIndex.get(r.id)!))
			.sort(byRelevance);
		if (withoutFilters.length) {
			return { kind: 'filters', list: withoutFilters.slice(0, MAX_NEAREST) };
		}
		if (countTerms(q) < 2) return { kind: 'none', list: [] };
		const found = (r: RecipeSummary) => termsFound(searchIndex.get(r.id)!, q);
		return {
			kind: 'words',
			list: catalog.recipes
				.filter((r) => found(r) > 0)
				.sort((a, b) => found(b) - found(a) || byRelevance(a, b))
				.slice(0, MAX_NEAREST)
		};
	});

	// A search no recipe answers, even without filters, tells what to write next. Sent once per
	// term and only after typing stops, so half-typed words don't count.
	const reportedMisses = new Set<string>();
	$effect(() => {
		if (results.length || nearest.kind === 'filters') return;
		const term = cleanSearchTerm(q);
		if (!term || reportedMisses.has(term)) return;
		const timer = setTimeout(() => {
			reportedMisses.add(term);
			void fetch('/api/hladanie', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ term })
			}).catch(() => {});
		}, 2500);
		return () => clearTimeout(timer);
	});

	/** Keeps the search, drops everything that narrows it. */
	function clearFilters() {
		const query = q;
		reset();
		q = query;
	}

	/** A random recipe from what the current filters allow (or from all, if none match). */
	function surprise() {
		const pool = results.length ? results : catalog.recipes;
		const pick = pool[Math.floor(Math.random() * pool.length)];
		if (pick) void goto(`/recepty/${pick.id}`);
	}

	const shown = $derived(results.slice(0, limit));

	interface ActiveFilter {
		key: string;
		label: string;
		group: Group;
		clear: () => void;
	}
	/** Everything narrowing the list (but the category), as chips that undo it one by one. */
	const activeFilters = $derived.by(() => {
		const out: ActiveFilter[] = [];
		const add = (key: string, label: string, group: Group, clear: () => void) =>
			out.push({ key, label, group, clear });
		if (taste) add('taste', TASTE_LABELS[taste], 'chut', () => (taste = ''));
		if (meal) add('meal', MEAL_LABELS[meal], 'chut', () => (meal = ''));
		for (const level of spicy) {
			add(`spicy-${level}`, SPICY_LABELS[level], 'chut', () => toggleSpicy(level));
		}
		if (cuisine) {
			add('cuisine', catalog.cuisinesById.get(cuisine)?.name ?? cuisine, 'chut', () => {
				cuisine = '';
			});
		}
		if (maxTime) {
			add('time', `do ${maxTime} min`, 'cas', () => (maxTimeIndex = TIME_STEPS.length - 1));
		}
		if (difficulty) add('difficulty', DIFFICULTY_LABELS[difficulty], 'cas', () => (difficulty = 0));
		for (const q of quick) {
			const group: Group =
				q === 'menej-soli' || q === 'na-kazdy-den' ? 'strava' : q === 'sezonne' ? 'doma' : 'cas';
			add(`quick-${q}`, QUICK_LABELS[q], group, () => toggleQuick(q));
		}
		if (gf) add('gf', GF_LABELS[gf], 'strava', () => (gf = 0));
		for (const a of excluded) {
			add(`allergen-${a}`, `bez: ${ALLERGEN_LABELS[a]}`, 'strava', () => toggleAllergen(a));
		}
		for (const id of withoutIngredients) {
			add(`without-${id}`, `bez: ${nameOf(id)}`, 'strava', () => {
				withoutIngredients = withoutIngredients.filter((x) => x !== id);
			});
		}
		if (subs !== 'all') {
			add('subs', subs === 'bez' ? 'Bez náhrad' : 'S náhradami', 'strava', () => (subs = 'all'));
		}
		if (minProtein) {
			add('protein', `aspoň ${minProtein} g bielkovín`, 'strava', () => (minProtein = 0));
		}
		if (maxKcal) {
			add('kcal', `do ${maxKcal} kcal`, 'strava', () => (maxKcalIndex = KCAL_STEPS.length - 1));
		}
		for (const id of withIngredients) {
			add(`with-${id}`, `s: ${nameOf(id)}`, 'doma', () => {
				withIngredients = withIngredients.filter((x) => x !== id);
			});
		}
		if (onlyPantry) add('pantry', 'Len z toho, čo mám', 'doma', () => (onlyPantry = false));
		if (forTable && tableReady) {
			add('table', 'Pre celú domácnosť', 'doma', () => (forTable = false));
		}
		if (avoiding) {
			const n = avoid.current.ingredients.length + avoid.current.tools.length;
			const parts = [
				...(n ? [`bez toho, čo nemám (${n})`] : []),
				...(avoid.current.treats ? ['bez fast foodu a jedál na občas'] : [])
			];
			add('avoid', parts.join(', '), 'doma', () => (ignoreAvoid = true));
		}
		for (const id of missingTools) {
			const name = catalog.equipment.find((e) => e.id === id)?.name ?? id;
			add(`tool-${id}`, `nemám: ${name}`, 'doma', () => toggleTool(id));
		}
		return out;
	});
	const activeFilterCount = $derived(activeFilters.length);
	const groupCount = (group: Group) => activeFilters.filter((f) => f.group === group).length;

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
		maxKcalIndex = KCAL_STEPS.length - 1;
		excluded = [];
		missingTools = [];
		taste = '';
		withoutIngredients = [];
		withIngredients = [];
		quick = [];
		subs = 'all';
		difficulty = 0;
		onlyPantry = false;
		forTable = false;
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
		if (maxKcal) p.set('kcal', String(maxKcal));
		if (excluded.length) p.set('alergeny', excluded.join(','));
		if (withoutIngredients.length) p.set('bez', withoutIngredients.join(','));
		if (withIngredients.length) p.set('s', withIngredients.join(','));
		if (sort !== 'odporucane') p.set('sort', sort);
		if (onlyPantry) p.set('spajza', '1');
		if (forTable) p.set('domacnost', '1');
		if (subs !== 'all') p.set('nahrady', subs);
		if (difficulty) p.set('narocnost', String(difficulty));
		if (missingTools.length) p.set('nemam', missingTools.join(','));
		if (quick.length) p.set('rychlo', quick.join(','));
		return p.toString();
	});
	const list = (value: string | null) => (value ?? '').split(',').filter(Boolean);

	/** The filters the current page of results belongs to; set once the URL has been read. */
	let pagedSearch: string | undefined;
	/** Sets every filter from URL params – the page's own URL, or a saved set of filters. */
	function applyParams(p: URLSearchParams) {
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
		// Old links had mild/hot among the quick picks.
		const legacyQuick = list(p.get('rychlo'));
		if (legacyQuick.includes('jemne')) spicy = [0];
		if (legacyQuick.includes('palive')) spicy = [2, 3];
		const time = TIME_STEPS.indexOf(Number(p.get('cas')));
		if (time >= 0) maxTimeIndex = time;
		const protein = Number(p.get('bielkoviny'));
		if (protein > 0 && protein <= PROTEIN_MAX && protein % PROTEIN_STEP === 0) {
			minProtein = protein;
		}
		const kcal = KCAL_STEPS.indexOf(Number(p.get('kcal')) as (typeof KCAL_STEPS)[number]);
		maxKcalIndex = kcal >= 0 && KCAL_STEPS[kcal] ? kcal : KCAL_STEPS.length - 1;
		excluded = list(p.get('alergeny')).filter((a): a is Allergen =>
			(EXCLUDABLE as string[]).includes(a)
		);
		withoutIngredients = [
			...new Set(list(p.get('bez')).filter((id) => catalog.ingredientsById.has(id)))
		];
		withIngredients = [
			...new Set(list(p.get('s')).filter((id) => catalog.ingredientsById.has(id)))
		].slice(0, MAX_WITH);
		const s = p.get('sort');
		if (s && s in SORTS) sort = s as Sort;
		if (p.get('spajza') === '1') onlyPantry = true;
		if (p.get('domacnost') === '1') forTable = true;
		const n = p.get('nahrady');
		if (n === 'bez' || n === 's') subs = n;
		const d = Number(p.get('narocnost'));
		if (d === 1 || d === 2 || d === 3) difficulty = d;
		const tools = new Set(catalog.equipment.map((e) => e.id));
		missingTools = list(p.get('nemam')).filter((id) => tools.has(id));
		quick = list(p.get('rychlo')).filter((q): q is Quick =>
			(QUICK as readonly string[]).includes(q)
		);
	}

	onMount(() => {
		applyParams(new URLSearchParams(location.search));
		for (const f of activeFilters) openGroups[f.group] = true;
		pagedSearch = search;
	});

	/** A saved set, or one of the starters: the whole filter state is replaced. */
	function applySearch(saved: string) {
		reset();
		applyParams(new URLSearchParams(saved));
		for (const f of activeFilters) openGroups[f.group] = true;
	}
	const STARTERS: { label: string; search: string; icon: IconName; tone: string }[] = [
		{ label: 'Do 20 minút', search: 'cas=20', icon: 'clock', tone: 'var(--sky)' },
		{ label: 'Niečo sladké', search: 'chut=sladke', icon: 'cake', tone: 'var(--tomato)' },
		{ label: 'Veľa bielkovín', search: 'bielkoviny=20', icon: 'bean', tone: 'var(--leaf)' },
		{ label: 'Lacno', search: 'sort=cena', icon: 'euro', tone: 'var(--turmeric)' }
	];

	let presetName = $state('');
	let savingPreset = $state(false);
	function savePreset() {
		const name = presetName.trim().slice(0, 40);
		if (!name || !search) return;
		presets.current = [...presets.current.filter((p) => p.name !== name), { name, search }].slice(
			-MAX_PRESETS
		);
		presetName = '';
		savingPreset = false;
	}
	function removePreset(name: string) {
		presets.current = presets.current.filter((p) => p.name !== name);
	}

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
	description="Stovky vegánskych receptov – rýchle večere, polievky, dezerty aj snacky. Pri každom vidíš, koľko stojí porcia a koľko má bielkovín."
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
				{'all' in c ? c.all : `Všetky ${c.label.toLowerCase()}`}
			</button>
			{#each subOptions as [id, label] (id)}
				<button class="chip" aria-pressed={sub === id} onclick={() => (sub = sub === id ? '' : id)}>
					{label} <span class="sub-count">{categoryCounts.get(`${category}/${id}`) ?? 0}</span>
				</button>
			{/each}
		</div>
	{/if}

	<nav class="ideas scroller" aria-label="Rýchly štart">
		<span class="ideas-label">Na čo máš chuť?</span>
		{#each ui.loaded ? presets.current : [] as preset (preset.name)}
			<span class="chip idea preset" style:--tone="var(--plum)">
				<button class="preset-apply" onclick={() => applySearch(preset.search)}
					><span class="idea-ico"><Icon name="star" size={16} /></span> {preset.name}</button
				>
				<button
					class="preset-rm"
					aria-label="Zmazať uložené filtre: {preset.name}"
					onclick={() => removePreset(preset.name)}><Icon name="x" size={14} /></button
				>
			</span>
		{/each}
		{#each STARTERS as starter (starter.label)}
			<button
				class="chip idea"
				style:--tone={starter.tone}
				aria-pressed={search === starter.search}
				onclick={() => applySearch(search === starter.search ? '' : starter.search)}
				><span class="idea-ico"><Icon name={starter.icon} size={16} /></span>
				{starter.label}</button
			>
		{/each}
		<a class="chip idea" href="/spajza" style:--tone="var(--turmeric)"
			><span class="idea-ico"><Icon name="jar" size={16} /></span> Z toho, čo mám doma</a
		>
		<a class="chip idea" href="/zvysky" style:--tone="var(--leaf-2)"
			><span class="idea-ico"><Icon name="history" size={16} /></span> Zo zvyškov</a
		>
		<button class="chip idea" style:--tone="var(--tomato)" onclick={surprise}
			><span class="idea-ico"><Icon name="sparkle" size={16} /></span> Prekvap ma</button
		>
	</nav>

	<div class="layout">
		<aside id="filters" class="filters card" class:open={filtersOpen} aria-label="Filtre">
			<details class="group disclosure" bind:open={openGroups.chut}>
				<summary>
					Chuť a jedlo
					{#if groupCount('chut')}<span class="count">{groupCount('chut')}</span>{/if}
				</summary>
				<div class="group-body">
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
				</div>
			</details>

			<details class="group disclosure" bind:open={openGroups.cas}>
				<summary>
					Čas a námaha
					{#if groupCount('cas')}<span class="count">{groupCount('cas')}</span>{/if}
				</summary>
				<div class="group-body">
					<fieldset>
						<legend>Čas: <strong>{maxTime ? `do ${maxTime} min` : 'hocikoľko'}</strong></legend>
						<input
							type="range"
							min="0"
							max={TIME_STEPS.length - 1}
							step="1"
							bind:value={maxTimeIndex}
							aria-label="Maximálny čas"
							aria-valuetext={maxTime ? `do ${maxTime} minút` : 'hocikoľko'}
						/>
					</fieldset>

					<fieldset>
						<legend>Náročnosť</legend>
						<div class="chips">
							{#each [1, 2, 3] as const as level (level)}
								<button
									class="chip"
									aria-pressed={difficulty === level}
									onclick={() => (difficulty = difficulty === level ? 0 : level)}
								>
									{DIFFICULTY_LABELS[level]}
								</button>
							{/each}
						</div>
					</fieldset>

					<fieldset>
						<legend>Menej riadu</legend>
						<div class="chips">
							{#each COOKING_STYLES as q (q)}
								<button
									class="chip"
									aria-pressed={quick.includes(q)}
									onclick={() => toggleQuick(q)}
								>
									{QUICK_LABELS[q]}
								</button>
							{/each}
						</div>
					</fieldset>
				</div>
			</details>

			<details class="group disclosure" bind:open={openGroups.strava}>
				<summary>
					Strava a alergie
					{#if groupCount('strava')}<span class="count">{groupCount('strava')}</span>{/if}
				</summary>
				<div class="group-body">
					<fieldset>
						<legend>Lepok</legend>
						<div class="chips">
							{#each GF_LABELS as label, i (label)}
								<button class="chip" aria-pressed={gf === i} onclick={() => (gf = i)}
									>{label}</button
								>
							{/each}
						</div>
						{#if gf}
							<p class="hint">
								„Asi bezlepkové“ = niektorá surovina (bujón, tortilly…) môže mať lepok, skontroluj
								etiketu.
							</p>
						{/if}
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
						<IngredientExcluder
							selected={withoutIngredients}
							onchange={(ids) => (withoutIngredients = ids)}
							hint="Skryje aj iné podoby (sušený aj varený cícer). Natrvalo si to nastavíš v Špajzi."
						/>
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
						<legend
							>Bielkoviny: <strong
								>{minProtein ? `aspoň ${minProtein} g/porcia` : 'hocikoľko'}</strong
							></legend
						>
						<input
							type="range"
							min="0"
							max={PROTEIN_MAX}
							step={PROTEIN_STEP}
							bind:value={minProtein}
							aria-label="Minimum bielkovín"
							aria-valuetext={minProtein ? `aspoň ${minProtein} gramov na porciu` : 'hocikoľko'}
						/>
					</fieldset>

					<fieldset>
						<legend
							>Kalórie na porciu: <strong>{maxKcal ? `do ${maxKcal} kcal` : 'hocikoľko'}</strong
							></legend
						>
						<input
							type="range"
							min="0"
							max={KCAL_STEPS.length - 1}
							step="1"
							bind:value={maxKcalIndex}
							aria-label="Najviac kalórií na porciu"
							aria-valuetext={maxKcal ? `do ${maxKcal} kalórií na porciu` : 'hocikoľko'}
						/>
					</fieldset>

					<fieldset>
						<legend>Zdravšie</legend>
						<div class="chips">
							<button
								class="chip"
								aria-pressed={quick.includes('menej-soli')}
								onclick={() => toggleQuick('menej-soli')}
							>
								{QUICK_LABELS['menej-soli']}
							</button>
							<button
								class="chip"
								aria-pressed={quick.includes('na-kazdy-den')}
								onclick={() => toggleQuick('na-kazdy-den')}
								title="Skryje vyprážané, veľmi mastné, sladké a kalorické jedlá, ak nemajú ľahšiu verziu"
							>
								{QUICK_LABELS['na-kazdy-den']}
							</button>
						</div>
					</fieldset>
				</div>
			</details>

			<details class="group disclosure" bind:open={openGroups.doma}>
				<summary>
					Čo mám doma
					{#if groupCount('doma')}<span class="count">{groupCount('doma')}</span>{/if}
				</summary>
				<div class="group-body">
					<fieldset>
						<legend>Chcem v recepte</legend>
						<IngredientExcluder
							selected={withIngredients}
							onchange={(ids) => (withIngredients = ids.slice(0, MAX_WITH))}
							prefix=""
							placeholder="cícer, špenát, ryža…"
							fieldLabel="Surovina, ktorá má byť v recepte"
							hint="Naklikaj pár surovín bez vypĺňania špajze. Ukážem recepty, v ktorých sú všetky – najprv tie, čo potrebujú najmenej ďalšieho."
						/>
					</fieldset>

					<fieldset>
						<legend>Suroviny</legend>
						<div class="chips">
							<button
								class="chip"
								aria-pressed={onlyPantry}
								disabled={!hasPantry}
								onclick={() => (onlyPantry = !onlyPantry)}
							>
								<Icon name="jar" size={16} /> Len z toho, čo mám
							</button>
							<button
								class="chip"
								aria-pressed={quick.includes('sezonne')}
								onclick={() => toggleQuick('sezonne')}
							>
								<Icon name="leaf" size={16} /> V sezóne
							</button>
						</div>
						{#if !hasPantry}
							<p class="hint">
								<a href="/spajza">Nakliknúť špajzu →</a> a ukážem, čo z nej uvaríš.
							</p>
						{/if}
					</fieldset>

					{#if tableReady}
						<fieldset>
							<legend>Domácnosť</legend>
							<div class="chips">
								<button class="chip" aria-pressed={forTable} onclick={() => (forTable = !forTable)}>
									Môže jesť každý ({tableMembers()
										.map((m) => m.name)
										.join(', ')})
								</button>
							</div>
							<p class="hint"><a href="/domacnost">Kto čo neje</a></p>
						</fieldset>
					{/if}

					{#if ui.loaded && isAvoiding(avoid.current)}
						<fieldset>
							<legend>Zo Špajze</legend>
							<div class="chips">
								<button
									class="chip"
									aria-pressed={!ignoreAvoid}
									onclick={() => (ignoreAvoid = !ignoreAvoid)}
								>
									Skryť, čo nemám, nejem a nechcem vidieť
								</button>
							</div>
							<p class="hint"><a href="/spajza#nemam">Upraviť zoznam</a></p>
						</fieldset>
					{/if}

					<fieldset>
						<legend>Nemám doma</legend>
						<div class="chips">
							{#each toolOptions as tool (tool.id)}
								<button
									class="chip"
									aria-pressed={missingTools.includes(tool.id) ||
										(avoiding && avoid.current.tools.includes(tool.id))}
									disabled={avoiding && avoid.current.tools.includes(tool.id)}
									title={avoiding && avoid.current.tools.includes(tool.id)
										? 'Nastavené v Špajzi'
										: undefined}
									onclick={() => toggleTool(tool.id)}
								>
									{tool.name}
								</button>
							{/each}
						</div>
					</fieldset>
				</div>
			</details>

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
			{#if activeFilters.length}
				<ul class="active-filters" aria-label="Zapnuté filtre">
					{#each activeFilters as f (f.key)}
						<li>
							<button class="chip" onclick={f.clear} aria-label="Zrušiť filter: {f.label}">
								{f.label}
								<Icon name="x" size={14} />
							</button>
						</li>
					{/each}
					{#if activeFilters.length > 1}
						<li>
							<button class="btn-link quiet" onclick={reset}>Zrušiť všetko</button>
						</li>
					{/if}
					<li>
						{#if savingPreset}
							<form
								class="preset-form"
								onsubmit={(e) => {
									e.preventDefault();
									savePreset();
								}}
							>
								<label class="sr-only" for="preset-name">Názov uložených filtrov</label>
								<!-- svelte-ignore a11y_autofocus -->
								<input
									class="input sm"
									id="preset-name"
									bind:value={presetName}
									maxlength="40"
									placeholder="Napr. Bežný večer"
									autofocus
								/>
								<button class="btn small" disabled={!presetName.trim()}>Uložiť</button>
								<button type="button" class="btn-link quiet" onclick={() => (savingPreset = false)}
									>Zrušiť</button
								>
							</form>
						{:else}
							<button class="btn-link quiet" onclick={() => (savingPreset = true)}
								><Icon name="star" size={14} /> Uložiť tieto filtre</button
							>
						{/if}
					</li>
				</ul>
			{/if}
			{#if filtered.closest}
				<p class="notice warn closest">
					<Icon name="jar" size={18} />
					<span>
						Len z toho, čo máš doma, sa nedá uvariť nič. Najbližšie sú tieto – chýba im najviac
						{filtered.closest}
						{filtered.closest < 5 ? 'veci' : 'vecí'}.
					</span>
				</p>
			{/if}
			{#if results.length}
				<div class="grid">
					{#each shown as recipe, i (recipe.id)}
						<RecipeCard
							{recipe}
							index={i % PAGE_SIZE}
							match={hasPantry ? matches.get(recipe.id) : undefined}
							matchAlways={sort === 'spajza' || onlyPantry}
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
					{#if nearest.kind === 'filters'}
						<h3>S týmito filtrami nič</h3>
						<p class="muted">
							„{q.trim()}“ tu je, len ho filtre schovali. Bez nich nájdeš napríklad:
						</p>
						<button class="btn" onclick={clearFilters}>Zrušiť filtre, hľadanie nechať</button>
					{:else if nearest.kind === 'words' && nearest.list.length}
						<h3>Všetko naraz v žiadnom recepte nie je</h3>
						<p class="muted">Tieto majú z hľadaného najviac:</p>
					{:else}
						<h3>Nič také tu zatiaľ nie je</h3>
						<p class="muted">
							{#if q.trim()}
								Skús iné slovo alebo surovinu. Ak ti tu recept chýba,
								<a href="/navrhni">napíš mi oň</a> a pridám ho.
							{:else}
								Skús uvoľniť filtre, alebo si recept <a href="/navrhni">vyžiadaj</a> a pridám ho.
							{/if}
						</p>
						<button class="btn" onclick={reset}>Zrušiť filtre</button>
					{/if}
				</div>
				{#if nearest.list.length}
					<div class="grid nearest">
						{#each nearest.list as recipe, i (recipe.id)}
							<RecipeCard {recipe} index={i} />
						{/each}
					</div>
				{/if}
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
		border-radius: var(--radius-sm);
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
		align-items: center;
		margin-top: 14px;
	}
	.ideas-label {
		flex: none;
		margin-right: 4px;
		font-size: 0.85rem;
		font-weight: 650;
		color: var(--muted);
	}
	/* A .chip with a round coloured icon at its start. */
	.idea {
		flex: none;
		gap: 8px;
		padding: 4px 14px 4px 4px;
		color: var(--ink);
		font-size: var(--fs-sm);
		cursor: pointer;
	}
	.idea:hover {
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
		background: var(--alert-bg);
		color: var(--alert-ink);
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
		gap: 14px;
		align-self: start;
	}
	.filters.open {
		display: flex;
		animation: rise 0.35s var(--ease-out);
	}
	.group {
		border-bottom: 1px solid var(--line);
		padding-bottom: 14px;
	}
	.group:last-of-type {
		border-bottom: 0;
		padding-bottom: 0;
	}
	.group summary {
		font-family: var(--font-display);
		font-size: 1.08rem;
		font-weight: 600;
	}
	.group-body {
		display: grid;
		gap: 18px;
		padding-top: 14px;
	}
	.active-filters {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		margin: 0 0 14px;
		padding: 0;
		list-style: none;
	}
	.active-filters .chip {
		background: var(--ink);
		border-color: var(--ink);
		color: var(--paper);
	}
	.idea[aria-pressed='true'] .idea-ico {
		background: color-mix(in srgb, var(--paper) 20%, transparent);
		color: var(--paper);
	}
	.preset {
		padding: 0;
		gap: 0;
	}
	.preset-apply {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 4px;
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		cursor: pointer;
	}
	.preset-rm {
		position: relative;
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		margin-right: 2px;
		border: 0;
		border-radius: 50%;
		background: none;
		color: var(--muted);
		cursor: pointer;
	}
	.preset-rm:hover {
		color: var(--ink);
	}
	/* A bigger hit area than it looks: the × is small but a finger isn't. */
	.preset-rm::before {
		content: '';
		position: absolute;
		inset: -6px;
	}
	.preset-form {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.preset-form input {
		width: 170px;
	}
	.active-filters .btn-link {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		min-height: 36px;
		padding: 0 6px;
		font-size: var(--fs-sm);
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
	.filters .chip {
		max-width: 100%;
		white-space: normal;
		text-align: left;
	}
	.chip:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	fieldset .hint {
		margin: 0;
	}
	.closest {
		margin: 0 0 14px;
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
	.nearest {
		margin-top: 18px;
	}
	.empty h3 {
		margin: 0;
		color: var(--ink);
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
			top: calc(var(--header-h) + var(--sp-5));
			/* Taller than the viewport: scroll inside, or the bottom filters are unreachable. */
			max-height: calc(100dvh - var(--header-h) - var(--sp-6));
			overflow-y: auto;
			overscroll-behavior: contain;
			scrollbar-width: thin;
		}
	}
</style>
