import { describe, expect, it } from 'vitest';
import {
	EMPTY_BODY,
	balances,
	changeEvents,
	householdFilter,
	isAway,
	memberTargets,
	portionsAt,
	settleUp,
	shareCooking,
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
	meals: { ranajky: true, obed: true, vecera: true },
	portion: null,
	body: EMPTY_BODY,
	away: null,
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

describe('who eats what', () => {
	it('counts portions of the people at home for that meal', () => {
		const people = [
			member('a'),
			member('b', { meals: { ranajky: false, obed: false, vecera: true } }),
			member('kid', { portion: 0.5 }),
			member('trip', { away: { from: '2026-10-10', to: '2026-10-12' } })
		];
		expect(portionsAt(people, '2026-10-09', 'obed')).toBe(2.5);
		expect(portionsAt(people, '2026-10-09', 'vecera')).toBe(3.5);
		expect(portionsAt(people, '2026-10-11', 'vecera')).toBe(2.5);
		expect(isAway(member('x', { away: { from: '2026-10-01', to: null } }), '2030-01-01')).toBe(
			true
		);
	});

	it('sizes a portion from the body, children by age', () => {
		const adult = memberTargets({
			...EMPTY_BODY,
			heightCm: 180,
			weightKg: 80,
			age: 30,
			sex: 'm',
			activity: 'aktivne'
		});
		expect(adult.kcal).toBe(2850);
		expect(adult.protein).toBe(112);
		expect(adult.portion).toBe(1.45);
		expect(memberTargets({ ...EMPTY_BODY, age: 5 }).portion).toBe(0.5);
		expect(memberTargets({ ...EMPTY_BODY, weightKg: 60 })).toEqual({
			kcal: null,
			protein: 66,
			portion: null
		});
	});

	it('keeps the new member fields through validation and fills them in for older copies', () => {
		const doc = validateDoc({
			...newDoc('D', 1),
			members: { a: { id: 'a', name: 'A', at: 1, portion: 9, meals: { obed: false } } }
		})!;
		expect(doc.members.a).toMatchObject({
			portion: null,
			meals: { ranajky: true, obed: false, vecera: true },
			body: EMPTY_BODY,
			away: null
		});
		expect(doc.expenses).toEqual({});
	});
});

describe('household money', () => {
	const people = [member('a'), member('b'), member('c')];

	it('splits shared costs evenly and counts paybacks', () => {
		const owed = balances(
			[
				{ by: 'a', amount: 30, date: '2026-10-01', note: '' },
				{ by: 'b', amount: 6, date: '2026-10-02', note: '' },
				{ by: 'c', amount: 5, date: '2026-10-03', note: '', to: 'a' }
			],
			people
		);
		expect(Object.fromEntries(owed)).toEqual({ a: 13, b: -6, c: -7 });
		expect(settleUp(owed)).toEqual([
			{ from: 'c', to: 'a', amount: 7 },
			{ from: 'b', to: 'a', amount: 6 }
		]);
	});

	it('survives a merge and drops junk amounts', () => {
		const a = {
			...newDoc('D', 1),
			expenses: { x1: [{ by: 'a', amount: 12.345, date: '2026-10-01', note: 'Nákup' }, 5] }
		};
		const b = {
			...newDoc('D', 1),
			expenses: { x2: [{ by: 'b', amount: -3, date: '2026-10-01', note: '' }, 6] }
		};
		const merged = mergeDocs(validateDoc(a)!, validateDoc(b)!);
		expect(Object.keys(merged.expenses)).toEqual(['x1']);
		expect(merged.expenses.x1[0]).toMatchObject({ amount: 12.35 });
	});
});

describe('household log and cooking turns', () => {
	it('tells what changed, but a cooked recipe is not "dropped"', () => {
		const before: SharedView = {
			...empty,
			plan: [
				{ recipeId: 'dal', servings: 2 },
				{ recipeId: 'chili', servings: 2 }
			]
		};
		const after: SharedView = {
			plan: [
				{ recipeId: 'dal', servings: 2 },
				{ recipeId: 'curry', servings: 2 }
			],
			pantry: { ryza: 500 },
			checked: { tofu: true },
			extras: []
		};
		const events = changeEvents(before, after, 'a', 7, new Set(['chili']));
		expect(events.map((e) => [e.kind, e.ref ?? e.n])).toEqual([
			['plan-add', 'curry'],
			['bought', 1],
			['pantry', 1]
		]);
		expect(changeEvents(before, after, 'a', 7).some((e) => e.kind === 'plan-remove')).toBe(true);
	});

	it('hands out cooking in turns, skipping freezer portions', () => {
		const plan = shareCooking(
			[
				{ recipeId: 'dal', servings: 2 },
				{ recipeId: 'cili', servings: 2, fromFreezer: true },
				{ recipeId: 'curry', servings: 2 },
				{ recipeId: 'pho', servings: 2 }
			],
			['a', 'b']
		);
		expect(plan.map((e) => e.cook)).toEqual(['a', undefined, 'b', 'a']);
	});
});
