import { bestPrice } from './pricing';
import { isAssumedAtHome, type Pantry } from './pantry';
import type { Ingredient, IngredientCategory, PriceEntry, RecipeSummary } from './types';

export interface PlanEntry {
	recipeId: string;
	servings: number;
}

export interface ShoppingItem {
	ingredient: Ingredient;
	/** Total needed for the plan. */
	needGrams: number;
	/** Still to buy after subtracting the pantry. */
	buyGrams: number;
	cost: number;
	costIsEstimate: boolean;
	usedIn: string[];
}

export interface ShoppingList {
	byCategory: [IngredientCategory, ShoppingItem[]][];
	/** Spices, oils and basics: listed to double-check, not counted in the total. */
	staples: ShoppingItem[];
	total: number;
	hasEstimates: boolean;
}

export function buildShoppingList(
	plan: PlanEntry[],
	recipesById: Map<string, RecipeSummary>,
	byId: Map<string, Ingredient>,
	pantry: Pantry,
	prices: PriceEntry[],
	today: Date
): ShoppingList {
	const needed = new Map<string, { grams: number; usedIn: Set<string> }>();

	for (const entry of plan) {
		const recipe = recipesById.get(entry.recipeId);
		if (!recipe) continue;
		const factor = entry.servings / recipe.servings;
		for (const line of recipe.lines) {
			const acc = needed.get(line.ingredientId) ?? { grams: 0, usedIn: new Set() };
			acc.grams += line.grams * factor;
			acc.usedIn.add(recipe.title);
			needed.set(line.ingredientId, acc);
		}
	}

	const remainingByGroup = new Map<string, number>();
	for (const [id, grams] of Object.entries(pantry)) {
		const ingredient = byId.get(id);
		if (!ingredient) continue;
		const prev = remainingByGroup.get(ingredient.group) ?? 0;
		remainingByGroup.set(ingredient.group, grams === null ? Infinity : prev + grams);
	}

	const items: ShoppingItem[] = [];
	for (const [id, { grams, usedIn }] of needed) {
		const ingredient = byId.get(id)!;
		const available = remainingByGroup.get(ingredient.group) ?? 0;
		const fromPantry = Math.min(available, grams);
		remainingByGroup.set(ingredient.group, available - fromPantry);

		const buyGrams = grams - fromPantry;
		const price = bestPrice(ingredient, prices, today);
		items.push({
			ingredient,
			needGrams: grams,
			buyGrams,
			cost: (price.perKg * buyGrams) / 1000,
			costIsEstimate: price.isEstimate,
			usedIn: [...usedIn]
		});
	}

	const toBuy = items.filter((i) => !isAssumedAtHome(i.ingredient) && i.buyGrams > 0.5);
	const categories = new Map<IngredientCategory, ShoppingItem[]>();
	for (const item of toBuy.sort((a, b) =>
		a.ingredient.name.localeCompare(b.ingredient.name, 'sk')
	)) {
		const list = categories.get(item.ingredient.category) ?? [];
		list.push(item);
		categories.set(item.ingredient.category, list);
	}

	return {
		byCategory: [...categories],
		staples: items.filter((i) => isAssumedAtHome(i.ingredient) && i.buyGrams > 0),
		total: toBuy.reduce((sum, i) => sum + i.cost, 0),
		hasEstimates: toBuy.some((i) => i.costIsEstimate)
	};
}
