import { describe, expect, it } from 'vitest';
import { NO_JOURNAL } from './journal';
import { cookingStats, streak, supplementStreak, waterStreak } from './stats';
import type { RecipeSummary } from './types';

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
