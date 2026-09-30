import { getContext, setContext } from 'svelte';
import type {
	RecipeLine,
	Catalog,
	Cuisine,
	Equipment,
	Ingredient,
	RecipeSummary,
	Store,
	WikiPage
} from './types';

export type WikiIndexEntry = Omit<WikiPage, 'html'>;

/** Names and levels only, for the "Nemám doma" filter. */
export type EquipmentEntry = Pick<Equipment, 'id' | 'name' | 'level'>;

/** What /catalog.json serves and the root layout loads. */
export type CatalogPayload = Catalog & {
	wiki: WikiIndexEntry[];
	equipment: EquipmentEntry[];
	builtAt: string;
};

export interface IndexedCatalog extends Catalog {
	ingredientsById: Map<string, Ingredient>;
	recipesById: Map<string, RecipeSummary>;
	cuisinesById: Map<string, Cuisine>;
	storesById: Map<string, Store>;
	wiki: WikiIndexEntry[];
	equipment: EquipmentEntry[];
	/** Build date, so price staleness matches what the numbers were computed with. */
	builtAt: string;
}

const KEY = Symbol('catalog');

/**
 * A variant's lines mostly repeat the base recipe's; in catalog.json an unchanged line is the
 * index of the base line instead (about a quarter of the file).
 */
export type PackedLine = RecipeLine | number;

export function packVariantLines(base: RecipeLine[], lines: RecipeLine[]): PackedLine[] {
	return lines.map((line) => {
		const i = base.findIndex(
			(b) =>
				b.ingredientId === line.ingredientId &&
				b.grams === line.grams &&
				b.amount === line.amount &&
				b.unit === line.unit &&
				b.notEaten === line.notEaten
		);
		return i >= 0 ? i : line;
	});
}

export function unpackVariantLines(base: RecipeLine[], lines: PackedLine[]): RecipeLine[] {
	return lines.map((line) => (typeof line === 'number' ? base[line] : line));
}

export function indexCatalog(catalog: CatalogPayload): IndexedCatalog {
	for (const recipe of catalog.recipes) {
		for (const variant of recipe.variants) {
			variant.lines = unpackVariantLines(recipe.lines, variant.lines as PackedLine[]);
		}
	}
	return {
		...catalog,
		// A catalog cached by an older service worker has no equipment yet.
		equipment: catalog.equipment ?? [],
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
