import { describe, expect, it } from 'vitest';
import { prepMinutes } from './preptime';
import type { Ingredient, RecipeLine } from './types';

const ingredient = (id: string, category: string, extra: Partial<Ingredient> = {}) =>
	({ id, category, staple: false, byproduct: false, ...extra }) as unknown as Ingredient;
const byId = new Map(
	[
		ingredient('zemiaky', 'zelenina'),
		ingredient('cibula', 'zelenina'),
		ingredient('cesnak', 'zelenina'),
		ingredient('paprika-cervena', 'zelenina'),
		ingredient('sol', 'koreniny', { staple: true }),
		ingredient('cicer-sterilizovany', 'strukoviny')
	].map((i) => [i.id, i])
);
const line = (ingredientId: string, grams: number, extra: Partial<RecipeLine> = {}) =>
	({ ingredientId, grams, amount: null, unit: null, ...extra }) as RecipeLine;

describe('prepMinutes', () => {
	it('counts peeling and dicing a kilo of potatoes as ten minutes', () => {
		expect(prepMinutes([line('zemiaky', 1000)], byId, [])).toBe(10);
	});

	it('is quicker for potatoes cooked in their skins', () => {
		const steps = ['Zemiaky var v šupke 20 minút.'];
		expect(prepMinutes([line('zemiaky', 1000)], byId, steps)).toBe(6);
	});

	it('counts onions and garlic per piece', () => {
		const lines = [
			line('cibula', 300, { amount: 2, unit: 'ks' }),
			line('cesnak', 15, { amount: 3, unit: 'ks' })
		];
		expect(prepMinutes(lines, byId, [])).toBe(2 * 2 + 3 * 0.5);
	});

	it('leaves out staples and barely counts ready-to-use things', () => {
		const lines = [
			line('sol', 5),
			line('cicer-sterilizovany', 240),
			line('paprika-cervena', 200, { note: 'mrazená' })
		];
		expect(prepMinutes(lines, byId, [])).toBeCloseTo(0.6);
	});
});
