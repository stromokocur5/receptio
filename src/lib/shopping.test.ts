import { describe, expect, it } from 'vitest';
import { shoppingList } from './shopping';
import type { IngredientLite, RecipeLine } from './types';

const ing = (id: string, extra: Partial<IngredientLite> = {}): IngredientLite => ({
	id,
	name: id,
	category: 'zelenina',
	group: id,
	groupFactor: 1,
	staple: false,
	color: '#000',
	units: {},
	...extra
});

const byId = new Map(
	[
		ing('cibula', { units: { ks: 110 } }),
		ing('cicer-sterilizovany', { group: 'cicer', category: 'strukoviny', units: { ks: 240 } }),
		ing('cicer-suchy', { group: 'cicer', category: 'strukoviny', groupFactor: 2.4 }),
		ing('ryza', { category: 'obilniny' }),
		ing('sol', { category: 'koreniny', staple: true }),
		ing('voda')
	].map((i) => [i.id, i])
);

const line = (ingredientId: string, grams: number, amount: number, unit: RecipeLine['unit']) => ({
	ingredientId,
	grams,
	amount,
	unit
});

const prices = { cibula: { perKg: 1, estimate: false }, ryza: { perKg: 2, estimate: true } };

describe('shoppingList', () => {
	it('adds up plates and keeps the kitchen unit when nothing is at home', () => {
		const list = shoppingList(
			[line('cibula', 110, 1, 'ks'), line('cibula', 220, 2, 'ks'), line('voda', 500, 500, 'ml')],
			{},
			byId,
			prices
		);
		expect(list.items.map((i) => [i.ingredient.id, i.amount])).toEqual([['cibula', '3 ks']]);
		expect(list.total).toBeCloseTo(0.33);
		expect(list.estimate).toBe(false);
	});

	it('takes off what is at home, across forms of the same group', () => {
		const list = shoppingList(
			[line('cicer-sterilizovany', 480, 2, 'ks'), line('ryza', 300, 300, 'g')],
			{ 'cicer-suchy': 100, ryza: null },
			byId,
			prices
		);
		expect(list.items).toHaveLength(1);
		expect(list.items[0]).toMatchObject({ grams: 240, partly: true, amount: '240 g · ~1 ks' });
	});

	it('puts salt and spices on a check-at-home list instead', () => {
		const list = shoppingList(
			[line('sol', 6, 1, 'čl'), line('ryza', 100, 100, 'g')],
			{},
			byId,
			prices
		);
		expect(list.check.map((i) => i.id)).toEqual(['sol']);
		expect(list.items.map((i) => i.ingredient.id)).toEqual(['ryza']);
		expect(list.estimate).toBe(true);
	});
});
