import { describe, expect, it } from 'vitest';
import { mealSchedule, type ScheduledMeal } from './schedule';

/** The recipe eaten at a meal, '-' when the plan ran out, 'away' when nobody eats at home. */
const id = (meal: ScheduledMeal | null | false | undefined) =>
	meal === false ? 'away' : (meal?.entry.recipeId ?? '-');

const summary = (days: ReturnType<typeof mealSchedule>['days']) =>
	days.map((d) =>
		d.meals.map((m) => (m ? `${m.kind === 'cook' ? '+' : '~'}${m.entry.recipeId}${m.age}` : '-'))
	);

describe('mealSchedule', () => {
	it('cooks each batch once and eats leftovers until it runs out', () => {
		const { days, unplannedMeals, extraServings } = mealSchedule(
			[
				{ recipeId: 'cili', servings: 6 },
				{ recipeId: 'dal', servings: 3 }
			],
			2,
			1,
			5
		);
		expect(summary(days)).toEqual([['+cili0'], ['~cili1'], ['~cili2'], ['+dal0'], ['-']]);
		// 3 servings of dal for two people: one meal and a spare portion.
		expect(unplannedMeals).toBe(1);
		expect(extraServings).toBe(1);
	});

	it('says when leftovers outlast the fridge', () => {
		const keeps = (id: string) =>
			id === 'polievka' ? { fridge: 1, freezer: 3 } : { fridge: 1, freezer: 0 };
		const { days } = mealSchedule(
			[
				{ recipeId: 'polievka', servings: 3 },
				{ recipeId: 'salat', servings: 3 }
			],
			1,
			1,
			6,
			{ keeps }
		);
		const flags = days.map((d) => d.meals[0] && [d.meals[0].freeze, d.meals[0].spoils]);
		expect(flags).toEqual([
			[false, false],
			[false, false],
			[true, false],
			[false, false],
			[false, false],
			[false, true]
		]);
	});

	it('reports empty slots and servings beyond the planned days', () => {
		const short = mealSchedule([{ recipeId: 'cili', servings: 2 }], 1, 2, 2);
		expect(summary(short.days)).toEqual([
			['+cili0', '~cili0'],
			['-', '-']
		]);
		expect(short.unplannedMeals).toBe(2);

		const long = mealSchedule([{ recipeId: 'cili', servings: 8 }], 1, 1, 3);
		expect(long.extraServings).toBe(5);
	});
});

describe('breakfasts', () => {
	it('fills a breakfast slot from breakfast entries only, the rest stay lunches', () => {
		const plan = mealSchedule(
			[
				{ recipeId: 'kasa', servings: 2, breakfast: true },
				{ recipeId: 'dal', servings: 3 }
			],
			1,
			1,
			3,
			{ breakfasts: true, isBreakfast: (e) => e.breakfast === true }
		);
		expect(plan.days.map((d) => [id(d.breakfast), id(d.meals[0])])).toEqual([
			['kasa', 'dal'],
			['kasa', 'dal'],
			['-', 'dal']
		]);
		expect(plan.unplannedBreakfasts).toBe(1);
		expect(plan.unplannedMeals).toBe(0);
	});

	it("treats breakfast entries as ordinary meals when breakfasts aren't planned", () => {
		const plan = mealSchedule([{ recipeId: 'kasa', servings: 2, breakfast: true }], 1, 1, 2, {
			isBreakfast: () => true
		});
		expect(plan.days.map((d) => id(d.meals[0]))).toEqual(['kasa', 'kasa']);
		expect(plan.days[0].breakfast).toBeUndefined();
	});
});

describe('freezer', () => {
	it('leaves the frozen half out of the days', () => {
		const plan = mealSchedule([{ recipeId: 'cili', servings: 8, freezeExtra: 4 }], 2, 1, 3);
		expect(plan.days.map((d) => id(d.meals[0]))).toEqual(['cili', 'cili', '-']);
		expect(plan.extraServings).toBe(0);
	});
});

describe('portions by meal', () => {
	it('serves each meal what the people at home eat, and skips meals nobody is home for', () => {
		// Day 0: two adults and a child (2.5) at lunch; day 1: nobody home; day 2: one adult.
		const portions = [2.5, 0, 1];
		const plan = mealSchedule([{ recipeId: 'dal', servings: 4 }], 1, 1, 3, {
			need: (day) => portions[day]
		});
		expect(plan.days.map((d) => id(d.meals[0]))).toEqual(['dal', 'away', 'dal']);
		expect(plan.days[2].meals[0]).toMatchObject({ kind: 'leftover', age: 2 });
		expect(plan.unplannedMeals).toBe(0);
		expect(plan.extraServings).toBe(0);
	});
});
