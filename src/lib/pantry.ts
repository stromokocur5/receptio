import type { Ingredient, RecipeSummary } from './types';

/** ingredientId → grams at home, or null for "have enough, didn't weigh it". */
export type Pantry = Record<string, number | null>;

/** Spices and oils rarely get tracked in a pantry, so like staples they never block a match. */
export function isAssumedAtHome(ingredient: Ingredient): boolean {
	return ingredient.staple || ingredient.category === 'koreniny' || ingredient.category === 'oleje';
}

export interface PantryMatch {
	recipe: RecipeSummary;
	have: number;
	needed: number;
	missing: Ingredient[];
	/** Present but not in the quantity the recipe needs. */
	short: Ingredient[];
	score: number;
}

/** Grams available per ingredient group, Infinity when the amount wasn't specified. */
export function pantryByGroup(pantry: Pantry, byId: Map<string, Ingredient>): Map<string, number> {
	const groups = new Map<string, number>();
	for (const [id, grams] of Object.entries(pantry)) {
		const ingredient = byId.get(id);
		if (!ingredient) continue;
		const current = groups.get(ingredient.group) ?? 0;
		groups.set(ingredient.group, grams === null ? Infinity : current + grams);
	}
	return groups;
}

export function matchRecipe(
	recipe: RecipeSummary,
	groups: Map<string, number>,
	byId: Map<string, Ingredient>
): PantryMatch {
	const neededByGroup = new Map<string, { ingredient: Ingredient; grams: number }>();
	for (const line of recipe.lines) {
		const ingredient = byId.get(line.ingredientId)!;
		if (isAssumedAtHome(ingredient)) continue;
		const entry = neededByGroup.get(ingredient.group) ?? { ingredient, grams: 0 };
		entry.grams += line.grams;
		neededByGroup.set(ingredient.group, entry);
	}

	const missing: Ingredient[] = [];
	const short: Ingredient[] = [];
	for (const [group, { ingredient, grams }] of neededByGroup) {
		const available = groups.get(group);
		if (available === undefined) missing.push(ingredient);
		else if (available < grams) short.push(ingredient);
	}

	const needed = neededByGroup.size;
	const have = needed - missing.length;
	const score = needed === 0 ? 1 : (have - short.length * 0.5) / needed;
	return { recipe, have, needed, missing, short, score };
}

export function rankByPantry(
	recipes: RecipeSummary[],
	pantry: Pantry,
	byId: Map<string, Ingredient>
): PantryMatch[] {
	const groups = pantryByGroup(pantry, byId);
	return recipes
		.map((r) => matchRecipe(r, groups, byId))
		.sort((a, b) => b.score - a.score || a.missing.length - b.missing.length);
}
