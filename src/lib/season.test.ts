import { describe, expect, it } from 'vitest';
import { recipeSeason } from './season';
import type { Ingredient, RecipeLine } from './types';

const ing = (id: string, season: number[]) => ({ id, season }) as Ingredient;
const byId = new Map(
	[
		ing('cuketa', [6, 7, 8, 9]),
		ing('paradajky', [7, 8, 9]),
		ing('ryza', []),
		ing('bazalka', [6, 7, 8, 9])
	].map((i) => [i.id, i])
);
const line = (ingredientId: string, grams: number) =>
	({ ingredientId, grams, amount: grams, unit: 'g' }) as RecipeLine;

describe('recipeSeason', () => {
	const ratatouille = { lines: [line('cuketa', 300), line('paradajky', 400), line('bazalka', 5)] };

	it('is in season only when all its main produce is', () => {
		expect(recipeSeason(ratatouille, byId, 8).inSeason).toBe(true);
		// June: zucchini yes, tomatoes not yet.
		expect(recipeSeason(ratatouille, byId, 6).inSeason).toBe(false);
	});

	it('ignores garnish amounts and year-round recipes', () => {
		expect(recipeSeason(ratatouille, byId, 8).produce.map((i) => i.id)).toEqual([
			'cuketa',
			'paradajky'
		]);
		expect(recipeSeason({ lines: [line('ryza', 200)] }, byId, 8).inSeason).toBe(false);
	});
});
