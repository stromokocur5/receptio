import { describe, expect, it } from 'vitest';
import { freshProduce, storesVersion } from './shelf';
import type { Ingredient, RecipeLine, RecipeVariant } from './types';

const ing = (id: string, category: string, shelf?: Ingredient['shelf']) =>
	({ id, category, ...(shelf && { shelf }) }) as Ingredient;
const byId = new Map(
	[
		ing('hrasok', 'zelenina', 'frozen'),
		ing('mrkva', 'zelenina', 'long'),
		ing('passata', 'zelenina', 'pantry'),
		ing('salat', 'zelenina'),
		ing('koriander', 'zelenina'),
		ing('ryza', 'obilniny')
	].map((i) => [i.id, i])
);
const line = (ingredientId: string, grams: number): RecipeLine => ({
	ingredientId,
	grams,
	amount: grams,
	unit: 'g'
});

describe('freshProduce', () => {
	it('is empty when everything comes from the freezer, the pantry or keeps for weeks', () => {
		const lines = [
			line('hrasok', 300),
			line('mrkva', 200),
			line('passata', 500),
			line('ryza', 200)
		];
		expect(freshProduce({ lines }, byId)).toEqual([]);
	});

	it('lists fresh produce but not a garnish of herbs', () => {
		const lines = [line('hrasok', 300), line('salat', 150), line('koriander', 8)];
		expect(freshProduce({ lines }, byId).map((i) => i.id)).toEqual(['salat']);
	});
});

describe('storesVersion', () => {
	const variant = (name: string, lines: RecipeLine[]) => ({ name, lines }) as RecipeVariant;

	it('picks the version that needs nothing fresh', () => {
		const recipe = {
			lines: [line('salat', 150), line('mrkva', 200)],
			variants: [
				variant('Low FODMAP', [line('salat', 150)]),
				variant('Zo zásob', [line('mrkva', 200)])
			]
		};
		expect(storesVersion(recipe, byId)).toEqual({ variant: 'Zo zásob' });
		expect(storesVersion({ lines: [line('mrkva', 200)], variants: [] }, byId)).toEqual({});
		expect(storesVersion({ lines: [line('salat', 150)], variants: [] }, byId)).toBeUndefined();
	});
});
