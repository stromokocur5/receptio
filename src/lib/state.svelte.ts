import { browser } from '$app/environment';
import { consumeFromPantry, type Pantry, type PantryUse } from './pantry';
import type { PlanEntry } from './shopping';
import type { GrowPlace, GrowSun, Ingredient, RecipeLine } from './types';

const PREFIX = 'receptio:';

/** Bumped on every saved change, so sync knows when there's something new to upload. */
export const changes = $state({ count: 0 });

/**
 * A value mirrored to localStorage. Starts with `initial` on the server and during hydration,
 * and only reads storage in `load()` (called once from the root layout on mount) so prerendered
 * HTML and the first client render always match.
 */
class Persisted<T> {
	#key: string;
	#value: T = $state() as T;
	#validate: (raw: unknown) => T | undefined;

	constructor(key: string, initial: T, validate: (raw: unknown) => T | undefined) {
		this.#key = PREFIX + key;
		this.#value = initial;
		this.#validate = validate;
	}

	get current(): T {
		return this.#value;
	}

	set current(value: T) {
		this.#value = value;
		if (!browser) return;
		changes.count++;
		try {
			localStorage.setItem(this.#key, JSON.stringify(value));
		} catch {
			// Storage can be full or blocked (private mode); state still works for this session.
		}
	}

	/** Replaces the value from backup data; false when it doesn't validate. */
	restore(raw: unknown): boolean {
		const parsed = this.#validate(raw);
		if (parsed === undefined) return false;
		this.current = parsed;
		return true;
	}

	load() {
		try {
			const raw = localStorage.getItem(this.#key);
			if (raw === null) return;
			const parsed = this.#validate(JSON.parse(raw));
			if (parsed !== undefined) this.#value = parsed;
		} catch {
			// Corrupt or inaccessible storage: keep the default.
		}
	}
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

function validatePantry(raw: unknown): Pantry | undefined {
	if (!isRecord(raw)) return undefined;
	const pantry: Pantry = {};
	for (const [id, grams] of Object.entries(raw)) {
		if (grams === null || (typeof grams === 'number' && Number.isFinite(grams) && grams >= 0)) {
			pantry[id] = grams;
		}
	}
	return pantry;
}

function validatePlan(raw: unknown): PlanEntry[] | undefined {
	if (!Array.isArray(raw)) return undefined;
	return raw.filter(
		(e): e is PlanEntry =>
			isRecord(e) &&
			typeof e.recipeId === 'string' &&
			typeof e.servings === 'number' &&
			e.servings > 0 &&
			e.servings <= 100 &&
			(e.variant === undefined || typeof e.variant === 'string')
	);
}

function validateFlags(raw: unknown): Record<string, boolean> | undefined {
	if (!isRecord(raw)) return undefined;
	return Object.fromEntries(
		Object.entries(raw).filter(([, v]) => typeof v === 'boolean')
	) as Record<string, boolean>;
}

export type Rating = 1 | 2 | 3;

export const RATING_LABELS: Record<Rating, string> = {
	3: 'Výborné',
	2: 'Dobré',
	1: 'Nabudúce inak'
};

export interface CookedEntry {
	recipeId: string;
	variant?: string;
	servings: number;
	/** ISO date (YYYY-MM-DD). */
	date: string;
	rating?: Rating;
}

const MAX_HISTORY = 300;
const MAX_NOTE_LENGTH = 2000;

function validateHistory(raw: unknown): CookedEntry[] | undefined {
	if (!Array.isArray(raw)) return undefined;
	return raw
		.filter(
			(e): e is CookedEntry =>
				isRecord(e) &&
				typeof e.recipeId === 'string' &&
				typeof e.servings === 'number' &&
				e.servings > 0 &&
				typeof e.date === 'string' &&
				/^\d{4}-\d{2}-\d{2}$/.test(e.date) &&
				(e.variant === undefined || typeof e.variant === 'string') &&
				(e.rating === undefined || e.rating === 1 || e.rating === 2 || e.rating === 3)
		)
		.slice(-MAX_HISTORY);
}

function validateNotes(raw: unknown): Record<string, string> | undefined {
	if (!isRecord(raw)) return undefined;
	return Object.fromEntries(
		Object.entries(raw)
			.filter((e): e is [string, string] => typeof e[1] === 'string' && e[1].trim() !== '')
			.map(([id, text]) => [id, text.slice(0, MAX_NOTE_LENGTH)])
	);
}

export interface Settings {
	weightKg: number | null;
	planDays: number;
	/** How many people eat each planned meal. */
	people: number;
	/** Planned (cooked) meals per day: lunch only, or lunch and dinner. */
	mealsPerDay: 1 | 2;
	theme: 'auto' | 'light' | 'dark';
	/** Where the garden is, for local sowing dates and weather. Stays on the device. */
	location: { name: string; lat: number; lon: number; elevation: number } | null;
}

const DEFAULT_SETTINGS: Settings = {
	weightKg: null,
	planDays: 7,
	people: 1,
	mealsPerDay: 1,
	theme: 'auto',
	location: null
};

const inRange = (v: unknown, min: number, max: number): v is number =>
	typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

function validateLocation(raw: unknown): Settings['location'] {
	if (!isRecord(raw)) return null;
	const { name, lat, lon, elevation } = raw;
	const num = (v: unknown, min: number, max: number): v is number =>
		typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
	if (typeof name !== 'string' || !num(lat, -90, 90) || !num(lon, -180, 180)) return null;
	if (!num(elevation, -100, 5000)) return null;
	return { name: name.slice(0, 80), lat, lon, elevation };
}

function validateSettings(raw: unknown): Settings | undefined {
	if (!isRecord(raw)) return undefined;
	const weight = raw.weightKg;
	const theme = raw.theme;
	return {
		weightKg: typeof weight === 'number' && weight >= 20 && weight <= 250 ? weight : null,
		planDays: inRange(raw.planDays, 1, 14) ? raw.planDays : DEFAULT_SETTINGS.planDays,
		people: inRange(raw.people, 1, 12) ? raw.people : DEFAULT_SETTINGS.people,
		mealsPerDay: raw.mealsPerDay === 2 ? 2 : 1,
		theme: theme === 'light' || theme === 'dark' ? theme : 'auto',
		location: validateLocation(raw.location)
	};
}

export const pantry = new Persisted<Pantry>('pantry', {}, validatePantry);
export const plan = new Persisted<PlanEntry[]>('plan', [], validatePlan);
export const checkedItems = new Persisted<Record<string, boolean>>('checked', {}, validateFlags);
/** Basics (spices, oils) the user marked as missing at home. */
export const outOfStock = new Persisted<Record<string, boolean>>('out-of-stock', {}, validateFlags);
export const settings = new Persisted<Settings>('settings', DEFAULT_SETTINGS, validateSettings);

/** Recipes cooked, oldest first. */
export const history = new Persisted<CookedEntry[]>('history', [], validateHistory);
export const favorites = new Persisted<Record<string, boolean>>('favorites', {}, validateFlags);
/** Personal notes per recipe ("next time less salt"). */
export const notes = new Persisted<Record<string, string>>('notes', {}, validateNotes);

/** A saved garden plan and its diary. */
export interface GardenDiary {
	place: GrowPlace;
	area: number;
	sun: GrowSun;
	level: 1 | 2 | 3;
	/** Polycultures chosen by the planner and how many modules of each. */
	combos: { id: string; modules: number }[];
	plants: { ingredientId: string; count: number }[];
	/** Finished tasks: `2026-5-sow-mrkva` → date done. */
	done: Record<string, string>;
	harvests: { ingredientId: string; grams: number; date: string }[];
	/** Hand-drawn beds from the garden editor. */
	beds: {
		id: string;
		name: string;
		width: number;
		depth: number;
		cells: Record<string, string>;
		past: { year: number; families: string[] }[];
	}[];
	savedAt: string;
}

const PLACES = ['parapet', 'balkon', 'zahrada'];
const SUNS = ['slnko', 'polotien', 'tien'];
const MAX_HARVESTS = 1000;
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

function validateGarden(raw: unknown): GardenDiary | null | undefined {
	if (raw === null) return null;
	if (!isRecord(raw)) return undefined;
	const { place, area, sun, level, combos, plants, done, harvests, beds, savedAt } = raw;
	if (typeof place !== 'string' || !PLACES.includes(place)) return undefined;
	if (typeof sun !== 'string' || !SUNS.includes(sun)) return undefined;
	if (typeof area !== 'number' || !(area > 0) || area > 100_000) return undefined;
	if (level !== 1 && level !== 2 && level !== 3) return undefined;
	if (!Array.isArray(combos) || !Array.isArray(plants) || !Array.isArray(harvests))
		return undefined;
	return {
		place: place as GrowPlace,
		area,
		sun: sun as GrowSun,
		level,
		combos: combos.filter(
			(c): c is { id: string; modules: number } =>
				isRecord(c) && typeof c.id === 'string' && inRange(c.modules, 1, 10_000)
		),
		plants: plants.filter(
			(p): p is { ingredientId: string; count: number } =>
				isRecord(p) && typeof p.ingredientId === 'string' && inRange(p.count, 1, 1_000_000)
		),
		done: isRecord(done)
			? (Object.fromEntries(Object.entries(done).filter(([, v]) => isDate(v))) as Record<
					string,
					string
				>)
			: {},
		harvests: harvests
			.filter(
				(h): h is GardenDiary['harvests'][number] =>
					isRecord(h) &&
					typeof h.ingredientId === 'string' &&
					typeof h.grams === 'number' &&
					h.grams > 0 &&
					h.grams <= 1_000_000 &&
					isDate(h.date)
			)
			.slice(-MAX_HARVESTS),
		beds: validateBeds(beds),
		savedAt: isDate(savedAt) ? savedAt : new Date().toISOString().slice(0, 10)
	};
}

const MAX_BEDS = 30;
const MAX_BED_M = 50;

function validateBeds(raw: unknown): GardenDiary['beds'] {
	if (!Array.isArray(raw)) return [];
	return raw
		.filter(
			(b): b is Record<string, unknown> =>
				isRecord(b) &&
				typeof b.id === 'string' &&
				typeof b.name === 'string' &&
				typeof b.width === 'number' &&
				typeof b.depth === 'number' &&
				b.width > 0 &&
				b.width <= MAX_BED_M &&
				b.depth > 0 &&
				b.depth <= MAX_BED_M &&
				isRecord(b.cells)
		)
		.slice(0, MAX_BEDS)
		.map((b) => ({
			id: (b.id as string).slice(0, 40),
			name: (b.name as string).slice(0, 60),
			width: b.width as number,
			depth: b.depth as number,
			cells: Object.fromEntries(
				Object.entries(b.cells as Record<string, unknown>).filter(
					([k, v]) => /^\d+,\d+$/.test(k) && typeof v === 'string' && /^[a-z0-9-]{1,60}$/.test(v)
				)
			) as Record<string, string>,
			past: Array.isArray(b.past)
				? b.past
						.filter(
							(p): p is { year: number; families: string[] } =>
								isRecord(p) &&
								inRange(p.year, 2000, 2200) &&
								Array.isArray(p.families) &&
								p.families.every((f) => typeof f === 'string')
						)
						.slice(-5)
				: []
		}));
}

export const garden = new Persisted<GardenDiary | null>('garden', null, validateGarden);

/** Everything kept on this device, for backup/restore. */
export const ALL_PERSISTED = {
	pantry,
	plan,
	checkedItems,
	outOfStock,
	settings,
	history,
	favorites,
	notes,
	garden
};

export const ui = $state({ loaded: false });

export function loadPersisted() {
	for (const store of Object.values(ALL_PERSISTED)) store.load();
	ui.loaded = true;
}

export function toggleFavorite(recipeId: string) {
	const { [recipeId]: was, ...rest } = favorites.current;
	favorites.current = was ? rest : { ...rest, [recipeId]: true };
}

export function setNote(recipeId: string, text: string) {
	const { [recipeId]: _previous, ...rest } = notes.current;
	const trimmed = text.slice(0, MAX_NOTE_LENGTH);
	notes.current = trimmed.trim() ? { ...rest, [recipeId]: trimmed } : rest;
}

/** Rates the most recent time this recipe was cooked. */
export function rateLastCooked(recipeId: string, rating: Rating) {
	const index = history.current.findLastIndex((h) => h.recipeId === recipeId);
	if (index === -1) return;
	history.current = history.current.map((h, i) => (i === index ? { ...h, rating } : h));
}

/**
 * Records a cooked recipe: subtracts the ingredients from the pantry, adds it to the history
 * and takes the cooked servings off the plan. Returns what came out of the pantry.
 */
export function markCooked(
	recipeId: string,
	variant: string | undefined,
	servings: number,
	lines: RecipeLine[],
	recipeServings: number,
	byId: Map<string, Ingredient>
): PantryUse[] {
	const { pantry: next, used } = consumeFromPantry(
		pantry.current,
		lines,
		servings / recipeServings,
		byId
	);
	pantry.current = next;
	const date = new Date().toISOString().slice(0, 10);
	history.current = [
		...history.current,
		variant ? { recipeId, variant, servings, date } : { recipeId, servings, date }
	].slice(-MAX_HISTORY);
	const planned = plan.current.find((e) => sameEntry(e, recipeId, variant));
	if (planned) setPlanServings(recipeId, variant, planned.servings - servings);
	return used;
}

export function setPantryItem(id: string, grams: number | null) {
	pantry.current = { ...pantry.current, [id]: grams };
}

export function removePantryItem(id: string) {
	const { [id]: _removed, ...rest } = pantry.current;
	pantry.current = rest;
}

const sameEntry = (e: PlanEntry, recipeId: string, variant?: string) =>
	e.recipeId === recipeId && e.variant === variant;

export function addToPlan(recipeId: string, servings: number, variant?: string) {
	const existing = plan.current.find((e) => sameEntry(e, recipeId, variant));
	plan.current = existing
		? plan.current.map((e) => (e === existing ? { ...e, servings: e.servings + servings } : e))
		: [...plan.current, variant ? { recipeId, servings, variant } : { recipeId, servings }];
}

export function setPlanServings(recipeId: string, variant: string | undefined, servings: number) {
	plan.current =
		servings <= 0
			? plan.current.filter((e) => !sameEntry(e, recipeId, variant))
			: plan.current.map((e) => (sameEntry(e, recipeId, variant) ? { ...e, servings } : e));
}

/** Moves a plan entry one place earlier, so it gets cooked sooner. */
export function movePlanEntryUp(index: number) {
	if (index <= 0 || index >= plan.current.length) return;
	const next = [...plan.current];
	[next[index - 1], next[index]] = [next[index], next[index - 1]];
	plan.current = next;
}

export function servingsInPlan(recipeId: string): number {
	return plan.current
		.filter((e) => e.recipeId === recipeId)
		.reduce((sum, e) => sum + e.servings, 0);
}

// ── Likes (server-backed, anonymous per device) ──────────────────
export const likes = $state<{ counts: Record<string, number>; mine: string[]; available: boolean }>(
	{
		counts: {},
		mine: [],
		available: false
	}
);

export async function loadLikes() {
	try {
		const res = await fetch('/api/likes');
		if (!res.ok) return;
		const data = (await res.json()) as { counts: Record<string, number>; mine: string[] };
		likes.counts = data.counts;
		likes.mine = data.mine;
		likes.available = true;
	} catch {
		// Likes are a nice-to-have; the app works without the API (e.g. static preview).
	}
}

export async function toggleLike(recipeId: string) {
	const wasLiked = likes.mine.includes(recipeId);
	const countBefore = likes.counts[recipeId] ?? 0;
	likes.mine = wasLiked ? likes.mine.filter((id) => id !== recipeId) : [...likes.mine, recipeId];
	likes.counts = {
		...likes.counts,
		[recipeId]: (likes.counts[recipeId] ?? 0) + (wasLiked ? -1 : 1)
	};

	try {
		const res = await fetch(`/api/likes/${encodeURIComponent(recipeId)}`, { method: 'POST' });
		if (!res.ok) throw new Error(String(res.status));
		const data = (await res.json()) as { liked: boolean; count: number };
		likes.counts = { ...likes.counts, [recipeId]: data.count };
		likes.mine = data.liked
			? [...new Set([...likes.mine, recipeId])]
			: likes.mine.filter((id) => id !== recipeId);
	} catch {
		// Undo only this recipe – other likes may have changed meanwhile.
		likes.counts = { ...likes.counts, [recipeId]: countBefore };
		likes.mine = wasLiked
			? [...new Set([...likes.mine, recipeId])]
			: likes.mine.filter((id) => id !== recipeId);
	}
}
