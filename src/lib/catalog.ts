import { getContext, setContext } from 'svelte';
import type { Dish, Part } from './dish';
import type { UnitPrice } from './shopping';
import type { IngredientLite } from './types';

/** What /catalog.json serves and the root layout loads. */
export interface CatalogPayload {
	ingredients: IngredientLite[];
	parts: Part[];
	dishes: Dish[];
	/** Best shelf price of every ingredient the parts use, for the shopping list. */
	prices: Record<string, UnitPrice>;
	builtAt: string;
}

export interface Catalog extends CatalogPayload {
	ingredientsById: Map<string, IngredientLite>;
	partsById: Map<string, Part>;
	dishesById: Map<string, Dish>;
}

export function indexCatalog(payload: CatalogPayload): Catalog {
	return {
		...payload,
		ingredientsById: new Map(payload.ingredients.map((i) => [i.id, i])),
		partsById: new Map(payload.parts.map((p) => [p.id, p])),
		dishesById: new Map(payload.dishes.map((d) => [d.id, d]))
	};
}

const KEY = Symbol('catalog');

export function provideCatalog(get: () => Catalog) {
	setContext(KEY, get);
}

export function useCatalog(): () => Catalog {
	return getContext<() => Catalog>(KEY);
}
