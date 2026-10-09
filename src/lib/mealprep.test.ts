import { describe, expect, it } from 'vitest';
import { batchPlan, formatMinutes, prepList, prepSchedule } from './mealprep';
import type { Ingredient, RecipeLine, RecipeSummary } from './types';

function recipe(
	id: string,
	time: number,
	activeTime: number,
	lines: [string, number][] = []
): RecipeSummary {
	return {
		id,
		title: id,
		time,
		activeTime,
		servings: 2,
		variants: [],
		lines: lines.map(([ingredientId, grams]): RecipeLine => ({
			ingredientId,
			grams,
			amount: grams,
			unit: 'g'
		}))
	} as unknown as RecipeSummary;
}

const item = (r: RecipeSummary, servings = 2) => ({
	entry: { recipeId: r.id, servings },
	recipe: r
});

describe('meal prep', () => {
	it('starts the long hands-off dish first and fills the wait', () => {
		const stew = recipe('gulas', 90, 20);
		const salad = recipe('salat', 15, 15);
		const curry = recipe('kari', 40, 25);
		const plan = prepSchedule([item(salad), item(stew), item(curry)]);
		expect(plan.slots.map((s) => s.recipe.id)).toEqual(['gulas', 'kari', 'salat']);
		expect(plan.slots.map((s) => s.start)).toEqual([0, 20, 45]);
		expect(plan.total).toBe(90);
		expect(plan.oneByOne).toBe(145);
	});

	it('sums the chopping across recipes, scaled to servings', () => {
		const byId = new Map<string, Ingredient>([
			['cibula', { id: 'cibula', name: 'Cibuľa', category: 'zelenina' } as Ingredient],
			['ryza', { id: 'ryza', name: 'Ryža', category: 'obilniny' } as Ingredient]
		]);
		const a = recipe('a', 30, 10, [
			['cibula', 100],
			['ryza', 200]
		]);
		const b = recipe('b', 30, 10, [['cibula', 50]]);
		const list = prepList([item(a, 4), item(b)], byId);
		expect(list).toHaveLength(1);
		expect(list[0].grams).toBe(250);
		expect(list[0].usedIn).toEqual(['a', 'b']);
	});

	it('formats minutes', () => {
		expect(formatMinutes(40)).toBe('40 min');
		expect(formatMinutes(60)).toBe('1 h');
		expect(formatMinutes(85)).toBe('1 h 25 min');
	});
});

describe('batchPlan', () => {
	it('keeps the first days in the fridge and freezes the rest', () => {
		const plan = batchPlan({ fridge: 3, freezer: 3 }, 5, 2)!;
		expect(plan.days.map((d) => d.from)).toEqual([
			'fridge',
			'fridge',
			'fridge',
			'freezer',
			'freezer'
		]);
		expect(plan).toMatchObject({ batches: [10], fridge: 6, freezer: 4 });
	});

	it('cooks again when the food does not freeze', () => {
		const plan = batchPlan({ fridge: 2, freezer: 0 }, 5, 1)!;
		expect(plan.days.map((d) => d.cook)).toEqual([true, false, true, false, true]);
		expect(plan.batches).toEqual([2, 2, 1]);
		expect(plan.freezer).toBe(0);
	});

	it('has nothing to plan for food eaten fresh', () => {
		expect(batchPlan({ fridge: 0, freezer: 0 }, 5, 1)).toBeNull();
		expect(batchPlan(undefined, 5, 1)).toBeNull();
	});
});
