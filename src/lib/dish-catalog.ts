import { getContext, setContext } from 'svelte';
import { BUILDER_MODES, FREE_DISH_IDS, freeDish, type BuilderMode } from './builder';
import type { Dish, Part } from './dish';
import { composePart, decodeComposition, isComposedId, type ComposerData } from './composer';
import type { UnitPrice } from './plate-shopping';
import type { IngredientLite } from './types';

/** What /dishes.json serves and the plate pages load. */
export interface DishCatalogPayload {
	ingredients: IngredientLite[];
	parts: Part[];
	dishes: Dish[];
	/** Best shelf price of every ingredient the parts use, for the shopping list. */
	prices: Record<string, UnitPrice>;
	/** Ingredients, techniques and flavour bases for recipes put together from scratch. */
	composer: ComposerData;
	builtAt: string;
}

export interface DishCatalog extends DishCatalogPayload {
	/** The free plates: every part, slots empty. */
	freeDishes: Record<BuilderMode, Dish>;
	ingredientsById: Map<string, IngredientLite>;
	partsById: Map<string, Part>;
	dishesById: Map<string, Dish>;
}

export function indexDishCatalog(payload: DishCatalogPayload): DishCatalog {
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

const KEY = Symbol('dish-catalog');

export function provideDishCatalog(get: () => DishCatalog) {
	setContext(KEY, get);
}

export function useDishCatalog(): () => DishCatalog {
	return getContext<() => DishCatalog>(KEY);
}

/** A curated dish, or the free plate for its id. */
export function findDish(catalog: DishCatalog, id: string): Dish | undefined {
	const mode = BUILDER_MODES.find((m) => FREE_DISH_IDS[m] === id);
	return mode ? catalog.freeDishes[mode] : catalog.dishesById.get(id);
}

/**
 * Recipes put together from ingredients live only in links and saved lists: build any of these
 * ids into parts the first time they're seen, so plates can use them like any other part.
 */
export function resolveComposed(catalog: DishCatalog, ids: Iterable<string>): void {
	for (const id of ids) {
		if (!isComposedId(id) || catalog.partsById.has(id)) continue;
		const c = decodeComposition(id, catalog.composer);
		if (!c) continue;
		const hasProtein = c.items.some((i) => catalog.composer.ingredients[i]?.group === 'bielkovina');
		const part = composePart(
			c,
			catalog.composer,
			catalog.ingredientsById,
			catalog.prices,
			hasProtein ? 'hlavne' : 'zelenina'
		);
		catalog.partsById.set(part.id, part);
	}
}
