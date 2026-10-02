import { emptyNutrients } from './nutrition';
import type { Nutrients, RecipeSummary } from './types';

export interface CookedRecord {
	recipeId: string;
	variant?: string;
	servings: number;
	date: string;
}

export interface WeekSummary {
	/** Cooked portions one person ate over the period. */
	portions: number;
	/** Average per day, from cooked Receptio meals only. */
	perDay: Nutrients;
	cost: number;
}

/**
 * What one person got from meals cooked in the last `days` days: every cooked batch is split
 * among `people`, the rest (breakfasts from elsewhere, snacks) isn't known.
 */
export function weekSummary(
	history: CookedRecord[],
	recipesById: Map<string, RecipeSummary>,
	people: number,
	today: Date,
	days = 7
): WeekSummary {
	const from = new Date(today);
	from.setDate(from.getDate() - (days - 1));
	const fromIso = from.toISOString().slice(0, 10);
	const total = emptyNutrients();
	let portions = 0;
	let cost = 0;
	for (const h of history) {
		if (h.date < fromIso) continue;
		const recipe = recipesById.get(h.recipeId);
		if (!recipe) continue;
		const data = (h.variant && recipe.variants.find((v) => v.name === h.variant)) || recipe;
		const mine = h.servings / people;
		portions += mine;
		cost += data.costPerServing * mine;
		for (const key of Object.keys(total) as (keyof Nutrients)[]) {
			total[key] += data.perServing[key] * mine;
		}
	}
	const perDay = emptyNutrients();
	for (const key of Object.keys(total) as (keyof Nutrients)[]) perDay[key] = total[key] / days;
	return { portions, perDay, cost };
}
