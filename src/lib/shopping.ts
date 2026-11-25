import { formatAmount, formatGrams, formatNumber } from './amounts';
import { isAssumedAtHome, pantryByGroup, TAP_WATER_ID, type Pantry } from './pantry';
import type { IngredientCategory, IngredientLite, RecipeLine } from './types';

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

/** €/kg of the cheapest shelf price, or the rough estimate when no shop has it. */
export interface UnitPrice {
	perKg: number;
	estimate: boolean;
}

export interface ShoppingItem {
	ingredient: IngredientLite;
	/** Grams still to buy after what's at home. */
	grams: number;
	/** "2 ks", "300 g · ~2 ks": in the recipes' own unit when nothing is at home. */
	amount: string;
	/** Some of it is at home, just not enough. */
	partly: boolean;
	cost: number;
}

export interface ShoppingList {
	items: ShoppingItem[];
	/** Salt, oil and spices the plan uses that the pantry doesn't list: worth a look at home. */
	check: IngredientLite[];
	total: number;
	/** Some prices are estimates. */
	estimate: boolean;
}

/** " · ~2 ks" for things bought by the piece (onions, lemons), empty otherwise. */
export function approxPieces(ingredient: IngredientLite, grams: number): string {
	const ks = ingredient.units.ks;
	if (!ks || ks < 20) return '';
	return ` · ~${formatNumber(Math.ceil((grams / ks) * 2) / 2)} ks`;
}

/**
 * What to buy for all the planned plates: the same ingredient added up, minus what's at home
 * (dry and canned chickpeas count against each other through their group).
 */
export function shoppingList(
	lines: RecipeLine[],
	pantry: Pantry,
	byId: Map<string, IngredientLite>,
	prices: Record<string, UnitPrice>
): ShoppingList {
	const needed = new Map<string, { grams: number; lines: RecipeLine[] }>();
	for (const line of lines) {
		if (line.ingredientId === TAP_WATER_ID || !byId.has(line.ingredientId)) continue;
		const entry = needed.get(line.ingredientId) ?? { grams: 0, lines: [] };
		entry.grams += line.grams;
		entry.lines.push(line);
		needed.set(line.ingredientId, entry);
	}

	const groups = pantryByGroup(pantry, byId);
	const items: ShoppingItem[] = [];
	const check: IngredientLite[] = [];
	for (const [id, { grams, lines: own }] of needed) {
		const ingredient = byId.get(id)!;
		const atHome = groups.get(ingredient.group);
		if (atHome === undefined && isAssumedAtHome(ingredient)) {
			check.push(ingredient);
			continue;
		}
		const homeGrams = (atHome ?? 0) / ingredient.groupFactor;
		const buy = Math.max(0, grams - homeGrams);
		if (atHome !== undefined)
			groups.set(ingredient.group, Math.max(0, atHome - grams * ingredient.groupFactor));
		if (buy <= 0 && grams > 0) continue;
		if (grams === 0 && atHome !== undefined) continue;
		const sameUnit = own.every((l) => l.unit === own[0].unit && l.amount !== null);
		const amount =
			grams === 0
				? 'podľa chuti'
				: atHome === undefined && sameUnit
					? formatAmount(
							own.reduce((sum, l) => sum + (l.amount ?? 0), 0),
							own[0].unit
						)
					: `${formatGrams(buy)}${approxPieces(ingredient, buy)}`;
		const price = prices[id];
		items.push({
			ingredient,
			grams: buy,
			amount,
			partly: atHome !== undefined,
			cost: price ? (price.perKg * buy) / 1000 : 0
		});
	}

	const aisle = (i: IngredientLite) => AISLE_ORDER.indexOf(i.category);
	items.sort(
		(a, b) =>
			aisle(a.ingredient) - aisle(b.ingredient) ||
			a.ingredient.name.localeCompare(b.ingredient.name, 'sk')
	);
	check.sort((a, b) => a.name.localeCompare(b.name, 'sk'));
	return {
		items,
		check,
		total: items.reduce((sum, i) => sum + i.cost, 0),
		estimate: items.some((i) => prices[i.ingredient.id]?.estimate ?? true)
	};
}
