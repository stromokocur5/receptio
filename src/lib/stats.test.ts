import { describe, expect, it } from 'vitest';
import { NO_JOURNAL } from './journal';
import { compressHistory } from './price-history';
import {
	cookingStats,
	mealPortions,
	milestones,
	monthlyCooking,
	plantsThisWeek,
	saleSavings,
	streak,
	supplementStreak,
	topIngredients,
	usualIngredients,
	waterStreak,
	weeklyNutrition
} from './stats';
import type { Ingredient, RecipeSummary } from './types';

const recipe = (id: string, cuisine: string, cost: number) =>
	({ id, cuisine, costPerServing: cost, variants: [] }) as unknown as RecipeSummary;
const recipes = new Map([
	['dal', recipe('dal', 'indicka', 1)],
	['pizza', recipe('pizza', 'talianska', 2)]
]);

describe('cookingStats', () => {
	it('counts this and last month, cuisines, costs and favourites', () => {
		const s = cookingStats(
			[
				{ recipeId: 'dal', servings: 4, date: '2026-10-02' },
				{ recipeId: 'dal', servings: 2, date: '2026-09-20' },
				{ recipeId: 'pizza', servings: 2, date: '2026-10-05' },
				{ recipeId: 'zmazany', servings: 2, date: '2026-10-05' }
			],
			recipes,
			'2026-10-06'
		);
		expect(s.total).toBe(3);
		expect([s.thisMonth, s.lastMonth]).toEqual([2, 1]);
		expect([s.recipes, s.cuisines]).toEqual([2, 2]);
		expect([s.costThisMonth, s.costLastMonth]).toEqual([8, 2]);
		expect(s.perPortion).toBeCloseTo(10 / 8);
		expect(s.favourites).toEqual([{ recipeId: 'dal', count: 2 }]);
	});
});

describe('streaks', () => {
	it('counts back from today, or from yesterday when today is still open', () => {
		const done = new Set(['2026-10-04', '2026-10-05']);
		expect(streak((d) => done.has(d), '2026-10-06')).toBe(2);
		expect(streak((d) => done.has(d), '2026-10-05')).toBe(2);
		expect(streak((d) => done.has(d), '2026-10-08')).toBe(0);
	});

	it('reads water and supplements from the diary', () => {
		const journal = {
			...NO_JOURNAL,
			waterGoalMl: 2000,
			supplements: [{ id: 'b12', name: 'B12', time: 480 }],
			days: {
				'2026-10-06': { waterMl: 2000, items: [], taken: ['b12'] },
				'2026-10-05': { waterMl: 1500, items: [], taken: ['b12'] }
			}
		};
		expect(waterStreak(journal, '2026-10-06')).toBe(1);
		expect(supplementStreak(journal, '2026-10-06')).toBe(2);
	});
});

describe('cooking over time', () => {
	const line = (ingredientId: string, grams: number) => ({
		ingredientId,
		grams,
		amount: null,
		unit: null
	});
	const soup = {
		id: 'polievka',
		cuisine: 'slovenska',
		servings: 4,
		meals: ['obed'],
		costPerServing: 0.5,
		perServing: { protein: 14, fiber: 7 },
		variants: [],
		lines: [
			line('mrkva', 400),
			line('sosovica-cervena', 200),
			line('kmin', 2),
			line('sol', 5),
			line('olej', 20)
		]
	} as unknown as RecipeSummary;
	const byId = new Map([['polievka', soup]]);
	const ingredient = (id: string, category: string) =>
		({ id, group: id, category }) as unknown as Ingredient;
	const ingredients = new Map(
		[
			ingredient('mrkva', 'zelenina'),
			ingredient('sosovica-cervena', 'strukoviny'),
			ingredient('kmin', 'koreniny'),
			ingredient('sol', 'koreniny'),
			ingredient('olej', 'oleje')
		].map((i) => [i.id, i])
	);
	const cooked = [
		{ recipeId: 'polievka', servings: 4, date: '2026-10-05' },
		{ recipeId: 'polievka', servings: 2, date: '2026-08-10' }
	];

	it('sums months, empty ones included', () => {
		const months = monthlyCooking(cooked, byId, '2026-10-06', 3);
		expect(months.map((m) => [m.month, m.cooked, m.cost])).toEqual([
			['2026-08', 1, 1],
			['2026-09', 0, 0],
			['2026-10', 1, 2]
		]);
	});

	it('counts lunches for the restaurant comparison', () => {
		expect(mealPortions(cooked, byId)).toEqual({ portions: 6, cost: 3 });
	});

	it('counts plants this week, spices as a quarter, without salt and oil', () => {
		const plants = plantsThisWeek(cooked, byId, ingredients, '2026-10-06');
		expect(plants.plants).toEqual(['mrkva', 'sosovica-cervena']);
		expect(plants.spices).toEqual(['kmin']);
		expect(plants.score).toBe(2.25);
	});

	it('averages protein and fiber per day for each week', () => {
		const [earlier, last] = weeklyNutrition(cooked, byId, 2, '2026-10-06', 2);
		expect(earlier.portions).toBe(0);
		expect(last.protein).toBeCloseTo((14 * 2) / 7);
		expect(last.fiber).toBeCloseTo(2);
	});

	it('knows what is usually bought: lately cooked or planned, no spices or oil', () => {
		expect([...usualIngredients(cooked, [], byId, ingredients, '2026-10-06')].sort()).toEqual([
			'mrkva',
			'sosovica-cervena'
		]);
		// Cooked too long ago, nothing planned: nothing usual.
		expect(usualIngredients(cooked.slice(1), [], byId, ingredients, '2026-12-20').size).toBe(0);
		expect(
			usualIngredients([], [{ recipeId: 'polievka', servings: 2 }], byId, ingredients, '2026-12-20')
				.size
		).toBe(2);
	});

	it('ranks ingredients by weight cooked', () => {
		expect(topIngredients(cooked, byId, 2)).toEqual([
			{ ingredientId: 'mrkva', grams: 600 },
			{ ingredientId: 'sosovica-cervena', grams: 300 }
		]);
	});

	it('estimates what sales saved on the days meals were cooked', () => {
		const prices = compressHistory([
			{
				date: '2026-10-05',
				ingredientId: 'mrkva',
				storeId: 'fresh',
				product: 'Mrkva',
				pack: '1 kg',
				packGrams: 1000,
				price: 1.2
			},
			{
				date: '2026-10-05',
				ingredientId: 'mrkva',
				storeId: 'fresh',
				product: 'Mrkva',
				pack: '1 kg',
				packGrams: 1000,
				price: 0.7,
				saleUntil: '2026-10-07'
			}
		]);
		const saved = saleSavings(cooked, byId, prices, ['fresh']);
		expect(saved.meals).toBe(1);
		expect(saved.total).toBeCloseTo(0.2);
	});

	it('lists reached milestones and the next goal', () => {
		const list = milestones({ total: 12, recipes: 3, cuisines: 2 }, 21, 0);
		expect(list.map((m) => [m.label, m.done])).toEqual([
			['Prvé varenie', true],
			['10× uvarené', true],
			['25× uvarené', false],
			['5 rôznych receptov', false],
			['3 kuchyne sveta', false],
			['3 dni varenia po sebe', false]
		]);
	});
});
