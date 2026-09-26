import { getContext, setContext } from 'svelte';
import type { Catalog, Cuisine, Ingredient, RecipeSummary, Store, WikiPage } from './types';

export type WikiIndexEntry = Omit<WikiPage, 'html'>;

export interface IndexedCatalog extends Catalog {
	ingredientsById: Map<string, Ingredient>;
	recipesById: Map<string, RecipeSummary>;
	cuisinesById: Map<string, Cuisine>;
	storesById: Map<string, Store>;
	wiki: WikiIndexEntry[];
	/** Build date, so price staleness matches what the numbers were computed with. */
	builtAt: string;
}

const KEY = Symbol('catalog');

export function indexCatalog(
	catalog: Catalog & { wiki: WikiIndexEntry[]; builtAt: string }
): IndexedCatalog {
	return {
		...catalog,
		ingredientsById: new Map(catalog.ingredients.map((i) => [i.id, i])),
		recipesById: new Map(catalog.recipes.map((r) => [r.id, r])),
		cuisinesById: new Map(catalog.cuisines.map((c) => [c.id, c])),
		storesById: new Map(catalog.stores.map((s) => [s.id, s]))
	};
}

export function provideCatalog(getCatalog: () => IndexedCatalog) {
	setContext(KEY, getCatalog);
}

export function useCatalog(): IndexedCatalog {
	return getContext<() => IndexedCatalog>(KEY)();
}
