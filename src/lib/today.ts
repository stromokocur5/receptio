import { matchRecipe, pantryByGroup, type Pantry, type PantryMatch } from './pantry';
import { recipeSeason } from './season';
import type { Ingredient, RecipeSummary } from './types';

export interface TodayOptions {
	pantry: Pantry;
	/** 1–12. */
	month: number;
	/** Longest total time in minutes; 0 = any. */
	maxTime: number;
	/** Recipes cooked in the last days or already offered – not suggested again. */
	skip: ReadonlySet<string>;
	/** Changes the pick; the same seed gives the same three. */
	seed: number;
}

export interface TodayPick {
	recipe: RecipeSummary;
	/** Present when the pantry has something in it. */
	match?: PantryMatch;
	inSeason: boolean;
}

export const TODAY_COUNT = 3;

/** How much luck may outweigh a better pantry match, so the pick isn't the same every day. */
const LUCK = 0.35;
const SEASON_BONUS = 0.25;
/** Below this a "lunch" is a side dish or a dip. */
const MIN_KCAL = 300;

/** A stable pseudo-random 0–1 for a recipe and seed (FNV-1a). */
function luck(id: string, seed: number): number {
	let h = 2166136261 ^ seed;
	for (let i = 0; i < id.length; i++) {
		h ^= id.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return (h >>> 0) / 4294967295;
}

/**
 * Three everyday lunches or dinners for today: closest to what's at home, in season when
 * possible, quick enough, and each from a different cuisine.
 */
export function pickToday(
	recipes: RecipeSummary[],
	byId: Map<string, Ingredient>,
	o: TodayOptions
): TodayPick[] {
	const groups = pantryByGroup(o.pantry, byId);
	const hasPantry = groups.size > 0;
	const scored = recipes
		.filter(
			(r) =>
				(r.meals.includes('obed') || r.meals.includes('vecera')) &&
				r.treat.length === 0 &&
				r.perServing.kcal >= MIN_KCAL &&
				!r.ahead &&
				(!o.maxTime || r.time <= o.maxTime) &&
				!o.skip.has(r.id)
		)
		.map((recipe) => {
			const match = hasPantry ? matchRecipe(recipe, groups, byId) : undefined;
			const inSeason = recipeSeason(recipe, byId, o.month).inSeason;
			const score =
				(match?.score ?? 0) + (inSeason ? SEASON_BONUS : 0) + luck(recipe.id, o.seed) * LUCK;
			return { recipe, match, inSeason, score };
		})
		.sort((a, b) => b.score - a.score);

	const picks: TodayPick[] = [];
	const cuisines = new Set<string>();
	for (const { recipe, match, inSeason } of scored) {
		if (cuisines.has(recipe.cuisine)) continue;
		cuisines.add(recipe.cuisine);
		picks.push({ recipe, match, inSeason });
		if (picks.length === TODAY_COUNT) break;
	}
	return picks;
}
