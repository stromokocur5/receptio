import type { PlanEntry } from './shopping';

/** How long cooked food keeps in the fridge when the recipe doesn't say. */
export const FRIDGE_DAYS = 3;

export interface Keeps {
	fridge: number;
	freezer: number;
}

export interface ScheduledMeal {
	entry: PlanEntry;
	/** Cook a fresh batch, or eat what's left of an earlier one. */
	kind: 'cook' | 'leftover';
	/** Days since the batch was cooked (0 on the cooking day). */
	age: number;
	/** Older than the fridge allows: freeze it on the cooking day (or cook it later). */
	freeze: boolean;
	/** …and it can't be frozen either. */
	spoils: boolean;
}

export interface ScheduleDay {
	/** One slot per meal of the day; null when the plan has run out. */
	meals: (ScheduledMeal | null)[];
	/** Planned only when breakfasts are planned too; null when they ran out. */
	breakfast?: ScheduledMeal | null;
}

export interface ScheduleOptions {
	keeps?: (recipeId: string) => Keeps | undefined;
	/** Plan a breakfast every day from the entries marked as breakfast. */
	breakfasts?: boolean;
	isBreakfast?: (entry: PlanEntry) => boolean;
}

/**
 * Lays the plan out over days: each entry is cooked once and then eaten as leftovers until its
 * servings run out, `people` servings per meal. Entries go in plan order, so reordering the plan
 * changes what's cooked when. Breakfasts, when planned, are a queue of their own.
 */
export function mealSchedule(
	entries: PlanEntry[],
	people: number,
	mealsPerDay: number,
	days: number,
	{ keeps = () => undefined, breakfasts = false, isBreakfast = () => false }: ScheduleOptions = {}
): {
	days: ScheduleDay[];
	unplannedMeals: number;
	unplannedBreakfasts: number;
	extraServings: number;
} {
	// Servings cooked to freeze aren't eaten in this plan.
	const all = entries.map((entry) => ({
		entry,
		left: entry.servings - (entry.freezeExtra ?? 0),
		cookedOn: -1
	}));
	const morning = breakfasts ? all.filter((b) => isBreakfast(b.entry)) : [];
	const rest = breakfasts ? all.filter((b) => !isBreakfast(b.entry)) : all;
	const result: ScheduleDay[] = [];
	let unplannedMeals = 0;
	let unplannedBreakfasts = 0;

	const serve = (queue: typeof all, day: number): ScheduledMeal | null => {
		// A meal needs a serving for everyone; a smaller remainder is just a spare portion.
		const batch = queue.find((b) => b.left >= people);
		if (!batch) return null;
		const kind = batch.cookedOn === -1 ? 'cook' : 'leftover';
		if (kind === 'cook') batch.cookedOn = day;
		const age = day - batch.cookedOn;
		const { fridge, freezer } = keeps(batch.entry.recipeId) ?? {
			fridge: FRIDGE_DAYS,
			freezer: 0
		};
		const tooOld = age > fridge;
		batch.left -= people;
		return {
			entry: batch.entry,
			kind,
			age,
			freeze: tooOld && freezer > 0,
			spoils: tooOld && freezer === 0
		};
	};

	for (let day = 0; day < days; day++) {
		const scheduled: ScheduleDay = { meals: [] };
		if (breakfasts) {
			scheduled.breakfast = serve(morning, day);
			if (!scheduled.breakfast) unplannedBreakfasts++;
		}
		for (let slot = 0; slot < mealsPerDay; slot++) {
			const meal = serve(rest, day);
			if (!meal) unplannedMeals++;
			scheduled.meals.push(meal);
		}
		result.push(scheduled);
	}
	const extraServings = all.reduce((sum, b) => sum + Math.max(0, b.left), 0);
	return { days: result, unplannedMeals, unplannedBreakfasts, extraServings };
}
