import { planLines, type PlanEntry } from './shopping';
import type { Ingredient, RecipeSummary } from './types';

/** One recipe in a cooking session: when to start it, counted from the moment you begin. */
export interface PrepSlot {
	entry: PlanEntry;
	recipe: RecipeSummary;
	/** Minutes from the start of the session. */
	start: number;
	end: number;
}

export interface PrepSchedule {
	slots: PrepSlot[];
	/** Minutes for everything, cooked in this order. */
	total: number;
	/** Minutes when cooked one after another. */
	oneByOne: number;
}

/** The recipe as the planned variant is cooked: its own time and preparation ahead, when it has them. */
export function asPlanned(recipe: RecipeSummary, variantName?: string): RecipeSummary {
	const variant = variantName ? recipe.variants.find((v) => v.name === variantName) : undefined;
	if (!variant) return recipe;
	return {
		...recipe,
		time: variant.time ?? recipe.time,
		activeTime: variant.activeTime ?? recipe.activeTime,
		ahead: variant.ahead === undefined ? recipe.ahead : (variant.ahead ?? undefined)
	};
}

/** Hands-off minutes: simmering, baking, resting. */
const passive = (r: RecipeSummary) => r.time - r.activeTime;

/**
 * Orders recipes so the long hands-off ones (a stew that simmers an hour) start first and the
 * quick ones fill that waiting time. The cook works on one thing at a time, so each recipe starts
 * when the hands-on part of the previous one is done.
 */
export function prepSchedule(items: { entry: PlanEntry; recipe: RecipeSummary }[]): PrepSchedule {
	const ordered = [...items].sort(
		(a, b) => passive(b.recipe) - passive(a.recipe) || b.recipe.time - a.recipe.time
	);
	let busyUntil = 0;
	const slots = ordered.map(({ entry, recipe }) => {
		const start = busyUntil;
		busyUntil += recipe.activeTime;
		return { entry, recipe, start, end: start + recipe.time };
	});
	return {
		slots,
		total: Math.max(0, ...slots.map((s) => s.end)),
		oneByOne: items.reduce((sum, { recipe }) => sum + recipe.time, 0)
	};
}

export interface PrepItem {
	ingredient: Ingredient;
	grams: number;
	/** Titles of the recipes that use it. */
	usedIn: string[];
}

/** Vegetables, fruit and herbs are what gets washed and chopped – do it once for everything. */
const CHOPPED = new Set(['zelenina', 'ovocie']);

export function prepList(
	items: { entry: PlanEntry; recipe: RecipeSummary }[],
	byId: Map<string, Ingredient>
): PrepItem[] {
	const found = new Map<string, PrepItem>();
	for (const { entry, recipe } of items) {
		const factor = entry.servings / recipe.servings;
		for (const line of planLines(recipe, entry.variant)) {
			const ingredient = byId.get(line.ingredientId);
			if (!ingredient || !CHOPPED.has(ingredient.category) || line.grams <= 0) continue;
			const item = found.get(ingredient.id) ?? { ingredient, grams: 0, usedIn: [] };
			item.grams += line.grams * factor;
			if (!item.usedIn.includes(recipe.title)) item.usedIn.push(recipe.title);
			found.set(ingredient.id, item);
		}
	}
	// What several recipes share first – that's where cooking together saves the most.
	return [...found.values()].sort(
		(a, b) =>
			b.usedIn.length - a.usedIn.length || a.ingredient.name.localeCompare(b.ingredient.name, 'sk')
	);
}

/** "1 h 25 min", "40 min". */
export function formatMinutes(minutes: number): string {
	const h = Math.floor(minutes / 60);
	const m = Math.round(minutes % 60);
	if (!h) return `${m} min`;
	return m ? `${h} h ${m} min` : `${h} h`;
}

/** One day of eating a batch: where that day's boxes come from. */
export interface BatchDay {
	/** 0 = the day you cook. */
	day: number;
	from: 'fridge' | 'freezer';
	/** Starts a new batch: cooked that day, because the last one wouldn't keep. */
	cook: boolean;
}

export interface BatchPlan {
	days: BatchDay[];
	/** Portions to cook in each session, in order. */
	batches: number[];
	fridge: number;
	freezer: number;
}

/**
 * How a recipe cooked once covers several days: the first days from the fridge as long as it
 * keeps there, the rest frozen – or, when it doesn't freeze, cooked again. Null when it has to
 * be eaten fresh.
 */
export function batchPlan(
	keeps: { fridge: number; freezer: number } | undefined,
	days: number,
	perDay: number
): BatchPlan | null {
	if (!keeps || keeps.fridge < 1 || days < 1 || perDay < 1) return null;
	const out: BatchDay[] = [];
	const batches: number[] = [];
	let cookedOn = 0;
	for (let day = 0; day < days; day++) {
		const fresh = day - cookedOn < keeps.fridge;
		if (fresh || keeps.freezer > 0) {
			out.push({ day, from: fresh ? 'fridge' : 'freezer', cook: day === 0 });
		} else {
			cookedOn = day;
			out.push({ day, from: 'fridge', cook: true });
		}
		if (out[day].cook) batches.push(0);
		batches[batches.length - 1] += perDay;
	}
	const frozenDays = out.filter((d) => d.from === 'freezer').length;
	return {
		days: out,
		batches,
		fridge: (days - frozenDays) * perDay,
		freezer: frozenDays * perDay
	};
}
