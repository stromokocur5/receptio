import type { PlanEntry } from './shopping';

/** Cooked food keeps about this long in the fridge; later leftovers should be frozen. */
export const FRIDGE_DAYS = 3;

export interface ScheduledMeal {
	entry: PlanEntry;
	/** Cook a fresh batch, or eat what's left of an earlier one. */
	kind: 'cook' | 'leftover';
	/** Days since the batch was cooked (0 on the cooking day). */
	age: number;
}

export interface ScheduleDay {
	/** One slot per meal of the day; null when the plan has run out. */
	meals: (ScheduledMeal | null)[];
}

/**
 * Lays the plan out over days: each entry is cooked once and then eaten as leftovers until its
 * servings run out, `people` servings per meal. Entries go in plan order, so reordering the plan
 * changes what's cooked when.
 */
export function mealSchedule(
	entries: PlanEntry[],
	people: number,
	mealsPerDay: number,
	days: number
): { days: ScheduleDay[]; unplannedMeals: number; extraServings: number } {
	const queue = entries.map((entry) => ({ entry, left: entry.servings, cookedOn: -1 }));
	const result: ScheduleDay[] = [];
	let unplannedMeals = 0;

	for (let day = 0; day < days; day++) {
		const meals: (ScheduledMeal | null)[] = [];
		for (let slot = 0; slot < mealsPerDay; slot++) {
			// A meal needs a serving for everyone; a smaller remainder is just a spare portion.
			const batch = queue.find((b) => b.left >= people);
			if (!batch) {
				meals.push(null);
				unplannedMeals++;
				continue;
			}
			const kind = batch.cookedOn === -1 ? 'cook' : 'leftover';
			if (kind === 'cook') batch.cookedOn = day;
			meals.push({ entry: batch.entry, kind, age: day - batch.cookedOn });
			batch.left -= people;
		}
		result.push({ meals });
	}
	const extraServings = queue.reduce((sum, b) => sum + Math.max(0, b.left), 0);
	return { days: result, unplannedMeals, extraServings };
}
