import { formatNumber } from './amounts';
import { bestPrice, shelfCost, type ShelfCost } from './pricing';
import { isAssumedAtHome, TAP_WATER_ID, type Pantry } from './pantry';
import type { Ingredient, IngredientCategory, PriceEntry, RecipeSummary } from './types';

/** The order you walk a typical Slovak supermarket: fresh first, chilled, then dry goods. */
export const AISLE_ORDER: IngredientCategory[] = [
	'zelenina',
	'ovocie',
	'bielkoviny',
	'rastlinne-mlieka',
	'nahrady',
	'obilniny',
	'strukoviny',
	'orechy-semienka',
	'omacky-pasty',
	'oleje',
	'koreniny',
	'ine'
];

export interface PlanEntry {
	recipeId: string;
	servings: number;
	/** Name of the chosen recipe variant; the base recipe when absent. */
	variant?: string;
}

export function planLines(recipe: RecipeSummary, variant: string | undefined) {
	return (variant && recipe.variants.find((v) => v.name === variant)?.lines) || recipe.lines;
}

export interface ShoppingItem {
	ingredient: Ingredient;
	/** Total needed for the plan. */
	needGrams: number;
	/** Still to buy after subtracting the pantry. */
	buyGrams: number;
	cost: number;
	costIsEstimate: boolean;
	/** Store with the cheapest real price, null when only an estimate is known. */
	storeId: string | null;
	usedIn: string[];
	/** A usually-at-home basic the user said they're out of. */
	restock: boolean;
	/** Whole packs to buy, when a real price with a pack size is known. */
	shelf: ShelfCost | null;
}

export interface ShoppingList {
	byCategory: [IngredientCategory, ShoppingItem[]][];
	/** Spices, oils, basics and leftovers: listed to double-check, not counted in the total. */
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
	today: Date,
	/** Basics (spices, oils) the user is out of – moved from "check at home" to the list. */
	outOfStock: ReadonlySet<string> = new Set()
): ShoppingList {
	const needed = new Map<string, { grams: number; usedIn: Set<string> }>();

	for (const entry of plan) {
		const recipe = recipesById.get(entry.recipeId);
		if (!recipe) continue;
		const factor = entry.servings / recipe.servings;
		for (const line of planLines(recipe, entry.variant)) {
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
		remainingByGroup.set(
			ingredient.group,
			grams === null ? Infinity : prev + grams * ingredient.groupFactor
		);
	}

	const items: ShoppingItem[] = [];
	for (const [id, { grams, usedIn }] of needed) {
		const ingredient = byId.get(id)!;
		// The pantry is counted in the group's reference form (see Ingredient.groupFactor).
		const available = remainingByGroup.get(ingredient.group) ?? 0;
		const neededInGroup = grams * ingredient.groupFactor;
		const fromPantry = Math.min(available, neededInGroup);
		remainingByGroup.set(ingredient.group, available - fromPantry);

		const buyGrams = (neededInGroup - fromPantry) / ingredient.groupFactor;
		const price = bestPrice(ingredient, prices, today);
		items.push({
			ingredient,
			needGrams: grams,
			buyGrams,
			cost: (price.perKg * buyGrams) / 1000,
			costIsEstimate: price.isEstimate,
			storeId: price.storeId,
			usedIn: [...usedIn],
			restock: outOfStock.has(ingredient.id) && isAssumedAtHome(ingredient),
			shelf: shelfCost(ingredient, buyGrams, prices, today)
		});
	}

	// Leftovers (aquafaba from the chickpea can, okara) come from other ingredients, not the shop.
	const notBought = (i: Ingredient) => i.byproduct || (isAssumedAtHome(i) && !outOfStock.has(i.id));
	const worthChecking = (i: Ingredient) => notBought(i) && i.id !== TAP_WATER_ID;
	const toBuy = items.filter((i) => !notBought(i.ingredient) && i.buyGrams > 0.5);
	const categories = new Map<IngredientCategory, ShoppingItem[]>();
	for (const item of toBuy.sort((a, b) =>
		a.ingredient.name.localeCompare(b.ingredient.name, 'sk')
	)) {
		const list = categories.get(item.ingredient.category) ?? [];
		list.push(item);
		categories.set(item.ingredient.category, list);
	}

	return {
		byCategory: [...categories].sort(([a], [b]) => AISLE_ORDER.indexOf(a) - AISLE_ORDER.indexOf(b)),
		staples: items.filter((i) => worthChecking(i.ingredient) && i.buyGrams > 0),
		total: toBuy.reduce((sum, i) => sum + i.cost, 0),
		hasEstimates: toBuy.some((i) => i.costIsEstimate)
	};
}

/** " · ~2 ks" for things bought by the piece (onions, lemons), empty otherwise. */
export function approxPieces(ingredient: Ingredient, grams: number): string {
	const ks = ingredient.units.ks;
	if (!ks || ks < 20) return '';
	return ` · ~${formatNumber(Math.ceil((grams / ks) * 2) / 2)} ks`;
}
