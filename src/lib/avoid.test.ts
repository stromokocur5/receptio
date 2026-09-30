import { describe, expect, it } from 'vitest';
import { avoidFilter, validateAvoid } from './avoid';
import type { Ingredient, RecipeSummary } from './types';

const byId = new Map(
	[
		{ id: 'cicer-suchy', group: 'cicer' },
		{ id: 'cicer-sterilizovany', group: 'cicer' },
		{ id: 'ryza', group: 'ryza' }
	].map((i) => [i.id, i as Ingredient])
);
const recipe = (ids: string[], equipment: string[] = []) =>
	({ lines: ids.map((ingredientId) => ({ ingredientId })), equipment }) as RecipeSummary;

describe('avoidFilter', () => {
	it('hides recipes with any form of an avoided ingredient', () => {
		const allowed = avoidFilter({ ingredients: ['cicer-suchy'], tools: [] }, byId);
		expect(allowed(recipe(['cicer-sterilizovany']))).toBe(false);
		expect(allowed(recipe(['ryza']))).toBe(true);
	});

	it('hides recipes needing a missing tool', () => {
		const allowed = avoidFilter({ ingredients: [], tools: ['rura'] }, byId);
		expect(allowed(recipe(['ryza'], ['rura']))).toBe(false);
	});
});

describe('validateAvoid', () => {
	it('keeps only id-like strings, once', () => {
		expect(validateAvoid({ ingredients: ['a', 'a', 3, '<b>'], tools: 'x' })).toEqual({
			ingredients: ['a'],
			tools: []
		});
		expect(validateAvoid([])).toBeUndefined();
	});
});
