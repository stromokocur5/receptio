import { shiftDate, type Journal } from './journal';
import type { CookedRecord } from './week';
import type { RecipeSummary } from './types';

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
