import {
	ACTIVITY_PROTEIN,
	addScaled,
	DEFAULT_GOALS,
	emptyNutrients,
	GOAL_LIMITS,
	scaleNutrients,
	type Activity,
	type GoalKey,
	type NutrientGoals
} from './nutrition';
import {
	NUTRIENT_KEYS,
	type Ingredient,
	type NutrientKey,
	type Nutrients,
	type RecipeSummary
} from './types';

/**
 * Food and water diary. Off until the user switches it on; calories stay hidden unless asked for,
 * because counting them isn't the point of the app and isn't healthy for everyone.
 */

/** Which meal of the day an entry belongs to, so the day reads like a day. */
export const DIARY_MEALS = ['ranajky', 'obed', 'vecera', 'snack'] as const;
export type DiaryMeal = (typeof DIARY_MEALS)[number];
export const DIARY_MEAL_LABELS: Record<DiaryMeal, string> = {
	ranajky: 'Raňajky',
	obed: 'Obed',
	vecera: 'Večera',
	snack: 'Medzi jedlami'
};

/** A sensible default for food logged at this time of day. */
export function mealAt(date: Date): DiaryMeal {
	const minutes = date.getHours() * 60 + date.getMinutes();
	if (minutes < 10 * 60 + 30) return 'ranajky';
	if (minutes < 15 * 60) return 'obed';
	if (minutes < 17 * 60) return 'snack';
	if (minutes < 22 * 60) return 'vecera';
	return 'snack';
}

/**
 * What a label (or the user) tells about a food: every nutrient Receptio follows, each of them
 * possibly unknown. Labels give energy, macros, fibre and salt; minerals and B12 only sometimes.
 */
export type LabelValues = Record<NutrientKey, number | null>;
export const LABEL_KEYS = NUTRIENT_KEYS;
export const LABEL_MAX: Record<NutrientKey, number> = {
	kcal: 5000,
	protein: 500,
	carbs: 1000,
	fat: 500,
	fiber: 200,
	salt: 100,
	iron: 200,
	calcium: 5000,
	zinc: 200,
	ala: 100,
	b12: 1000
};

export type JournalItem = (
	| { id: string; kind: 'recipe'; recipeId: string; variant?: string; portions: number }
	| { id: string; kind: 'ingredient'; ingredientId: string; grams: number }
	/** Something bought or eaten out, with only what the label or the user knows. */
	| ({ id: string; kind: 'custom'; name: string } & LabelValues)
) & { meal?: DiaryMeal };

/**
 * Food the user eats often that Receptio doesn't know (a favourite bar, bread from the bakery),
 * kept to log again with one tap. Values are per 100 g, or per piece when `per100g` is false.
 */
export interface SavedFood extends LabelValues {
	id: string;
	name: string;
	per100g: boolean;
}
export const MAX_SAVED_FOODS = 60;

export interface JournalDay {
	waterMl: number;
	items: JournalItem[];
	/** Supplement ids taken that day. */
	taken?: string[];
}

/** A vitamin or supplement taken daily at a set time (minutes after midnight, on the half hour). */
export interface Supplement {
	id: string;
	name: string;
	time: number;
}

/** Common picks for plant-based eaters; anything else can be typed in. */
export const SUPPLEMENT_PRESETS: { name: string; time: number; why: string; wiki: string }[] = [
	{ name: 'Vitamín B12', time: 8 * 60, why: 'z rastlín ho nezískaš', wiki: 'b12' },
	{ name: 'Vitamín D', time: 8 * 60, why: 'od októbra do marca', wiki: 'vitamin-d' },
	{ name: 'Omega-3 z rias', time: 13 * 60, why: 'k jedlu s tukom', wiki: 'omega-3' },
	{ name: 'Jód', time: 8 * 60, why: 'ak nesolíš jódovanou soľou', wiki: 'jod' },
	{ name: 'Železo', time: 10 * 60, why: 'len ak ti ho odporučil lekár', wiki: 'zelezo' },
	{ name: 'Kreatín', time: 13 * 60, why: 'pri silovom tréningu', wiki: 'silovy-trening' }
];
export const MAX_SUPPLEMENTS = 8;
const MAX_SUPPLEMENT_NAME = 40;

/** An older day squeezed to its totals, so a year of diary stays small enough to sync. */
export interface DaySummary {
	waterMl: number;
	nutrients: Nutrients;
	/** How many things were eaten, and for how many of them the values weren't known. */
	items: number;
	unknown: number;
}

export interface Journal {
	enabled: boolean;
	showKcal: boolean;
	waterGoalMl: number;
	/** Daily nutrient goals: protein by activity, or numbers the user set. */
	goals: NutrientGoals;
	supplements: Supplement[];
	foods: SavedFood[];
	/** ISO date → that day's log, for the recent days. */
	days: Record<string, JournalDay>;
	/** ISO date → totals, for days older than JOURNAL_DETAIL_DAYS. */
	summaries: Record<string, DaySummary>;
}

export const NO_JOURNAL: Journal = {
	enabled: false,
	showKcal: false,
	waterGoalMl: 2000,
	goals: DEFAULT_GOALS,
	supplements: [],
	foods: [],
	days: {},
	summaries: {}
};

/** Days kept item by item; older ones become totals. */
export const JOURNAL_DETAIL_DAYS = 90;
/** How far back the diary goes at all. */
export const JOURNAL_DAYS_KEPT = 365;
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

/** Label numbers, each valid or null; undefined when one is out of range. */
function validateLabel(raw: Record<string, unknown>): LabelValues | undefined {
	const values = {} as LabelValues;
	for (const key of LABEL_KEYS) {
		const v = optionalNum(raw[key], LABEL_MAX[key]);
		if (v === undefined) return undefined;
		values[key] = v;
	}
	return values;
}

function validateItem(raw: unknown): JournalItem | undefined {
	const item = validateFood(raw);
	if (!item || !isRecord(raw)) return undefined;
	return DIARY_MEALS.includes(raw.meal as DiaryMeal)
		? { ...item, meal: raw.meal as DiaryMeal }
		: item;
}

function validateFood(raw: unknown): JournalItem | undefined {
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
		const values = validateLabel(raw);
		if (!name || !values) return undefined;
		return { id, kind: 'custom', name, ...values };
	}
	return undefined;
}

function validateDay(raw: unknown): JournalDay | undefined {
	if (!isRecord(raw) || !Array.isArray(raw.items)) return undefined;
	const day: JournalDay = {
		waterMl: num(raw.waterMl, 0, MAX_WATER_ML) ? raw.waterMl : 0,
		items: raw.items.flatMap((i) => validateItem(i) ?? []).slice(0, MAX_ITEMS_PER_DAY)
	};
	const taken = Array.isArray(raw.taken)
		? raw.taken.filter((t): t is string => typeof t === 'string' && t.length <= 40)
		: [];
	if (taken.length) day.taken = [...new Set(taken)].slice(0, MAX_SUPPLEMENTS);
	return day;
}

export const isSupplementTime = (v: unknown): v is number =>
	typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 1440 && v % 30 === 0;

function validateSupplements(raw: unknown): Supplement[] {
	if (!Array.isArray(raw)) return [];
	return raw
		.filter(
			(s): s is Supplement =>
				isRecord(s) &&
				typeof s.id === 'string' &&
				s.id.length <= 40 &&
				typeof s.name === 'string' &&
				s.name.trim().length > 0 &&
				isSupplementTime(s.time)
		)
		.slice(0, MAX_SUPPLEMENTS)
		.map(({ id, name, time }) => ({ id, name: name.trim().slice(0, MAX_SUPPLEMENT_NAME), time }));
}

function validateSummary(raw: unknown): DaySummary | undefined {
	if (!isRecord(raw) || !isRecord(raw.nutrients)) return undefined;
	const nutrients = emptyNutrients();
	for (const key of NUTRIENT_KEYS) {
		const v = raw.nutrients[key];
		if (v !== undefined && !num(v, 0, 100_000)) return undefined;
		nutrients[key] = v ?? 0;
	}
	return {
		waterMl: num(raw.waterMl, 0, MAX_WATER_ML) ? raw.waterMl : 0,
		nutrients,
		items: num(raw.items, 0, MAX_ITEMS_PER_DAY) ? Math.round(raw.items) : 0,
		unknown: num(raw.unknown, 0, MAX_ITEMS_PER_DAY) ? Math.round(raw.unknown) : 0
	};
}

function validateDated<T>(raw: unknown, validate: (v: unknown) => T | undefined) {
	if (!isRecord(raw)) return {};
	return Object.fromEntries(
		Object.entries(raw)
			.filter(([date]) => isDate(date))
			.flatMap(([date, value]) => {
				const valid = validate(value);
				return valid ? [[date, valid] as const] : [];
			})
	);
}

function validateGoals(raw: unknown): NutrientGoals {
	if (!isRecord(raw)) return DEFAULT_GOALS;
	const activity = (
		typeof raw.activity === 'string' && raw.activity in ACTIVITY_PROTEIN ? raw.activity : 'bezne'
	) as Activity;
	const custom: Partial<Record<GoalKey, number>> = {};
	if (isRecord(raw.custom)) {
		for (const [key, [min, max]] of Object.entries(GOAL_LIMITS)) {
			const v = raw.custom[key];
			if (num(v, min, max)) custom[key as GoalKey] = v;
		}
	}
	return { activity, custom };
}

function validateSavedFoods(raw: unknown): SavedFood[] {
	if (!Array.isArray(raw)) return [];
	return raw
		.flatMap((f): SavedFood[] => {
			if (!isRecord(f) || typeof f.id !== 'string' || f.id.length > 40) return [];
			const name = typeof f.name === 'string' ? f.name.trim().slice(0, MAX_CUSTOM_NAME) : '';
			const values = validateLabel(f);
			return name && values ? [{ id: f.id, name, per100g: f.per100g === true, ...values }] : [];
		})
		.slice(0, MAX_SAVED_FOODS);
}

export function validateJournal(raw: unknown): Journal | undefined {
	if (!isRecord(raw)) return undefined;
	return {
		enabled: raw.enabled === true,
		showKcal: raw.showKcal === true,
		waterGoalMl: num(raw.waterGoalMl, 500, 5000) ? raw.waterGoalMl : NO_JOURNAL.waterGoalMl,
		goals: validateGoals(raw.goals),
		supplements: validateSupplements(raw.supplements),
		foods: validateSavedFoods(raw.foods),
		days: validateDated(raw.days, validateDay),
		summaries: validateDated(raw.summaries, validateSummary)
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
			([d, day]) =>
				d >= oldest && (day.waterMl > 0 || day.items.length > 0 || (day.taken?.length ?? 0) > 0)
		)
	);
	const summaries = Object.fromEntries(
		Object.entries(journal.summaries).filter(([d]) => d >= oldest && !(d in days))
	);
	return { ...journal, days, summaries };
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Turns days older than JOURNAL_DETAIL_DAYS into totals. Needs the catalog, so it runs where the
 * diary is shown rather than on every save.
 */
export function compactJournal(
	journal: Journal,
	today: string,
	recipesById: Map<string, RecipeSummary>,
	ingredientsById: Map<string, Ingredient>
): Journal {
	const detailFrom = shiftDate(today, -(JOURNAL_DETAIL_DAYS - 1));
	const old = Object.entries(journal.days).filter(([d]) => d < detailFrom);
	if (!old.length) return journal;
	const summaries = { ...journal.summaries };
	for (const [date, day] of old) {
		const totals = dayTotals(day, recipesById, ingredientsById);
		summaries[date] = {
			waterMl: day.waterMl,
			nutrients: Object.fromEntries(
				NUTRIENT_KEYS.map((k) => [k, round1(totals.nutrients[k])])
			) as Nutrients,
			items: day.items.length,
			unknown: totals.unknown
		};
	}
	return {
		...journal,
		days: Object.fromEntries(Object.entries(journal.days).filter(([d]) => d >= detailFrom)),
		summaries
	};
}

export function addSupplement(journal: Journal, name: string, time: number): Journal {
	const clean = name.trim().slice(0, MAX_SUPPLEMENT_NAME);
	if (!clean || !isSupplementTime(time) || journal.supplements.length >= MAX_SUPPLEMENTS) {
		return journal;
	}
	const id = crypto.randomUUID().slice(0, 8);
	return { ...journal, supplements: [...journal.supplements, { id, name: clean, time }] };
}

export function toggleTaken(day: JournalDay, supplementId: string): JournalDay {
	const taken = day.taken ?? [];
	return {
		...day,
		taken: taken.includes(supplementId)
			? taken.filter((t) => t !== supplementId)
			: [...taken, supplementId]
	};
}

/** Reminder times still to come today: those with something not yet taken. */
export function openSupplementTimes(supplements: Supplement[], day: JournalDay): number[] {
	const taken = new Set(day.taken ?? []);
	return [...new Set(supplements.filter((s) => !taken.has(s.id)).map((s) => s.time))].sort(
		(a, b) => a - b
	);
}

export function addWater(day: JournalDay, ml: number): JournalDay {
	return { ...day, waterMl: Math.min(MAX_WATER_ML, Math.max(0, day.waterMl + ml)) };
}

const sameFood = (a: JournalItem, b: JournalItem) =>
	a.meal === b.meal &&
	((a.kind === 'recipe' &&
		b.kind === 'recipe' &&
		a.recipeId === b.recipeId &&
		a.variant === b.variant) ||
		(a.kind === 'ingredient' && b.kind === 'ingredient' && a.ingredientId === b.ingredientId));

/** Adds food; a second helping of the same recipe or ingredient goes onto its existing line. */
export function addItem(day: JournalDay, item: JournalItem): JournalDay {
	const existing = day.items.find((i) => sameFood(i, item));
	if (existing) {
		return {
			...day,
			items: day.items.map((i) => {
				if (i !== existing) return i;
				if (i.kind === 'recipe' && item.kind === 'recipe') {
					return { ...i, portions: Math.min(20, i.portions + item.portions) };
				}
				if (i.kind === 'ingredient' && item.kind === 'ingredient') {
					return { ...i, grams: Math.min(5000, i.grams + item.grams) };
				}
				return i;
			})
		};
	}
	if (day.items.length >= MAX_ITEMS_PER_DAY) return day;
	return { ...day, items: [...day.items, item] };
}

/** Changes how many portions of a recipe line were eaten; zero removes the line. */
export function setPortions(day: JournalDay, id: string, portions: number): JournalDay {
	if (portions <= 0) return removeItem(day, id);
	return {
		...day,
		items: day.items.map((i) =>
			i.id === id && i.kind === 'recipe' ? { ...i, portions: Math.min(20, portions) } : i
		)
	};
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
	if (LABEL_KEYS.every((k) => item[k] == null)) return null;
	return Object.fromEntries(LABEL_KEYS.map((k) => [k, item[k] ?? 0])) as Nutrients;
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
		// A custom food counts only with the numbers its label gave.
		if (item.kind === 'custom' && LABEL_KEYS.some((k) => item[k] == null)) partial = true;
		for (const key of Object.keys(nutrients) as (keyof Nutrients)[]) nutrients[key] += n[key];
	}
	return { nutrients, unknown, partial };
}

/** Days with food logged among the last `count` days (today included), with their totals. */
export function recentTotals(
	journal: Journal,
	today: string,
	recipesById: Map<string, RecipeSummary>,
	ingredientsById: Map<string, Ingredient>,
	count = 7
): { date: string; nutrients: Nutrients; waterMl: number }[] {
	const out = [];
	for (let i = 0; i < count; i++) {
		const date = shiftDate(today, -i);
		const day = journal.days[date];
		if (day?.items.length) {
			const { nutrients } = dayTotals(day, recipesById, ingredientsById);
			out.push({ date, nutrients, waterMl: day.waterMl });
		} else if (journal.summaries[date]?.items) {
			const s = journal.summaries[date];
			out.push({ date, nutrients: s.nutrients, waterMl: s.waterMl });
		}
	}
	return out;
}

export function averageNutrients(days: { nutrients: Nutrients }[]): Nutrients {
	const sum = emptyNutrients();
	for (const day of days) for (const key of NUTRIENT_KEYS) sum[key] += day.nutrients[key];
	return scaleNutrients(sum, days.length ? 1 / days.length : 0);
}

/** A day counts toward the weekly picture only after a few days, one bad day isn't a pattern. */
export const MIN_DAYS_FOR_GAPS = 3;
/** Below this share of the goal on average, a nutrient is worth eating more of. */
export const GAP_SHARE = 0.7;

/** Nutrients that fell short on average, the furthest from the goal first. */
export function nutrientGaps(
	average: Nutrients,
	targets: Nutrients,
	keys: readonly NutrientKey[]
): NutrientKey[] {
	return keys
		.filter((k) => targets[k] > 0 && average[k] < targets[k] * GAP_SHARE)
		.sort((a, b) => average[a] / targets[a] - average[b] / targets[b]);
}

/**
 * Everyday recipes that bring the most of a nutrient in one portion, for "what to eat more of".
 * Treats, desserts, comfort food and drinks are left out: nobody should fix iron with brownies.
 */
export function recipesRichIn(
	recipes: RecipeSummary[],
	key: NutrientKey,
	count = 3,
	skip: Set<string> = new Set()
): RecipeSummary[] {
	return recipes
		.filter(
			(r) =>
				r.showNutrition &&
				r.treat.length === 0 &&
				!skip.has(r.id) &&
				!/^(napoje|comfort|dezerty)\//.test(r.categories[0] ?? '') &&
				r.perServing.kcal < 900
		)
		.sort((a, b) => b.perServing[key] - a.perServing[key])
		.slice(0, count);
}

/** A saved food as a diary entry: `amount` grams (per-100 g foods) or pieces. */
export function savedFoodItem(
	food: SavedFood,
	amount: number,
	id: string,
	meal?: DiaryMeal
): JournalItem {
	const factor = food.per100g ? amount / 100 : amount;
	const scaled = Object.fromEntries(
		LABEL_KEYS.map((k) => {
			const v = food[k];
			return [k, v == null ? null : Math.min(LABEL_MAX[k], Math.round(v * factor * 100) / 100)];
		})
	) as unknown as LabelValues;
	const label = food.per100g ? `${amount} g` : `${amount} ks`;
	return {
		id,
		kind: 'custom',
		name: `${food.name} · ${label}`.slice(0, MAX_CUSTOM_NAME),
		...scaled,
		...(meal && { meal })
	};
}

/** Saves a food for later, replacing one of the same name. */
export function saveFood(journal: Journal, food: Omit<SavedFood, 'id'>, id: string): Journal {
	const name = food.name.trim().slice(0, MAX_CUSTOM_NAME);
	if (!name) return journal;
	const others = journal.foods.filter((f) => f.name.toLowerCase() !== name.toLowerCase());
	return { ...journal, foods: [...others, { ...food, name, id }].slice(-MAX_SAVED_FOODS) };
}

export function removeSavedFood(journal: Journal, id: string): Journal {
	return { ...journal, foods: journal.foods.filter((f) => f.id !== id) };
}
