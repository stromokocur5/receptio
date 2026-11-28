import { describe, expect, it } from 'vitest';
import { weekSummary } from './week';
import type { RecipeSummary } from './types';

const recipe = {
	id: 'dal',
	variants: [],
	perServing: {
		kcal: 500,
		protein: 21,
		carbs: 0,
		fat: 0,
		fiber: 14,
		salt: 0,
		iron: 7,
		calcium: 0,
		zinc: 0,
		ala: 0,
		b12: 0
	},
	costPerServing: 1
} as unknown as RecipeSummary;

describe('weekSummary', () => {
	it('averages the last 7 days per person and ignores older meals', () => {
		const s = weekSummary(
			[
				{ recipeId: 'dal', servings: 4, date: '2026-09-25' },
				{ recipeId: 'dal', servings: 4, date: '2026-09-01' }
			],
			new Map([['dal', recipe]]),
			2,
			new Date('2026-09-26T12:00:00Z')
		);
		expect(s.portions).toBe(2);
		expect(s.perDay.protein).toBeCloseTo(6);
		expect(s.cost).toBeCloseTo(2);
	});
});
