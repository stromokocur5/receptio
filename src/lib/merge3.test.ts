import { describe, expect, it } from 'vitest';
import { merge3 } from './merge3';

describe('three-way merge of two devices', () => {
	it('takes what only one side changed, deletions included', () => {
		const base = { favorites: { dal: true, pho: true }, notes: { dal: 'viac soli' } };
		const local = { favorites: { dal: true, pho: true, chili: true }, notes: { dal: 'viac soli' } };
		const remote = { favorites: { dal: true }, notes: { dal: 'menej soli' } };
		expect(merge3(base, local, remote)).toEqual({
			favorites: { dal: true, chili: true },
			notes: { dal: 'menej soli' }
		});
	});

	it('merges items with ids one by one and keeps both sides’ additions', () => {
		const base = [{ id: 'a', text: 'mlieko', checked: false }];
		const local = [
			{ id: 'a', text: 'mlieko', checked: true },
			{ id: 'b', text: 'chlieb', checked: false }
		];
		const remote = [
			{ id: 'a', text: 'ovsené mlieko', checked: false },
			{ id: 'c', text: 'soľ', checked: false }
		];
		expect(merge3(base, local, remote)).toEqual([
			{ id: 'a', text: 'ovsené mlieko', checked: true },
			{ id: 'b', text: 'chlieb', checked: false },
			{ id: 'c', text: 'soľ', checked: false }
		]);
	});

	it('treats lists without ids as bags: removals stick, additions add up', () => {
		const dal = { recipeId: 'dal', servings: 4 };
		const pho = { recipeId: 'pho', servings: 2 };
		const curry = { recipeId: 'curry', servings: 2 };
		const tacos = { recipeId: 'tacos', servings: 3 };
		expect(merge3([dal, pho], [dal, curry], [dal, pho, tacos])).toEqual([dal, curry, tacos]);
		// The same meal twice on one side stays twice.
		expect(merge3([dal], [dal, dal], [dal])).toEqual([dal, dal]);
	});

	it('lets this device win where both set a different value', () => {
		expect(merge3({ people: 2 }, { people: 3 }, { people: 4 })).toEqual({ people: 3 });
		expect(merge3(undefined, { a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
	});
});
