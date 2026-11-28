import { shiftDate, type Journal } from './journal';
import { isAssumedAtHome } from './pantry';
import { salesOn, type PriceHistory } from './price-history';
import type { CookedRecord } from './week';
import type { Ingredient, RecipeSummary } from './types';

/** What the user's own cooking adds up to, all from data kept on the device. */
export interface CookingStats {
	/** Times anything was cooked. */
	total: number;
	thisMonth: number;
	lastMonth: number;
	/** Different recipes cooked at least once. */
	recipes: number;
	/** Cuisines of the world cooked from at least once. */
	cuisines: number;
	/** What this month's and last month's cooking cost (whole batches). */
	costThisMonth: number;
	costLastMonth: number;
	/** Average price of a cooked portion. */
	perPortion: number;
	/** Most cooked recipes, most first (at most three, cooked at least twice). */
	favourites: { recipeId: string; count: number }[];
}

const monthOf = (iso: string) => iso.slice(0, 7);

export function cookingStats(
	history: CookedRecord[],
	recipesById: Map<string, RecipeSummary>,
	today: string
): CookingStats {
	const thisMonth = monthOf(today);
	const lastMonth = monthOf(shiftDate(`${thisMonth}-01`, -1));
	const counts = new Map<string, number>();
	const cuisines = new Set<string>();
	let total = 0;
	let inMonth = 0;
	let inLastMonth = 0;
	let costThisMonth = 0;
	let costLastMonth = 0;
	let cost = 0;
	let portions = 0;
	for (const h of history) {
		const recipe = recipesById.get(h.recipeId);
		if (!recipe) continue;
		const data = (h.variant && recipe.variants.find((v) => v.name === h.variant)) || recipe;
		const batch = data.costPerServing * h.servings;
		total++;
		counts.set(h.recipeId, (counts.get(h.recipeId) ?? 0) + 1);
		cuisines.add(recipe.cuisine);
		cost += batch;
		portions += h.servings;
		if (monthOf(h.date) === thisMonth) {
			inMonth++;
			costThisMonth += batch;
		} else if (monthOf(h.date) === lastMonth) {
			inLastMonth++;
			costLastMonth += batch;
		}
	}
	return {
		total,
		thisMonth: inMonth,
		lastMonth: inLastMonth,
		recipes: counts.size,
		cuisines: cuisines.size,
		costThisMonth,
		costLastMonth,
		perPortion: portions ? cost / portions : 0,
		favourites: [...counts]
			.filter(([, count]) => count >= 2)
			.sort((a, b) => b[1] - a[1])
			.slice(0, 3)
			.map(([recipeId, count]) => ({ recipeId, count }))
	};
}

/**
 * Days in a row, up to today, on which `done` holds. Today not done yet doesn't break the
 * streak – it counts from yesterday then.
 */
export function streak(done: (date: string) => boolean, today: string, max = 365): number {
	let date = done(today) ? today : shiftDate(today, -1);
	let days = 0;
	while (days < max && done(date)) {
		days++;
		date = shiftDate(date, -1);
	}
	return days;
}

/** Days in a row with the water goal reached. */
export function waterStreak(journal: Journal, today: string): number {
	return streak((d) => {
		const ml = journal.days[d]?.waterMl ?? journal.summaries[d]?.waterMl ?? 0;
		return ml >= journal.waterGoalMl;
	}, today);
}

/** Days in a row with every supplement ticked off. */
export function supplementStreak(journal: Journal, today: string): number {
	const ids = journal.supplements.map((s) => s.id);
	if (!ids.length) return 0;
	return streak((d) => {
		const taken = new Set(journal.days[d]?.taken ?? []);
		return ids.every((id) => taken.has(id));
	}, today);
}

/** The version of a recipe that was cooked: a variant when one was chosen. */
const cookedData = (h: CookedRecord, recipe: RecipeSummary) =>
	(h.variant && recipe.variants.find((v) => v.name === h.variant)) || recipe;

export interface MonthCooking {
	/** YYYY-MM */
	month: string;
	cooked: number;
	portions: number;
	cost: number;
}

/** Cooking per month for the last `months` months, oldest first, empty months included. */
export function monthlyCooking(
	history: CookedRecord[],
	recipesById: Map<string, RecipeSummary>,
	today: string,
	months = 6
): MonthCooking[] {
	const result: MonthCooking[] = [];
	let first = `${today.slice(0, 7)}-01`;
	for (let i = 0; i < months; i++) {
		result.unshift({ month: first.slice(0, 7), cooked: 0, portions: 0, cost: 0 });
		first = `${shiftDate(first, -1).slice(0, 7)}-01`;
	}
	const byMonth = new Map(result.map((m) => [m.month, m]));
	for (const h of history) {
		const month = byMonth.get(monthOf(h.date));
		const recipe = recipesById.get(h.recipeId);
		if (!month || !recipe) continue;
		month.cooked++;
		month.portions += h.servings;
		month.cost += cookedData(h, recipe).costPerServing * h.servings;
	}
	return result;
}

/**
 * A rough price of a plant-based lunch menu in a Slovak town, to put home cooking in
 * perspective. Shown labelled as an estimate.
 */
export const RESTAURANT_MEAL_EUR = 8;

/** Lunches and dinners cooked at home – the meals a restaurant would otherwise serve. */
export function mealPortions(
	history: CookedRecord[],
	recipesById: Map<string, RecipeSummary>
): { portions: number; cost: number } {
	let portions = 0;
	let cost = 0;
	for (const h of history) {
		const recipe = recipesById.get(h.recipeId);
		if (!recipe || !recipe.meals.some((m) => m === 'obed' || m === 'vecera')) continue;
		portions += h.servings;
		cost += cookedData(h, recipe).costPerServing * h.servings;
	}
	return { portions, cost };
}

/**
 * Categories that don't count toward plant variety: oils, sauces and syrups (processed, eaten in
 * spoonfuls), salt-and-sugar basics, vegan substitutes.
 */
const NOT_PLANTS = new Set(['oleje', 'omacky-pasty', 'ine', 'nahrady']);

/**
 * Different plants eaten in the last 7 days, from cooked recipes. Spices and herbs count as
 * a quarter each, the usual way the "30 plants a week" goal is counted. Lists hold one
 * ingredient id per plant (dry and canned chickpeas are one plant).
 */
export function plantsThisWeek(
	history: CookedRecord[],
	recipesById: Map<string, RecipeSummary>,
	ingredientsById: Map<string, Ingredient>,
	today: string
): { score: number; plants: string[]; spices: string[] } {
	const from = shiftDate(today, -6);
	const plants = new Map<string, string>();
	const spices = new Map<string, string>();
	for (const h of history) {
		if (h.date < from || h.date > today) continue;
		const recipe = recipesById.get(h.recipeId);
		if (!recipe) continue;
		for (const line of cookedData(h, recipe).lines) {
			const ingredient = ingredientsById.get(line.ingredientId);
			if (!ingredient || line.notEaten || NOT_PLANTS.has(ingredient.category)) continue;
			if (ingredient.id === 'sol') continue;
			const kind = ingredient.category === 'koreniny' ? spices : plants;
			if (!kind.has(ingredient.group)) kind.set(ingredient.group, ingredient.id);
		}
	}
	for (const group of plants.keys()) spices.delete(group);
	return {
		score: plants.size + spices.size / 4,
		plants: [...plants.values()],
		spices: [...spices.values()]
	};
}

export interface WeekNutrition {
	/** First day of the week (7 days ending on the last). */
	from: string;
	to: string;
	/** Average per day for one person, from cooked meals only. */
	protein: number;
	fiber: number;
	portions: number;
}

/** Protein and fiber per day, week by week, oldest first. */
export function weeklyNutrition(
	history: CookedRecord[],
	recipesById: Map<string, RecipeSummary>,
	people: number,
	today: string,
	weeks = 8
): WeekNutrition[] {
	return Array.from({ length: weeks }, (_, i) => {
		const to = shiftDate(today, -7 * (weeks - 1 - i));
		const from = shiftDate(to, -6);
		let protein = 0;
		let fiber = 0;
		let portions = 0;
		for (const h of history) {
			if (h.date < from || h.date > to) continue;
			const recipe = recipesById.get(h.recipeId);
			if (!recipe) continue;
			const data = cookedData(h, recipe);
			const mine = h.servings / people;
			protein += data.perServing.protein * mine;
			fiber += data.perServing.fiber * mine;
			portions += mine;
		}
		return { from, to, protein: protein / 7, fiber: fiber / 7, portions };
	});
}

/** Ingredients cooked with most, by weight, heaviest first (water and salt left out). */
export function topIngredients(
	history: CookedRecord[],
	recipesById: Map<string, RecipeSummary>,
	limit = 8
): { ingredientId: string; grams: number }[] {
	const grams = new Map<string, number>();
	for (const h of history) {
		const recipe = recipesById.get(h.recipeId);
		if (!recipe) continue;
		const scale = h.servings / recipe.servings;
		for (const line of cookedData(h, recipe).lines) {
			if (line.ingredientId === 'voda' || line.ingredientId === 'sol') continue;
			grams.set(line.ingredientId, (grams.get(line.ingredientId) ?? 0) + line.grams * scale);
		}
	}
	return [...grams]
		.sort((a, b) => b[1] - a[1])
		.slice(0, limit)
		.map(([ingredientId, g]) => ({ ingredientId, grams: g }));
}

/** How far back cooking counts toward what someone usually buys. */
export const USUAL_DAYS = 60;

/**
 * What the user buys: the ingredients of what they cooked lately and of what's planned, the
 * shop-bought ones only (no spices, oils or leftovers from other food).
 */
export function usualIngredients(
	history: CookedRecord[],
	planned: Omit<CookedRecord, 'date'>[],
	recipesById: Map<string, RecipeSummary>,
	byId: Map<string, Ingredient>,
	today: string
): Set<string> {
	const from = shiftDate(today, -USUAL_DAYS);
	const ids = new Set<string>();
	const recent = history.filter((h) => h.date >= from && h.date <= today);
	for (const h of [...recent, ...planned.map((p) => ({ ...p, date: today }))]) {
		const recipe = recipesById.get(h.recipeId);
		if (!recipe) continue;
		for (const line of cookedData(h, recipe).lines) {
			const i = byId.get(line.ingredientId);
			if (i && !i.byproduct && !isAssumedAtHome(i)) ids.add(i.id);
		}
	}
	return ids;
}

/**
 * What cooking on sale days could have saved: for every cooked meal, the ingredients that were
 * on sale that day in the user's shops, at the sale price instead of the regular one. An
 * estimate – the app doesn't know where things were actually bought.
 */
export function saleSavings(
	history: CookedRecord[],
	recipesById: Map<string, RecipeSummary>,
	prices: PriceHistory,
	storeIds: string[]
): { total: number; meals: number } {
	const salesByDay = new Map<string, Map<string, number>>();
	let total = 0;
	let meals = 0;
	for (const h of history) {
		const recipe = recipesById.get(h.recipeId);
		if (!recipe) continue;
		let perKg = salesByDay.get(h.date);
		if (!perKg) {
			perKg = new Map(
				salesOn(prices, h.date, storeIds).map((s) => [s.ingredientId, s.regularPerKg - s.salePerKg])
			);
			salesByDay.set(h.date, perKg);
		}
		const scale = h.servings / recipe.servings;
		let saved = 0;
		for (const line of cookedData(h, recipe).lines) {
			const saving = perKg.get(line.ingredientId);
			if (saving) saved += (saving * line.grams * scale) / 1000;
		}
		if (saved > 0) {
			total += saved;
			meals++;
		}
	}
	return { total, meals };
}

export interface Milestone {
	label: string;
	done: boolean;
	/** Where the user is toward it, e.g. 7 of 10. */
	progress: number;
	goal: number;
}

/** Steps worth celebrating, the next unreached one of each kind included. */
export function milestones(
	stats: Pick<CookingStats, 'total' | 'recipes' | 'cuisines'>,
	cuisineCount: number,
	cookingStreak: number
): Milestone[] {
	const ladder = (value: number, steps: number[], label: (n: number) => string) => {
		const reached = steps.filter((s) => value >= s);
		const next = steps.find((s) => value < s);
		return [
			...reached.slice(-2).map((s) => ({ label: label(s), done: true, progress: s, goal: s })),
			...(next ? [{ label: label(next), done: false, progress: value, goal: next }] : [])
		];
	};
	return [
		...ladder(stats.total, [1, 10, 25, 50, 100, 250], (n) =>
			n === 1 ? 'Prvé varenie' : `${n}× uvarené`
		),
		...ladder(stats.recipes, [5, 20, 50, 100], (n) => `${n} rôznych receptov`),
		...ladder(stats.cuisines, [3, 10, cuisineCount], (n) =>
			n === cuisineCount ? 'Všetky kuchyne sveta' : `${n} ${n < 5 ? 'kuchyne' : 'kuchýň'} sveta`
		),
		...ladder(cookingStreak, [3, 7, 14, 30], (n) => `${n} ${n < 5 ? 'dni' : 'dní'} varenia po sebe`)
	];
}
