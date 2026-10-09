import { getContext, setContext } from 'svelte';
import {
	NUTRIENT_KEYS,
	type RecipeLine,
	type Catalog,
	type Cuisine,
	type Equipment,
	type Ingredient,
	type Nutrients,
	type RecipeSummary,
	type Store,
	type Unit,
	type WikiPage
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

/**
 * In catalog.json a line is `[ingredient, grams, amount, unit, notEaten?]` and nutrients are a
 * list in NUTRIENT_KEYS order: the key names repeated on every line and recipe were a third of
 * the file and most of the time spent reading it.
 */
type LineTuple = [string, number, number | null, Unit | null, 1?];

export const packLine = (l: RecipeLine): LineTuple =>
	l.notEaten
		? [l.ingredientId, l.grams, l.amount, l.unit, 1]
		: [l.ingredientId, l.grams, l.amount, l.unit];

const unpackLine = (line: RecipeLine | LineTuple): RecipeLine =>
	Array.isArray(line)
		? {
				ingredientId: line[0],
				grams: line[1],
				amount: line[2],
				unit: line[3],
				...(line[4] === 1 && { notEaten: true })
			}
		: line;

export const packNutrients = (n: Nutrients): number[] => NUTRIENT_KEYS.map((k) => n[k]);

const unpackNutrients = (n: Nutrients | number[]): Nutrients =>
	Array.isArray(n)
		? (Object.fromEntries(NUTRIENT_KEYS.map((k, i) => [k, n[i] ?? 0])) as Nutrients)
		: n;

/** Undoes what catalog.json packed; an older, unpacked catalog (offline cache) reads as is. */
function unpack(catalog: CatalogPayload) {
	for (const ingredient of catalog.ingredients) {
		ingredient.per100g = unpackNutrients(ingredient.per100g);
	}
	for (const recipe of catalog.recipes) {
		recipe.lines = (recipe.lines as (RecipeLine | LineTuple)[]).map(unpackLine);
		recipe.perServing = unpackNutrients(recipe.perServing);
		for (const variant of recipe.variants) {
			const packed = variant.lines as (PackedLine | LineTuple)[];
			variant.lines = unpackVariantLines(
				recipe.lines,
				packed.map((l) => (typeof l === 'number' ? l : unpackLine(l)))
			);
			variant.perServing = unpackNutrients(variant.perServing);
		}
	}
}

export function indexCatalog(catalog: CatalogPayload): IndexedCatalog {
	unpack(catalog);
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
