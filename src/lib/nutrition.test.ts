import { describe, expect, it } from 'vitest';
import { recipeDiets } from './nutrition';
import type { Ingredient, RecipeLine } from './types';

const byId = new Map(
	[
		{ id: 'ryza' },
		{ id: 'cesnak', fodmapLimit: 0 },
		{ id: 'cicer', fodmapLimit: 42 },
		{ id: 'paradajky', histamine: true, nightshade: true },
		{ id: 'spenat', oxalate: true },
		{ id: 'vyvar', fodmapLimit: 0 }
	].map((i) => [i.id, i as Partial<Ingredient> as Ingredient])
);
const line = (ingredientId: string, grams: number, notEaten = false) =>
	({ ingredientId, grams, ...(notEaten && { notEaten }) }) as RecipeLine;

describe('recipeDiets', () => {
	it('fits everything when nothing is flagged', () => {
		expect(recipeDiets([line('ryza', 300)], byId, 2)).toEqual([
			'low-fodmap',
			'low-histamin',
			'low-oxalat',
			'bez-lulkovitych'
		]);
	});

	it('counts FODMAP limits per serving', () => {
		expect(recipeDiets([line('cicer', 160)], byId, 4)).toContain('low-fodmap');
		expect(recipeDiets([line('cicer', 160)], byId, 2)).not.toContain('low-fodmap');
	});

	it('rules out high-FODMAP ingredients in any amount, even to taste', () => {
		expect(recipeDiets([line('cesnak', 0)], byId, 4)).not.toContain('low-fodmap');
	});

	it("ignores what isn't eaten", () => {
		expect(recipeDiets([line('vyvar', 1500, true)], byId, 4)).toContain('low-fodmap');
	});

	it('reads the other diets from flags', () => {
		const diets = recipeDiets([line('paradajky', 100), line('spenat', 100)], byId, 2);
		expect(diets).toEqual(['low-fodmap']);
	});
});
