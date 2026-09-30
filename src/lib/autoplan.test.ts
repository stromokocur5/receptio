import { describe, expect, it } from 'vitest';
import { autoPlan, swapEntry, type AutoPlanOptions } from './autoplan';
import type { RecipeSummary } from './types';

const zero = {
	kcal: 400,
	protein: 0,
	carbs: 0,
	fat: 0,
	fiber: 0,
	salt: 0,
	iron: 0,
	calcium: 0,
	zinc: 0,
	ala: 0,
	b12: 0
};

function recipe(
	id: string,
	extra: Partial<RecipeSummary> & { protein?: number } = {}
): RecipeSummary {
	const { protein = 20, ...rest } = extra;
	return {
		id,
		title: id,
		description: '',
		cuisine: id,
		meals: ['obed', 'vecera'],
		categories: ['hlavne/kari'],
		time: 30,
		activeTime: 10,
		servings: 4,
		difficulty: 1,
		tags: [],
		gluten: 'free',
		gfSwappable: true,
		allergens: [],
		perServing: { ...zero, protein },
		costPerServing: 1,
		costIsEstimate: true,
		costKnownShare: 0,
		co2PerServing: 0.5,
		usesSubstitutes: false,
		treat: [],
		warnings: [],
		substitutes: 'none',
		showNutrition: true,
		variants: [],
		lines: [],
		equipment: [],
		spicy: 0,
		keeps: { fridge: 3, freezer: 0 },
		servingGrams: 400,
		...rest
	};
}

const base: AutoPlanOptions = {
	days: 4,
	people: 2,
	mealsPerDay: 1,
	budget: null,
	minProtein: 15,
	mild: false,
	glutenFree: false,
	noSubstitutes: false,
	excludeAllergens: [],
	batchCooking: true,
	seed: 1
};

describe('autoPlan', () => {
	const recipes = [
		recipe('lacne', { costPerServing: 0.5 }),
		recipe('drahe', { costPerServing: 3 }),
		recipe('palive', { spicy: 2, costPerServing: 0.6 }),
		recipe('slabe', { protein: 5, costPerServing: 0.2 }),
		recipe('orechy', { allergens: ['nuts'], costPerServing: 0.7 }),
		recipe('dezert', { meals: ['dezert'], costPerServing: 0.1 })
	];

	it('covers every meal with servings for everyone', () => {
		const plan = autoPlan(recipes, base);
		expect(plan.meals).toBe(4);
		for (const e of plan.entries) expect(e.servings % 2).toBe(0);
		expect(plan.entries.reduce((s, e) => s + e.servings, 0)).toBe(8);
	});

	it('respects protein, spice, allergens and meal type', () => {
		const plan = autoPlan(recipes, { ...base, mild: true, excludeAllergens: ['nuts'] });
		const ids = plan.entries.map((e) => e.recipeId);
		expect(ids).not.toContain('slabe');
		expect(ids).not.toContain('palive');
		expect(ids).not.toContain('orechy');
		expect(ids).not.toContain('dezert');
	});

	it('uses the gluten-free variant or skips the recipe', () => {
		const withGluten = recipe('cestoviny', {
			gluten: 'contains',
			costPerServing: 0.1,
			variants: [
				{
					...recipe('x'),
					name: 'Bezlepková verzia',
					description: '',
					gluten: 'free'
				}
			]
		});
		const plan = autoPlan([withGluten], { ...base, glutenFree: true, days: 1 });
		expect(plan.entries).toEqual([
			{ recipeId: 'cestoviny', servings: 2, variant: 'Bezlepková verzia' }
		]);
	});

	it('prefers plans within the budget', () => {
		const plan = autoPlan(recipes, { ...base, budget: 6 });
		expect(plan.withinBudget).toBe(true);
		expect(plan.cost).toBeLessThanOrEqual(6);
	});

	it('does not stretch leftovers past the fridge', () => {
		const plan = autoPlan(
			[recipe('polievka', { keeps: { fridge: 0, freezer: 0 } }), recipe('kari')],
			{
				...base,
				days: 3,
				people: 1
			}
		);
		const soup = plan.entries.find((e) => e.recipeId === 'polievka');
		if (soup) expect(soup.servings).toBe(1);
	});
});

describe('swapEntry', () => {
	const recipes = ['a', 'b', 'c', 'd'].map((id, i) => recipe(id, { costPerServing: 1 + i * 0.1 }));

	it('replaces one recipe with one not in the plan, keeping its servings', () => {
		const plan = autoPlan(recipes, { ...base, days: 2, batchCooking: false });
		const swapped = swapEntry(recipes, base, plan, 0);
		expect(swapped.entries[0].recipeId).not.toBe(plan.entries[0].recipeId);
		expect(plan.entries.map((e) => e.recipeId)).not.toContain(swapped.entries[0].recipeId);
		expect(swapped.entries[0].servings).toBe(plan.entries[0].servings);
		expect(swapped.entries[1]).toEqual(plan.entries[1]);
	});
});
