import { describe, expect, it } from 'vitest';
import { consumeFromPantry } from './pantry';
import type { IngredientLite, RecipeLine } from './types';

function ing(id: string, group = id, extra: Partial<IngredientLite> = {}): IngredientLite {
	return {
		id,
		name: id,
		category: 'strukoviny',
		group,
		groupFactor: 1,
		staple: false,
		color: '#000000',
		units: {},
		...extra
	};
}

const byId = new Map(
	[ing('cicer-suchy', 'cicer'), ing('cicer-sterilizovany', 'cicer'), ing('ryza'), ing('sol')].map(
		(i) => [i.id, i]
	)
);

const lines: RecipeLine[] = (
	[
		['cicer-sterilizovany', 240],
		['ryza', 100],
		['sol', 5]
	] as const
).map(([ingredientId, grams]) => ({ ingredientId, grams, amount: grams, unit: 'g' }));

describe('consumeFromPantry', () => {
	it('takes the exact ingredient first, then the same group, scaled to servings', () => {
		const { pantry, used } = consumeFromPantry(
			{ 'cicer-suchy': 500, 'cicer-sterilizovany': 200, ryza: 1000 },
			lines,
			1.5,
			byId
		);
		expect(pantry).toEqual({ 'cicer-suchy': 340, ryza: 850 });
		expect(used.map((u) => [u.ingredient.id, u.grams, u.usedUp])).toEqual([
			['cicer-sterilizovany', 200, true],
			['cicer-suchy', 160, false],
			['ryza', 150, false]
		]);
	});

	it('converts between forms of a group (dry chickpeas swell 2.4×)', () => {
		const withDry = new Map(byId);
		withDry.set('cicer-suchy', ing('cicer-suchy', 'cicer', { groupFactor: 2.4 }));
		const { pantry, used } = consumeFromPantry({ 'cicer-suchy': 500 }, lines, 1, withDry);
		expect(pantry).toEqual({ 'cicer-suchy': 400 });
		expect(used[0].grams).toBeCloseTo(100);
	});

	it('leaves unweighed items and untracked ingredients alone', () => {
		const { pantry, used } = consumeFromPantry({ 'cicer-suchy': null }, lines, 1, byId);
		expect(pantry).toEqual({ 'cicer-suchy': null });
		expect(used).toEqual([]);
	});
});
