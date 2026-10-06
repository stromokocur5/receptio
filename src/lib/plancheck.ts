import type { Ingredient, RecipeComputed, RecipeSummary } from './types';

/**
 * A quick look at whether the planned week is balanced: protein sources, vegetables, treats.
 * Only the planned meals count (the plan holds lunches and dinners, not breakfasts or snacks).
 */

export interface PlanCheckEntry {
	recipe: RecipeSummary;
	/** The variant's data when one is chosen, else the recipe's. */
	data: RecipeComputed;
	servings: number;
}

export interface PlanTip {
	level: 'ok' | 'tip';
	text: string;
}

/** Grams of vegetables per person and day the plan should bring at least (of 400 g fruit + veg). */
export const VEG_GRAMS_PER_DAY = 200;
/** Share of meals that should bring legumes, tofu or tempeh. */
export const PROTEIN_MEAL_SHARE = 0.5;
/** "Na občas" meals a week before it's worth a word. */
export const TREATS_PER_WEEK = 2;

const isProteinSource = (i: Ingredient | undefined) =>
	i?.category === 'strukoviny' || i?.category === 'bielkoviny';

export function planCheck(
	entries: PlanCheckEntry[],
	ingredientsById: Map<string, Ingredient>,
	days: number,
	people: number
): PlanTip[] {
	if (!entries.length) return [];
	const meals = entries.length;
	const withProtein = entries.filter((e) =>
		e.data.lines.some((l) => !l.notEaten && isProteinSource(ingredientsById.get(l.ingredientId)))
	).length;
	const vegGrams = entries.reduce((sum, e) => {
		const share = e.servings / e.recipe.servings;
		const grams = e.data.lines
			.filter((l) => !l.notEaten && ingredientsById.get(l.ingredientId)?.category === 'zelenina')
			.reduce((g, l) => g + l.grams, 0);
		return sum + grams * share;
	}, 0);
	const vegPerDay = vegGrams / Math.max(1, days * people);
	const treats = entries.filter((e) => e.data.treat.length > 0).length;

	const tips: PlanTip[] = [];
	if (withProtein / meals < PROTEIN_MEAL_SHARE) {
		tips.push({
			level: 'tip',
			text: `Strukoviny, tofu alebo tempeh má ${withProtein} z ${meals} jedál. Daj ich aspoň do polovice – sú hlavný zdroj bielkovín, železa a zinku.`
		});
	} else {
		tips.push({
			level: 'ok',
			text: `Strukoviny alebo tofu má ${withProtein} z ${meals} jedál.`
		});
	}
	const vegRounded = Math.round(vegPerDay / 10) * 10;
	if (vegPerDay < VEG_GRAMS_PER_DAY) {
		tips.push({
			level: 'tip',
			text: `Zeleniny je v pláne asi ${vegRounded} g na osobu a deň. Odporúča sa 400 g ovocia a zeleniny denne – pridaj k jedlám šalát alebo zeleninovú prílohu.`
		});
	} else {
		tips.push({ level: 'ok', text: `Zeleniny asi ${vegRounded} g na osobu a deň.` });
	}
	const weeks = Math.max(1, days / 7);
	if (treats / weeks > TREATS_PER_WEEK) {
		tips.push({
			level: 'tip',
			text: `${treats} jedál je „na občas“ (vyprážané, tučné alebo sladké). Pri niektorých skús ľahšiu verziu.`
		});
	}
	return tips;
}
