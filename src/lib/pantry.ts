import type { Ingredient, RecipeLine, RecipeSummary } from './types';

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

/** Grams available per ingredient group (in the group's reference form), Infinity when not weighed. */
export function pantryByGroup(pantry: Pantry, byId: Map<string, Ingredient>): Map<string, number> {
	const groups = new Map<string, number>();
	for (const [id, grams] of Object.entries(pantry)) {
		const ingredient = byId.get(id);
		if (!ingredient) continue;
		const current = groups.get(ingredient.group) ?? 0;
		groups.set(
			ingredient.group,
			grams === null ? Infinity : current + grams * ingredient.groupFactor
		);
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
		entry.grams += line.grams * ingredient.groupFactor;
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

export interface PantryUse {
	ingredient: Ingredient;
	grams: number;
	/** Nothing of it left, so it was removed from the pantry. */
	usedUp: boolean;
}

/**
 * Takes what a cooked recipe used out of the pantry. Interchangeable ingredients (same group)
 * count, the exact one first. Items without a weight ("have some") stay untouched, and
 * anything that runs out is removed.
 */
export function consumeFromPantry(
	pantry: Pantry,
	lines: RecipeLine[],
	factor: number,
	byId: Map<string, Ingredient>
): { pantry: Pantry; used: PantryUse[] } {
	const next: Pantry = { ...pantry };
	const used = new Map<string, PantryUse>();

	for (const line of lines) {
		const ingredient = byId.get(line.ingredientId);
		if (!ingredient || line.grams <= 0) continue;
		// Tracked in the group's reference form, so dry and canned chickpeas trade fairly.
		let needed = line.grams * factor * ingredient.groupFactor;
		const sameGroup = Object.keys(next)
			.filter((id) => byId.get(id)?.group === ingredient.group)
			.sort((a, b) => Number(b === ingredient.id) - Number(a === ingredient.id));

		for (const id of sameGroup) {
			const have = next[id];
			if (have === null || have === undefined || needed <= 0) continue;
			const itemFactor = byId.get(id)!.groupFactor;
			const take = Math.min(have, needed / itemFactor);
			needed -= take * itemFactor;
			const left = Math.round(have - take);
			if (left <= 0) delete next[id];
			else next[id] = left;
			const prev = used.get(id);
			used.set(id, {
				ingredient: byId.get(id)!,
				grams: (prev?.grams ?? 0) + take,
				usedUp: left <= 0
			});
		}
	}
	return { pantry: next, used: [...used.values()] };
}

export interface LeftoverMatch {
	recipe: RecipeSummary;
	/** How many of the chosen leftovers the recipe uses. */
	uses: Ingredient[];
	/** Other ingredients to buy or have (spices and oils not counted). */
	others: Ingredient[];
}

/**
 * Recipes that use up the chosen leftovers (half a zucchini, yesterday's rice): most leftovers
 * used first, then the fewest other ingredients needed. Interchangeable forms count (group).
 */
export function rankByLeftovers(
	recipes: RecipeSummary[],
	leftoverIds: string[],
	byId: Map<string, Ingredient>
): LeftoverMatch[] {
	const groups = new Set(leftoverIds.map((id) => byId.get(id)?.group).filter(Boolean));
	return recipes
		.map((recipe) => {
			const ingredients = [...new Set(recipe.lines.map((l) => l.ingredientId))].map((id) =>
				byId.get(id)!
			);
			return {
				recipe,
				uses: ingredients.filter((i) => groups.has(i.group)),
				others: ingredients.filter((i) => !groups.has(i.group) && !isAssumedAtHome(i))
			};
		})
		.filter((m) => m.uses.length > 0)
		.sort((a, b) => b.uses.length - a.uses.length || a.others.length - b.others.length);
}
