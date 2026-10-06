import { describe, expect, it } from 'vitest';
import {
	addItem,
	addWater,
	averageNutrients,
	compactJournal,
	dayTotals,
	localToday,
	nutrientGaps,
	recentTotals,
	recipesRichIn,
	NO_JOURNAL,
	removeItem,
	setPortions,
	shiftDate,
	validateJournal,
	withDay,
	type Journal,
	type JournalDay
} from './journal';
import { dailyTargets, emptyNutrients } from './nutrition';
import type { Ingredient, RecipeSummary } from './types';

const dal = {
	id: 'dal',
	showNutrition: true,
	variants: [{ name: 'Ľahší', perServing: { ...emptyNutrients(), kcal: 300, fiber: 10 } }],
	perServing: { ...emptyNutrients(), kcal: 500, protein: 20, fiber: 14 }
} as unknown as RecipeSummary;
const tofu = { id: 'tofu', showNutrition: false, variants: [] } as unknown as RecipeSummary;
const apple = {
	id: 'jablko',
	per100g: { ...emptyNutrients(), kcal: 52, fiber: 2.4 }
} as unknown as Ingredient;

const recipes = new Map([
	['dal', dal],
	['tofu', tofu]
]);
const ingredients = new Map([['jablko', apple]]);

describe('dayTotals', () => {
	it('adds recipe portions, variants and ingredient grams', () => {
		const t = dayTotals(
			{
				waterMl: 0,
				items: [
					{ id: '1', kind: 'recipe', recipeId: 'dal', portions: 1.5 },
					{ id: '2', kind: 'recipe', recipeId: 'dal', variant: 'Ľahší', portions: 1 },
					{ id: '3', kind: 'ingredient', ingredientId: 'jablko', grams: 150 }
				]
			},
			recipes,
			ingredients
		);
		expect(t.nutrients.kcal).toBeCloseTo(750 + 300 + 78);
		expect(t.nutrients.fiber).toBeCloseTo(21 + 10 + 3.6);
		expect(t.unknown).toBe(0);
		expect(t.partial).toBe(false);
	});

	it('counts strained DIY recipes and empty custom food as unknown', () => {
		const t = dayTotals(
			{
				waterMl: 0,
				items: [
					{ id: '1', kind: 'recipe', recipeId: 'tofu', portions: 1 },
					{ id: '2', kind: 'custom', name: 'Sušienka', kcal: null, protein: null },
					{ id: '3', kind: 'custom', name: 'Tyčinka', kcal: 200, protein: 10 }
				]
			},
			recipes,
			ingredients
		);
		expect(t.unknown).toBe(2);
		expect(t.partial).toBe(true);
		expect(t.nutrients.kcal).toBe(200);
		expect(t.nutrients.protein).toBe(10);
	});
});

describe('journal days', () => {
	it('drops empty days and days older than the window', () => {
		let j: Journal = { ...NO_JOURNAL, days: { '2025-09-01': { waterMl: 500, items: [] } } };
		j = withDay(j, '2026-10-04', (d) => addWater(d, 250), '2026-10-04');
		expect(Object.keys(j.days)).toEqual(['2026-10-04']);
		j = withDay(j, '2026-10-04', (d) => addWater(d, -1000), '2026-10-04');
		expect(j.days).toEqual({});
	});

	it('puts a second helping on the same line and changes portions', () => {
		let day = addItem(
			{ waterMl: 0, items: [] },
			{ id: 'a', kind: 'recipe', recipeId: 'dal', portions: 1 }
		);
		day = addItem(day, { id: 'b', kind: 'recipe', recipeId: 'dal', portions: 1 });
		day = addItem(day, { id: 'c', kind: 'recipe', recipeId: 'dal', variant: 'Ľahší', portions: 1 });
		expect(day.items.map((i) => i.id)).toEqual(['a', 'c']);
		expect(day.items[0]).toMatchObject({ portions: 2 });
		expect(setPortions(day, 'a', 2.5).items[0]).toMatchObject({ portions: 2.5 });
		expect(setPortions(day, 'a', 0).items.map((i) => i.id)).toEqual(['c']);
	});

	it('keeps a year: details for three months, totals before that', () => {
		let j: Journal = {
			...NO_JOURNAL,
			days: {
				'2026-06-01': {
					waterMl: 1500,
					items: [{ id: '1', kind: 'recipe', recipeId: 'dal', portions: 2 }]
				},
				'2026-09-30': { waterMl: 500, items: [] }
			}
		};
		j = compactJournal(j, '2026-10-04', recipes, ingredients);
		expect(Object.keys(j.days)).toEqual(['2026-09-30']);
		expect(j.summaries['2026-06-01']).toMatchObject({ waterMl: 1500, items: 1, unknown: 0 });
		expect(j.summaries['2026-06-01'].nutrients.protein).toBe(40);
		expect(compactJournal(j, '2026-10-04', recipes, ingredients)).toBe(j);
		j = withDay(j, '2026-10-04', (d) => addWater(d, 250), '2027-06-02');
		expect(j.summaries).toEqual({});
	});

	it('adds and removes items', () => {
		const day = addItem(
			{ waterMl: 0, items: [] },
			{ id: 'a', kind: 'ingredient', ingredientId: 'jablko', grams: 100 }
		);
		expect(removeItem(day, 'a').items).toEqual([]);
	});

	it('shifts dates across month ends and finds the local day', () => {
		expect(shiftDate('2026-10-01', -1)).toBe('2026-09-30');
		expect(localToday(new Date(2026, 9, 4, 0, 30))).toBe('2026-10-04');
	});
});

describe('validateJournal', () => {
	it('keeps valid entries and drops broken ones', () => {
		const j = validateJournal({
			enabled: true,
			waterGoalMl: 99999,
			days: {
				'2026-10-04': {
					waterMl: 750,
					items: [
						{ id: '1', kind: 'recipe', recipeId: 'dal', portions: 1 },
						{ id: '2', kind: 'recipe', recipeId: 'dal', portions: -1 },
						{ id: '3', kind: 'custom', name: '  ', kcal: 100, protein: null },
						{ id: '4', kind: 'custom', name: 'Pivo', kcal: 200 }
					]
				},
				nonsense: { waterMl: 1, items: [] }
			}
		});
		expect(j?.enabled).toBe(true);
		expect(j?.showKcal).toBe(false);
		expect(j?.waterGoalMl).toBe(2000);
		expect(Object.keys(j!.days)).toEqual(['2026-10-04']);
		expect(j!.days['2026-10-04'].items.map((i) => i.id)).toEqual(['1', '4']);
	});

	it('rejects non-objects', () => {
		expect(validateJournal([])).toBeUndefined();
	});
});

describe('weekly picture', () => {
	const recipes = new Map([['dal', dal]]);
	const ingredients = new Map([['jablko', apple]]);
	const journalWith = (days: Record<string, JournalDay>): Journal => ({ ...NO_JOURNAL, days });

	it('averages only the days with food in the last week', () => {
		const j = journalWith({
			'2026-10-06': {
				waterMl: 0,
				items: [{ id: '1', kind: 'recipe', recipeId: 'dal', portions: 1 }]
			},
			'2026-10-04': {
				waterMl: 0,
				items: [{ id: '2', kind: 'recipe', recipeId: 'dal', portions: 2 }]
			},
			'2026-09-20': {
				waterMl: 0,
				items: [{ id: '3', kind: 'recipe', recipeId: 'dal', portions: 9 }]
			}
		});
		const days = recentTotals(j, '2026-10-06', recipes, ingredients);
		expect(days.map((d) => d.date)).toEqual(['2026-10-06', '2026-10-04']);
		expect(averageNutrients(days).protein).toBe(30);
	});

	it('finds what falls short, furthest from the goal first', () => {
		const targets = { ...emptyNutrients(), protein: 60, fiber: 30, iron: 14 };
		const average = { ...emptyNutrients(), protein: 50, fiber: 10, iron: 7 };
		expect(nutrientGaps(average, targets, ['protein', 'fiber', 'iron'])).toEqual(['fiber', 'iron']);
	});

	it('suggests everyday recipes rich in a nutrient, not treats or drinks', () => {
		const make = (id: string, iron: number, extra: Partial<RecipeSummary> = {}) =>
			({
				id,
				showNutrition: true,
				treat: [],
				categories: ['obedy/strukoviny'],
				perServing: { ...emptyNutrients(), kcal: 500, iron },
				...extra
			}) as unknown as RecipeSummary;
		const list = [
			make('a', 3),
			make('b', 9),
			make('brownies', 12, { treat: ['cukor'] }),
			make('smoothie', 10, { categories: ['napoje/smoothie'] }),
			make('c', 6)
		];
		expect(recipesRichIn(list, 'iron', 2).map((r) => r.id)).toEqual(['b', 'c']);
	});

	it('keeps only sane personal goals', () => {
		const j = validateJournal({
			goals: { activity: 'silovy', custom: { protein: 140, iron: 9999, b12: 5 } }
		});
		expect(j?.goals).toEqual({ activity: 'silovy', custom: { protein: 140 } });
		expect(validateJournal({ goals: { activity: 'hacker' } })?.goals.activity).toBe('bezne');
	});

	it('turns weight and activity into a protein goal, own numbers win', () => {
		expect(dailyTargets(70).protein).toBe(77);
		expect(dailyTargets(70, { activity: 'silovy', custom: {} }).protein).toBe(112);
		expect(dailyTargets(null, { activity: 'bezne', custom: { fiber: 40 } }).fiber).toBe(40);
	});
});
