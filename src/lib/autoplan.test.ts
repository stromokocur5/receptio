import { describe, expect, it } from 'vitest';
import { autoPlan, openPacks, packsFinished, swapEntry, type AutoPlanOptions } from './autoplan';
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

describe('breakfasts', () => {
	const recipes = [
		...['a', 'b', 'c'].map((id) => recipe(id)),
		recipe('kasa', { meals: ['ranajky'], protein: 8 }),
		recipe('palacinky', { meals: ['ranajky'], protein: 9 }),
		recipe('praženica', { meals: ['ranajky', 'obed'], protein: 25 })
	];

	it('adds a breakfast for every day from breakfast-only recipes', () => {
		const plan = autoPlan(recipes, { ...base, breakfasts: true, minProtein: 15 });
		const morning = plan.entries.filter((e) => e.breakfast);
		expect(morning.length).toBeGreaterThan(0);
		expect(morning.every((e) => ['kasa', 'palacinky'].includes(e.recipeId))).toBe(true);
		expect(morning.reduce((sum, e) => sum + e.servings, 0)).toBe(base.days * base.people);
		expect(plan.wanted).toBe(base.days * base.mealsPerDay + base.days);
		// A main meal's protein floor doesn't apply to breakfasts.
		expect(plan.minProtein).toBeGreaterThanOrEqual(15);
	});

	it('plans breakfasts alone when no lunch or dinner is wanted', () => {
		const plan = autoPlan(recipes, { ...base, mealsPerDay: 0, breakfasts: true });
		expect(plan.entries.length).toBeGreaterThan(0);
		expect(plan.entries.every((e) => e.breakfast)).toBe(true);
		expect(plan.wanted).toBe(base.days);
	});

	it('swaps a breakfast only for another breakfast', () => {
		const plan = autoPlan(recipes, { ...base, breakfasts: true });
		const index = plan.entries.findIndex((e) => e.breakfast);
		const swapped = swapEntry(recipes, { ...base, breakfasts: true }, plan, index);
		expect(swapped.entries[index].breakfast).toBe(true);
		expect(['kasa', 'palacinky']).toContain(swapped.entries[index].recipeId);
	});
});

describe('diary gaps', () => {
	it('prefers recipes that bring what the diary is short of', () => {
		const recipes = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => recipe(id));
		const rich = new Set(['e', 'f']);
		const counts = { rich: 0, other: 0 };
		for (let seed = 1; seed <= 20; seed++) {
			const plan = autoPlan(
				recipes,
				{ ...base, days: 2, people: 1, seed, batchCooking: false },
				{ bonus: (r) => (rich.has(r.id) ? 2 : 0) }
			);
			for (const e of plan.entries) counts[rich.has(e.recipeId) ? 'rich' : 'other']++;
		}
		expect(counts.rich).toBeGreaterThan(counts.other);
	});
});

describe('open packs', () => {
	const line = (ingredientId: string, grams: number) => ({
		ingredientId,
		grams,
		amount: grams,
		unit: 'g' as const
	});

	it('counts what a recipe uses up from packs already open', () => {
		const open = new Map<string, number>();
		openPacks([{ id: 'koriander', grams: 10, pack: 30 }], open);
		expect(open.get('koriander')).toBe(20);
		expect(packsFinished([{ id: 'koriander', grams: 15, pack: 30 }], open)).toBe(0.5);
		openPacks([{ id: 'koriander', grams: 25, pack: 30 }], open);
		expect(open.get('koriander')).toBe(25);
	});

	it('prefers a second recipe that finishes the first one’s pack', () => {
		const recipes = [
			recipe('kari', { lines: [line('koriander', 10)], costPerServing: 0.5 }),
			recipe('pho', { lines: [line('koriander', 15)] }),
			recipe('a'),
			recipe('b'),
			recipe('c'),
			recipe('d')
		];
		const together = (packOf?: (id: string) => number | undefined) => {
			let count = 0;
			for (let seed = 1; seed <= 60; seed++) {
				const plan = autoPlan(
					recipes,
					{ ...base, days: 4, people: 1, seed, batchCooking: false },
					{ packOf }
				);
				const ids = plan.entries.map((e) => e.recipeId);
				if (ids.includes('kari') && ids.includes('pho')) count++;
			}
			return count;
		};
		expect(together((id) => (id === 'koriander' ? 30 : undefined))).toBeGreaterThan(
			together() * 1.5
		);
	});
});
