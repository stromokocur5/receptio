import type { Ingredient, RecipeSummary } from './types';

/** A garnish of fresh herbs (4 PL koriandra ≈ 8 g) doesn't make a dish need a shop. */
const MIN_GRAMS = 10;

/** Fresh vegetables or fruit that won't last until a shop two or three weeks away. */
export const isPerishable = (i: Ingredient) =>
	(i.category === 'zelenina' || i.category === 'ovocie') && !i.shelf;

/**
 * Fresh produce in the recipe that won't keep until the next big shop – nothing left means it
 * cooks from the freezer, the pantry and vegetables that last weeks.
 */
export function freshProduce(
	recipe: Pick<RecipeSummary, 'lines'>,
	byId: Map<string, Ingredient>
): Ingredient[] {
	const grams = new Map<string, number>();
	for (const line of recipe.lines) {
		if (line.notEaten) continue;
		grams.set(line.ingredientId, (grams.get(line.ingredientId) ?? 0) + line.grams);
	}
	return [...grams]
		.map(([id, g]) => [byId.get(id)!, g] as const)
		.filter(([i, g]) => g >= MIN_GRAMS && isPerishable(i))
		.map(([i]) => i);
}

/**
 * How to cook the recipe without a fresh shop: as it is (`{}`), as one of its versions (the
 * automatic "Zo zásob" or the one from dry legumes), or not at all (undefined).
 */
export function storesVersion(
	recipe: Pick<RecipeSummary, 'lines' | 'variants'>,
	byId: Map<string, Ingredient>
): { variant?: string } | undefined {
	if (!freshProduce(recipe, byId).length) return {};
	const variant = recipe.variants.find((v) => !freshProduce(v, byId).length);
	return variant && { variant: variant.name };
}
