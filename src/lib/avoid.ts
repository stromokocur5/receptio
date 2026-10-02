import type { Ingredient, RecipeSummary } from './types';

/**
 * What someone doesn't eat, won't buy or doesn't own. Set once in Špajza; recipe lists,
 * pantry suggestions and the automatic plan leave out recipes that need any of it.
 */
export interface Avoid {
	/** Ingredient ids; the whole group counts (dry and canned chickpeas). */
	ingredients: string[];
	/** Equipment ids. */
	tools: string[];
	/** Hide fast food and everything labeled "Na občas" (fried, lots of fat or sugar). */
	treats: boolean;
}

export const NO_AVOID: Avoid = { ingredients: [], tools: [], treats: false };

const MAX_ITEMS = 200;
const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function ids(raw: unknown): string[] {
	if (!Array.isArray(raw)) return [];
	return [...new Set(raw.filter((v): v is string => typeof v === 'string' && ID_RE.test(v)))].slice(
		0,
		MAX_ITEMS
	);
}

export function validateAvoid(raw: unknown): Avoid | undefined {
	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
	const { ingredients, tools, treats } = raw as Record<string, unknown>;
	return { ingredients: ids(ingredients), tools: ids(tools), treats: treats === true };
}

export function isAvoiding(avoid: Avoid): boolean {
	return avoid.ingredients.length > 0 || avoid.tools.length > 0 || avoid.treats;
}

/** Fast food by category, or labeled "Na občas" by what's in it – even when a lighter variant exists. */
export function isTreat(recipe: RecipeSummary): boolean {
	return recipe.treat.length > 0 || recipe.categories.some((c) => c.startsWith('comfort/'));
}

/** A test for "can this person cook it", built once for a whole list. */
export function avoidFilter(
	avoid: Avoid,
	ingredientsById: Map<string, Ingredient>
): (recipe: RecipeSummary) => boolean {
	const groups = new Set(avoid.ingredients.map((id) => ingredientsById.get(id)?.group ?? id));
	const tools = new Set(avoid.tools);
	return (recipe) =>
		!(avoid.treats && isTreat(recipe)) &&
		!recipe.equipment.some((t) => tools.has(t)) &&
		!recipe.lines.some((l) => groups.has(ingredientsById.get(l.ingredientId)?.group ?? ''));
}

/** "Cícer sterilizovaný (scedený)" → "Cícer sterilizovaný", short enough for a chip. */
export function shortName(name: string): string {
	return name.replace(/\s*\(.*\)/, '');
}

/** Tools worth asking about: everyone has the basics; ones already chosen stay switchable. */
export function missableTools<T extends { id: string; level: string }>(
	equipment: T[],
	recipes: RecipeSummary[],
	chosen: string[]
): T[] {
	return equipment.filter(
		(e) =>
			chosen.includes(e.id) ||
			(e.level !== 'zaklad' && recipes.some((r) => r.equipment.includes(e.id)))
	);
}
