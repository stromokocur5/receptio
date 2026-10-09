import { describe, expect, it } from 'vitest';
import {
	householdFilter,
	householdNeeds,
	mergeDocs,
	newDoc,
	recipeConflicts,
	validateDoc,
	viewOf,
	withLocalChanges,
	type HouseholdDoc,
	type Member,
	type SharedView
} from './household';
import type { Ingredient, RecipeSummary } from './types';

const member = (id: string, extra: Partial<Member> = {}): Member => ({
	id,
	name: id,
	allergens: [],
	avoid: [],
	mild: false,
	glutenFree: false,
	removed: false,
	at: 1,
	...extra
});

const empty: SharedView = { plan: [], pantry: {}, checked: {}, extras: [] };

describe('household sync', () => {
	it('keeps both phones’ edits when they merge', () => {
		const base = newDoc('Byt 4B', 1);
		const a = withLocalChanges(
			base,
			empty,
			{ ...empty, pantry: { mrkva: 500 }, checked: { tofu: true } },
			10
		);
		const b = withLocalChanges(
			base,
			empty,
			{ ...empty, pantry: { cicer: null }, extras: [{ id: 'x1', text: 'papier', checked: false }] },
			11
		);
		const merged = mergeDocs(a, b);
		expect(mergeDocs(b, a)).toEqual(merged);
		expect(viewOf(merged)).toEqual({
			plan: [],
			pantry: { mrkva: 500, cicer: null },
			checked: { tofu: true },
			extras: [{ id: 'x1', text: 'papier', checked: false }]
		});
	});

	it('lets the newer change win, removals included', () => {
		const start: SharedView = { ...empty, pantry: { mrkva: 500 }, checked: { tofu: true } };
		const doc = withLocalChanges(newDoc('D', 1), empty, start, 5);
		const removed = withLocalChanges(doc, start, { ...empty, checked: {} }, 20);
		const olderEdit = withLocalChanges(doc, start, { ...start, pantry: { mrkva: 300 } }, 15);
		expect(viewOf(mergeDocs(removed, olderEdit))).toEqual({ ...empty });
	});

	it('takes the newer plan as a whole', () => {
		const one = withLocalChanges(
			newDoc('D', 1),
			empty,
			{ ...empty, plan: [{ recipeId: 'dal', servings: 4 }] },
			5
		);
		const two = withLocalChanges(
			newDoc('D', 1),
			empty,
			{ ...empty, plan: [{ recipeId: 'chili', servings: 2 }] },
			9
		);
		expect(viewOf(mergeDocs(one, two)).plan).toEqual([{ recipeId: 'chili', servings: 2 }]);
	});

	it('rejects junk from the server and keeps what is valid', () => {
		expect(validateDoc({ v: 2 })).toBeNull();
		const doc = validateDoc({
			...newDoc('D', 1),
			members: {
				a1: member('a1', { allergens: ['nuts', 'unicorns'] as never }),
				'BAD ID': member('x')
			},
			pantry: { mrkva: [100, 3], 'Zlé id': [1, 2], cicer: ['veľa' as never, 2] }
		} satisfies Partial<HouseholdDoc> as unknown);
		expect(Object.keys(doc!.members)).toEqual(['a1']);
		expect(doc!.members.a1.allergens).toEqual(['nuts']);
		expect(doc!.pantry).toEqual({ mrkva: [100, 3] });
	});
});

describe('cooking for everyone', () => {
	const ingredients = new Map(
		[
			{ id: 'kesu', name: 'Kešu orechy', group: 'kesu' },
			{ id: 'cicer-suchy', name: 'Cícer suchý', group: 'cicer' },
			{ id: 'cicer-sterilizovany', name: 'Cícer sterilizovaný (scedený)', group: 'cicer' }
		].map((i) => [i.id, i as unknown as Ingredient])
	);
	const recipe = {
		allergens: ['nuts'],
		spicy: 2,
		gluten: 'contains',
		lines: [{ ingredientId: 'kesu' }, { ingredientId: 'cicer-sterilizovany' }]
	} as unknown as RecipeSummary;
	const labels = { nuts: 'orechy' } as never;

	it('says who can’t eat a recipe and why', () => {
		const ema = member('ema', { name: 'Ema', allergens: ['nuts'], mild: true });
		const jan = member('jan', { name: 'Ján', avoid: ['cicer-suchy'], glutenFree: true });
		const ok = member('ok', { name: 'Oľga' });
		expect(
			recipeConflicts(recipe, [ema, jan, ok], ingredients, labels).map((c) => [
				c.member.name,
				c.reasons
			])
		).toEqual([
			['Ema', ['orechy', 'pálivé']],
			['Ján', ['cícer suchý', 'lepok']]
		]);
		expect(householdNeeds([ema, jan, ok])).toEqual({
			allergens: ['nuts'],
			avoid: ['cicer-suchy'],
			mild: true,
			glutenFree: true
		});
	});
});

describe('household filter', () => {
	const ingredients = new Map(
		[
			{ id: 'kesu', name: 'Kešu', group: 'kesu' },
			{ id: 'cicer-suchy', name: 'Cícer suchý', group: 'cicer' },
			{ id: 'cicer-sterilizovany', name: 'Cícer sterilizovaný', group: 'cicer' },
			{ id: 'ryza', name: 'Ryža', group: 'ryza' }
		].map((i) => [i.id, i as unknown as Ingredient])
	);
	const recipe = (extra: Partial<RecipeSummary>) =>
		({
			allergens: [],
			spicy: 0,
			gluten: 'free',
			gfSwappable: false,
			lines: [{ ingredientId: 'ryza' }],
			...extra
		}) as unknown as RecipeSummary;
	const needs = householdNeeds([
		member('a', { allergens: ['nuts'], avoid: ['cicer-suchy'], mild: true, glutenFree: true })
	]);
	const ok = householdFilter(needs, ingredients);

	it('keeps only what everyone can eat', () => {
		expect(ok(recipe({}))).toBe(true);
		expect(ok(recipe({ allergens: ['nuts'] }))).toBe(false);
		expect(ok(recipe({ spicy: 2 }))).toBe(false);
		expect(ok(recipe({ spicy: 1 }))).toBe(true);
		expect(ok(recipe({ lines: [{ ingredientId: 'cicer-sterilizovany' }] as never }))).toBe(false);
		expect(ok(recipe({ gluten: 'contains' }))).toBe(false);
		expect(ok(recipe({ gluten: 'contains', gfSwappable: true }))).toBe(true);
	});
});
