import {
	pickMethod,
	scaledLines,
	type Kitchen,
	type Part,
	type PartMethod,
	type Style
} from './dish';
import type { IngredientCategory, RecipeLine } from './types';

/** A part cooked alongside a recipe: rice with a curry, a salad with a stew. */
export interface PlanSide {
	part: string;
	/** Method label; absent = the usual way. */
	method?: string;
}

export const MAX_SIDES = 3;

export const SIDE_GROUPS = [
	{ id: 'priloha', label: 'Príloha', kinds: ['priloha', 'pecivo'] },
	{ id: 'zelenina', label: 'Zelenina a šalát', kinds: ['zelenina'] },
	{ id: 'dip', label: 'Dip', kinds: ['omacka'] }
] as const;
export type SideGroupId = (typeof SIDE_GROUPS)[number]['id'];

/**
 * Parts that go next to a finished recipe. Warm sauces (bolognese, teriyaki) are the main thing
 * of a plate, not a side; cold ones that keep (hummus, salsa) work as a dip.
 */
export function sideGroup(part: Part): SideGroupId | undefined {
	if (part.style.includes('sladke')) return undefined;
	if (part.kind === 'omacka') return part.early ? 'dip' : undefined;
	return SIDE_GROUPS.find((g) => (g.kinds as readonly string[]).includes(part.kind))?.id;
}

const CUISINE_STYLES: Record<string, Style> = {
	'indicka-juh': 'indicke',
	'indicka-sever': 'indicke',
	thajska: 'azijske',
	vietnamska: 'azijske',
	japonska: 'azijske',
	korejska: 'azijske',
	cinska: 'azijske',
	indonezska: 'azijske',
	mexicka: 'mexicke',
	peruanska: 'mexicke',
	karibska: 'mexicke',
	brazilska: 'mexicke',
	grecka: 'stredomorske',
	talianska: 'stredomorske',
	libanonska: 'stredomorske',
	turecka: 'stredomorske',
	severoafricka: 'stredomorske',
	slovenska: 'domace',
	americka: 'domace',
	moderna: 'domace'
};

export function cuisineStyle(cuisineId: string): Style | undefined {
	return CUISINE_STYLES[cuisineId];
}

/** A part made for this kitchen of the world (or for any) is a sure match. */
export function suits(part: Part, style: Style | undefined): boolean {
	return !style || part.style.length === 0 || part.style.includes(style);
}

/** Sides of one group, the ones that suit the cuisine first. */
export function sidesFor(sides: Part[], group: SideGroupId, style: Style | undefined): Part[] {
	return sides
		.filter((p) => sideGroup(p) === group)
		.sort((a, b) => Number(suits(b, style)) - Number(suits(a, style)));
}

const MAIN_MEALS = new Set(['obed', 'vecera']);
const NOT_A_MAIN = ['polievky/', 'prilohy/', 'omacky/', 'salaty/prilohove', 'napoje/', 'dezerty/'];

/** A lunch or dinner that's eaten as the main thing, so a side makes sense next to it. */
export function takesSides(recipe: { meals: string[]; categories: string[] }): boolean {
	return (
		recipe.meals.some((m) => MAIN_MEALS.has(m)) &&
		!recipe.categories.some((c) => NOT_A_MAIN.some((prefix) => c.startsWith(prefix)))
	);
}

/** Rice, pasta, potatoes or bread already in it: a starchy side would be one too many. */
export function hasStarch(
	lines: RecipeLine[],
	byId: Map<string, { category: IngredientCategory; id: string }>
): boolean {
	return lines.some((l) => {
		const ingredient = byId.get(l.ingredientId);
		return ingredient?.category === 'obilniny' && l.grams >= 40;
	});
}

export function methodMinutes(method: PartMethod): number {
	return method.steps.reduce((sum, s) => sum + s.min, 0);
}

/** When to start a side so it's ready with the recipe; the recipe takes `recipeMinutes`. */
export function sideTiming(part: Part, method: PartMethod, recipeMinutes: number): string {
	const minutes = methodMinutes(method);
	if (part.early) return `${minutes} min · dá sa pripraviť vopred`;
	const gap = recipeMinutes - minutes;
	if (Math.abs(gap) < 5) return `${minutes} min · začni spolu s receptom`;
	return gap > 0
		? `${minutes} min · začni ju ${gap} min po začatí receptu`
		: `${minutes} min · začni ju ${-gap} min pred receptom`;
}

export interface ResolvedSide {
	part: Part;
	method: PartMethod;
}

/** Planned or picked sides that still exist, each cooked the chosen way or the kitchen's own. */
export function resolveSides(
	picked: PlanSide[],
	sidesById: Map<string, Part>,
	kitchen?: Kitchen
): ResolvedSide[] {
	return picked.flatMap((s) => {
		const part = sidesById.get(s.part);
		if (!part) return [];
		const method =
			part.methods.find((m) => m.label === s.method) ??
			(kitchen && pickMethod(part, kitchen)) ??
			part.methods[0];
		return [{ part, method }];
	});
}

/** Everything the sides need for `servings` people. */
export function sideLines(sides: ResolvedSide[], servings: number): RecipeLine[] {
	return sides.flatMap(({ part, method }) => scaledLines(part, servings, method));
}

export function validateSides(raw: unknown): PlanSide[] | undefined {
	if (!Array.isArray(raw)) return undefined;
	const sides = raw.flatMap((s): PlanSide[] => {
		if (typeof s !== 'object' || s === null) return [];
		const { part, method } = s as Record<string, unknown>;
		if (typeof part !== 'string' || !/^[a-z0-9-]{1,60}$/.test(part)) return [];
		if (method !== undefined && (typeof method !== 'string' || method.length > 60)) return [];
		return [method === undefined ? { part } : { part, method }];
	});
	return sides.slice(0, MAX_SIDES);
}
