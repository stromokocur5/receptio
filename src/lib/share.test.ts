import { describe, expect, it } from 'vitest';
import { decodeSharedPlan, encodeSharedPlan, type SharedPlan } from './share';

const recipes = new Set(['hummus', 'cili']);
const ingredients = new Set(['cicer', 'cesnak']);
const b64 = (value: unknown) =>
	btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

describe('shared plan links', () => {
	it('round-trips a plan with variants and Slovak text', () => {
		const shared: SharedPlan = {
			plan: [
				{ recipeId: 'hummus', servings: 4 },
				{ recipeId: 'cili', servings: 6, variant: 'Bez náhrad' }
			],
			buy: [
				['cicer', 480],
				['cesnak', 12]
			],
			people: 2,
			days: 5
		};
		const encoded = encodeSharedPlan(shared);
		expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
		expect(decodeSharedPlan(encoded, recipes, ingredients)).toEqual(shared);
	});

	it('drops recipes and ingredients this build does not know', () => {
		const decoded = decodeSharedPlan(
			b64({
				v: 1,
				p: [
					['stary-recept', 2],
					['hummus', 2]
				],
				b: [['zmazane', 5]],
				n: 1,
				d: 7
			}),
			recipes,
			ingredients
		);
		expect(decoded?.plan).toEqual([{ recipeId: 'hummus', servings: 2 }]);
		expect(decoded?.buy).toEqual([]);
	});

	it('rejects malformed or hostile input', () => {
		for (const bad of [
			'%%%',
			b64('text'),
			b64({ v: 2, p: [], b: [] }),
			b64({ v: 1, p: [['hummus', -1]], b: [] }),
			b64({ v: 1, p: [['<script>', 1]], b: [] }),
			b64({ v: 1, p: [], b: [['cicer', 1e12]] }),
			b64({ v: 1, p: Array(500).fill(['hummus', 1]), b: [] })
		]) {
			expect(decodeSharedPlan(bad, recipes, ingredients)).toBeNull();
		}
	});
});
