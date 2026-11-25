import { getContext, setContext } from 'svelte';
import { BUILDER_MODES, FREE_DISH_IDS, freeDish, type BuilderMode } from './builder';
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
	/** The free plates: every part, slots empty. */
	freeDishes: Record<BuilderMode, Dish>;
	ingredientsById: Map<string, IngredientLite>;
	partsById: Map<string, Part>;
	dishesById: Map<string, Dish>;
}

export function indexCatalog(payload: CatalogPayload): Catalog {
	return {
		...payload,
		freeDishes: Object.fromEntries(
			BUILDER_MODES.map((m) => [m, freeDish(payload.parts, m)])
		) as Record<BuilderMode, Dish>,
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

/** A curated dish, or the free plate for its id. */
export function findDish(catalog: Catalog, id: string): Dish | undefined {
	const mode = BUILDER_MODES.find((m) => FREE_DISH_IDS[m] === id);
	return mode ? catalog.freeDishes[mode] : catalog.dishesById.get(id);
}
