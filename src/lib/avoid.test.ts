import { describe, expect, it } from 'vitest';
import { avoidFilter, isAvoiding, validateAvoid } from './avoid';
import type { Ingredient, RecipeSummary } from './types';

const byId = new Map(
	[
		{ id: 'cicer-suchy', group: 'cicer' },
		{ id: 'cicer-sterilizovany', group: 'cicer' },
		{ id: 'ryza', group: 'ryza' }
	].map((i) => [i.id, i as Ingredient])
);
const recipe = (ids: string[], equipment: string[] = []) =>
	({
		lines: ids.map((ingredientId) => ({ ingredientId })),
		equipment,
		treat: [],
		categories: ['hlavne/kari']
	}) as unknown as RecipeSummary;

describe('avoidFilter', () => {
	it('hides recipes with any form of an avoided ingredient', () => {
		const allowed = avoidFilter({ ingredients: ['cicer-suchy'], tools: [], treats: false }, byId);
		expect(allowed(recipe(['cicer-sterilizovany']))).toBe(false);
		expect(allowed(recipe(['ryza']))).toBe(true);
	});

	it('hides recipes needing a missing tool', () => {
		const allowed = avoidFilter({ ingredients: [], tools: ['rura'], treats: false }, byId);
		expect(allowed(recipe(['ryza'], ['rura']))).toBe(false);
	});

	it('hides fast food and "na občas" dishes only when asked', () => {
		const fried = { ...recipe(['ryza']), treat: ['vyprazane'] } as RecipeSummary;
		const kebab = { ...recipe(['ryza']), categories: ['comfort/kebab'] } as RecipeSummary;
		const off = avoidFilter({ ingredients: [], tools: [], treats: false }, byId);
		const on = avoidFilter({ ingredients: [], tools: [], treats: true }, byId);
		expect([fried, kebab].every(off)).toBe(true);
		expect([fried, kebab].some(on)).toBe(false);
		expect(on(recipe(['ryza']))).toBe(true);
		expect(isAvoiding({ ingredients: [], tools: [], treats: true })).toBe(true);
	});
});

describe('validateAvoid', () => {
	it('keeps only id-like strings, once', () => {
		expect(validateAvoid({ ingredients: ['a', 'a', 3, '<b>'], tools: 'x' })).toEqual({
			ingredients: ['a'],
			tools: [],
			treats: false
		});
		expect(validateAvoid([])).toBeUndefined();
	});
});
