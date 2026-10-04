import { addScaled, emptyNutrients, scaleNutrients } from './nutrition';
import type { Ingredient, Nutrients, RecipeSummary } from './types';

/**
 * Food and water diary. Off until the user switches it on; calories stay hidden unless asked for,
 * because counting them isn't the point of the app and isn't healthy for everyone.
 */

export type JournalItem =
	| { id: string; kind: 'recipe'; recipeId: string; variant?: string; portions: number }
	| { id: string; kind: 'ingredient'; ingredientId: string; grams: number }
	/** Something bought or eaten out, with only what the label or the user knows. */
	| { id: string; kind: 'custom'; name: string; kcal: number | null; protein: number | null };

export interface JournalDay {
	waterMl: number;
	items: JournalItem[];
}

export interface Journal {
	enabled: boolean;
	showKcal: boolean;
	waterGoalMl: number;
	/** ISO date → that day's log. */
	days: Record<string, JournalDay>;
}

export const NO_JOURNAL: Journal = { enabled: false, showKcal: false, waterGoalMl: 2000, days: {} };

/** How far back days are kept; older ones are dropped on the next save. */
export const JOURNAL_DAYS_KEPT = 90;
export const MAX_ITEMS_PER_DAY = 40;
export const WATER_STEP_ML = 250;
const MAX_WATER_ML = 10_000;
const MAX_CUSTOM_NAME = 60;

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const num = (v: unknown, min: number, max: number): v is number =>
	typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const optionalNum = (v: unknown, max: number): number | null | undefined =>
	v === null || v === undefined ? null : num(v, 0, max) ? v : undefined;

function validateItem(raw: unknown): JournalItem | undefined {
	if (!isRecord(raw) || typeof raw.id !== 'string' || raw.id.length > 40) return undefined;
	const id = raw.id;
	if (raw.kind === 'recipe') {
		if (typeof raw.recipeId !== 'string' || !num(raw.portions, 0.1, 20)) return undefined;
		if (raw.variant !== undefined && typeof raw.variant !== 'string') return undefined;
		const item = { id, kind: 'recipe' as const, recipeId: raw.recipeId, portions: raw.portions };
		return raw.variant ? { ...item, variant: raw.variant } : item;
	}
	if (raw.kind === 'ingredient') {
		if (typeof raw.ingredientId !== 'string' || !num(raw.grams, 1, 5000)) return undefined;
		return { id, kind: 'ingredient', ingredientId: raw.ingredientId, grams: raw.grams };
	}
	if (raw.kind === 'custom') {
		const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, MAX_CUSTOM_NAME) : '';
		const kcal = optionalNum(raw.kcal, 5000);
		const protein = optionalNum(raw.protein, 500);
		if (!name || kcal === undefined || protein === undefined) return undefined;
		return { id, kind: 'custom', name, kcal, protein };
	}
	return undefined;
}

function validateDay(raw: unknown): JournalDay | undefined {
	if (!isRecord(raw) || !Array.isArray(raw.items)) return undefined;
	return {
		waterMl: num(raw.waterMl, 0, MAX_WATER_ML) ? raw.waterMl : 0,
		items: raw.items.flatMap((i) => validateItem(i) ?? []).slice(0, MAX_ITEMS_PER_DAY)
	};
}

export function validateJournal(raw: unknown): Journal | undefined {
	if (!isRecord(raw)) return undefined;
	const days = isRecord(raw.days)
		? Object.fromEntries(
				Object.entries(raw.days)
					.filter(([date]) => isDate(date))
					.flatMap(([date, day]) => {
						const valid = validateDay(day);
						return valid ? [[date, valid] as const] : [];
					})
			)
		: {};
	return {
		enabled: raw.enabled === true,
		showKcal: raw.showKcal === true,
		waterGoalMl: num(raw.waterGoalMl, 500, 5000) ? raw.waterGoalMl : NO_JOURNAL.waterGoalMl,
		days
	};
}

export const EMPTY_DAY: JournalDay = { waterMl: 0, items: [] };

/** Returns the journal with one day changed; empty days and days past the window are dropped. */
export function withDay(
	journal: Journal,
	date: string,
	change: (day: JournalDay) => JournalDay,
	today: string
): Journal {
	const next = change(journal.days[date] ?? EMPTY_DAY);
	const oldest = shiftDate(today, -(JOURNAL_DAYS_KEPT - 1));
	const days = Object.fromEntries(
		Object.entries({ ...journal.days, [date]: next }).filter(
			([d, day]) => d >= oldest && (day.waterMl > 0 || day.items.length > 0)
		)
	);
	return { ...journal, days };
}

export function addWater(day: JournalDay, ml: number): JournalDay {
	return { ...day, waterMl: Math.min(MAX_WATER_ML, Math.max(0, day.waterMl + ml)) };
}

export function addItem(day: JournalDay, item: JournalItem): JournalDay {
	if (day.items.length >= MAX_ITEMS_PER_DAY) return day;
	return { ...day, items: [...day.items, item] };
}

export function removeItem(day: JournalDay, id: string): JournalDay {
	return { ...day, items: day.items.filter((i) => i.id !== id) };
}

/** `2026-10-04` moved by `days`, in UTC so it never skips a day around DST. */
export function shiftDate(iso: string, days: number): string {
	const d = new Date(`${iso}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

/** Today in the user's own time zone (toISOString would give yesterday before 2 a.m. in summer). */
export function localToday(now = new Date()): string {
	const offset = now.getTimezoneOffset() * 60_000;
	return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export interface DayTotals {
	nutrients: Nutrients;
	/** Items whose nutrients aren't known (strained DIY recipes, custom food without numbers). */
	unknown: number;
	/** Custom food counts only toward energy and protein, so other totals are lower than real. */
	partial: boolean;
}

export function itemNutrients(
	item: JournalItem,
	recipesById: Map<string, RecipeSummary>,
	ingredientsById: Map<string, Ingredient>
): Nutrients | null {
	if (item.kind === 'recipe') {
		const recipe = recipesById.get(item.recipeId);
		if (!recipe?.showNutrition) return null;
		const data = (item.variant && recipe.variants.find((v) => v.name === item.variant)) || recipe;
		return scaleNutrients(data.perServing, item.portions);
	}
	if (item.kind === 'ingredient') {
		const ingredient = ingredientsById.get(item.ingredientId);
		return ingredient ? addScaled(emptyNutrients(), ingredient.per100g, item.grams) : null;
	}
	if (item.kcal === null && item.protein === null) return null;
	return { ...emptyNutrients(), kcal: item.kcal ?? 0, protein: item.protein ?? 0 };
}

export function dayTotals(
	day: JournalDay,
	recipesById: Map<string, RecipeSummary>,
	ingredientsById: Map<string, Ingredient>
): DayTotals {
	const nutrients = emptyNutrients();
	let unknown = 0;
	let partial = false;
	for (const item of day.items) {
		const n = itemNutrients(item, recipesById, ingredientsById);
		if (!n) {
			unknown++;
			continue;
		}
		if (item.kind === 'custom') partial = true;
		for (const key of Object.keys(nutrients) as (keyof Nutrients)[]) nutrients[key] += n[key];
	}
	return { nutrients, unknown, partial };
}
