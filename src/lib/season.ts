import type { Ingredient, RecipeSummary } from './types';

/** Seasonal produce below this weight (a garnish of herbs) doesn't make a dish seasonal. */
const MIN_GRAMS = 50;

/** "v septembri" – the locative the UI needs after "v". */
export const IN_MONTH = [
	'v januári',
	'vo februári',
	'v marci',
	'v apríli',
	'v máji',
	'v júni',
	'v júli',
	'v auguste',
	'v septembri',
	'v októbri',
	'v novembri',
	'v decembri'
];

export const MONTH_NAMES = [
	'január',
	'február',
	'marec',
	'apríl',
	'máj',
	'jún',
	'júl',
	'august',
	'september',
	'október',
	'november',
	'december'
];

/**
 * Seasonal produce a recipe is built on, and whether all of it is in season in `month`
 * (1–12). Recipes without seasonal produce are never "in season" – they're year-round.
 */
export function recipeSeason(
	recipe: Pick<RecipeSummary, 'lines'>,
	byId: Map<string, Ingredient>,
	month: number
): { produce: Ingredient[]; inSeason: boolean } {
	const grams = new Map<string, number>();
	for (const line of recipe.lines) {
		grams.set(line.ingredientId, (grams.get(line.ingredientId) ?? 0) + line.grams);
	}
	const produce = [...grams]
		.filter(([id, g]) => g >= MIN_GRAMS && (byId.get(id)?.season.length ?? 0) > 0)
		.map(([id]) => byId.get(id)!);
	return {
		produce,
		inSeason: produce.length > 0 && produce.every((i) => i.season.includes(month))
	};
}
