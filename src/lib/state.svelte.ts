import { browser } from '$app/environment';
import { NO_AVOID, validateAvoid, type Avoid } from './avoid';
import { addItem, localToday, NO_JOURNAL, validateJournal, withDay, type Journal } from './journal';
import { consumeFromPantry, type Pantry, type PantryUse } from './pantry';
import { validatePreserves, type Preserve } from './preserves';
import type { PlanEntry } from './shopping';
import type { GrowPlace, GrowSun, Ingredient, RecipeLine } from './types';

const PREFIX = 'receptio:';
/** sessionStorage: the recipe list's filters, so a recipe's back link returns to them. */
export const LIST_SEARCH_KEY = `${PREFIX}recepty-search`;

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
	#deviceOnly: boolean;

	/** `deviceOnly` values (which garden is open) stay out of backups and don't trigger sync. */
	constructor(
		key: string,
		initial: T,
		validate: (raw: unknown) => T | undefined,
		deviceOnly = false
	) {
		this.#key = PREFIX + key;
		this.#value = initial;
		this.#validate = validate;
		this.#deviceOnly = deviceOnly;
	}

	get current(): T {
		return this.#value;
	}

	set current(value: T) {
		this.#value = value;
		if (!browser) return;
		if (!this.#deviceOnly) changes.count++;
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

function validateDates(raw: unknown): Record<string, string> | undefined {
	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
	return Object.fromEntries(
		Object.entries(raw).filter(
			(e): e is [string, string] => typeof e[1] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e[1])
		)
	);
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
/** When each pantry item was added (ISO date), to remind about fresh food before it spoils. */
export const pantryAdded = new Persisted<Record<string, string>>('pantry-added', {}, validateDates);
export const plan = new Persisted<PlanEntry[]>('plan', [], validatePlan);
export const checkedItems = new Persisted<Record<string, boolean>>('checked', {}, validateFlags);
/** Things to buy that no recipe needs (toilet paper, coffee), added by hand to the list. */
export interface ExtraItem {
	id: string;
	text: string;
	checked: boolean;
}
const MAX_EXTRA_ITEMS = 60;
function validateExtraItems(raw: unknown): ExtraItem[] | undefined {
	if (!Array.isArray(raw)) return undefined;
	return raw
		.filter(
			(i): i is ExtraItem =>
				isRecord(i) &&
				typeof i.id === 'string' &&
				typeof i.text === 'string' &&
				i.text.length > 0 &&
				i.text.length <= 80 &&
				typeof i.checked === 'boolean'
		)
		.slice(0, MAX_EXTRA_ITEMS)
		.map(({ id, text, checked }) => ({ id, text, checked }));
}
export const extraItems = new Persisted<ExtraItem[]>('extra-items', [], validateExtraItems);

export function addExtraItem(text: string) {
	const clean = text.trim().slice(0, 80);
	if (!clean || extraItems.current.length >= MAX_EXTRA_ITEMS) return;
	extraItems.current = [
		...extraItems.current,
		{ id: crypto.randomUUID(), text: clean, checked: false }
	];
}
/** Basics (spices, oils) the user marked as missing at home. */
export const outOfStock = new Persisted<Record<string, boolean>>('out-of-stock', {}, validateFlags);
export const settings = new Persisted<Settings>('settings', DEFAULT_SETTINGS, validateSettings);
/** Named filter sets on Recepty ("môj bežný večer"), stored as the list's URL params. */
export interface FilterPreset {
	name: string;
	search: string;
}
export const MAX_PRESETS = 8;
function validatePresets(raw: unknown): FilterPreset[] | undefined {
	if (!Array.isArray(raw)) return undefined;
	return raw
		.filter(
			(p): p is FilterPreset =>
				isRecord(p) &&
				typeof p.name === 'string' &&
				p.name.length > 0 &&
				p.name.length <= 40 &&
				typeof p.search === 'string' &&
				p.search.length <= 2000
		)
		.slice(-MAX_PRESETS)
		.map(({ name, search }) => ({ name, search }));
}
export const presets = new Persisted<FilterPreset[]>('presets', [], validatePresets);

/** A plan kept under a name, to put the same week back later. */
export interface SavedWeek {
	name: string;
	entries: PlanEntry[];
}
export const MAX_SAVED_WEEKS = 8;
function validateSavedWeeks(raw: unknown): SavedWeek[] | undefined {
	if (!Array.isArray(raw)) return undefined;
	return raw
		.flatMap((w): SavedWeek[] => {
			if (!isRecord(w) || typeof w.name !== 'string' || !w.name || w.name.length > 40) return [];
			const entries = validatePlan(w.entries);
			return entries?.length ? [{ name: w.name, entries }] : [];
		})
		.slice(-MAX_SAVED_WEEKS);
}
export const savedWeeks = new Persisted<SavedWeek[]>('saved-weeks', [], validateSavedWeeks);

/** Keeps the current plan under `name`, replacing a week of the same name. */
export function saveWeek(name: string) {
	const trimmed = name.trim().slice(0, 40);
	if (!trimmed || !plan.current.length) return;
	savedWeeks.current = [
		...savedWeeks.current.filter((w) => w.name !== trimmed),
		{ name: trimmed, entries: plan.current.map((e) => ({ ...e })) }
	].slice(-MAX_SAVED_WEEKS);
}

/** Replaces the plan with a saved week; the shopping list starts unticked. */
export function applySavedWeek(week: SavedWeek) {
	plan.current = week.entries.map((e) => ({ ...e }));
	checkedItems.current = {};
}

export function deleteSavedWeek(name: string) {
	savedWeeks.current = savedWeeks.current.filter((w) => w.name !== name);
}

/** Ingredients and tools the user doesn't have or eat, set in Špajza. */
export const avoid = new Persisted<Avoid>('avoid', NO_AVOID, validateAvoid);

/** Recipes cooked, oldest first. */
export const history = new Persisted<CookedEntry[]>('history', [], validateHistory);
export const favorites = new Persisted<Record<string, boolean>>('favorites', {}, validateFlags);
/** Personal notes per recipe ("next time less salt"). */
export const notes = new Persisted<Record<string, string>>('notes', {}, validateNotes);

/** A saved garden plan and its diary. */
export interface GardenDiary {
	/** Stable handle, so a garden keeps its diary when it is renamed. */
	id: string;
	/** What the grower calls it: "Balkón", "Záhrada u babky". */
	name: string;
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
export const MAX_GARDENS = 12;
const MAX_GARDEN_NAME = 40;
const GARDEN_NAMES: Record<GrowPlace, string> = {
	parapet: 'Okno',
	balkon: 'Balkón',
	zahrada: 'Záhrada'
};
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

export const newGardenId = () => crypto.randomUUID().slice(0, 8);

/** "Balkón", or "Balkón 2" when there already is one. */
export function gardenName(place: GrowPlace, existing: { name: string }[]): string {
	const base = GARDEN_NAMES[place];
	const taken = new Set(existing.map((g) => g.name));
	for (let n = 1; ; n++) {
		const name = n === 1 ? base : `${base} ${n}`;
		if (!taken.has(name)) return name;
	}
}

/** Gardens saved before there could be several have no id or name; they get them here. */
function validateGarden(raw: unknown): GardenDiary | undefined {
	if (!isRecord(raw)) return undefined;
	const { id, name, place, area, sun, level, combos, plants, done, harvests, beds, savedAt } = raw;
	if (typeof place !== 'string' || !PLACES.includes(place)) return undefined;
	if (typeof sun !== 'string' || !SUNS.includes(sun)) return undefined;
	if (typeof area !== 'number' || !(area > 0) || area > 100_000) return undefined;
	if (level !== 1 && level !== 2 && level !== 3) return undefined;
	if (!Array.isArray(combos) || !Array.isArray(plants) || !Array.isArray(harvests))
		return undefined;
	return {
		id: typeof id === 'string' && /^[a-z0-9-]{1,40}$/.test(id) ? id : newGardenId(),
		name:
			typeof name === 'string' && name.trim()
				? name.trim().slice(0, MAX_GARDEN_NAME)
				: GARDEN_NAMES[place as GrowPlace],
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

function validateGardens(raw: unknown): GardenDiary[] | undefined {
	if (!Array.isArray(raw)) return undefined;
	const byId = new Map(raw.flatMap((g) => validateGarden(g) ?? []).map((g) => [g.id, g]));
	return [...byId.values()].slice(0, MAX_GARDENS);
}

/** Every saved garden: a balcony at home, a plot at the cottage… */
export const gardens = new Persisted<GardenDiary[]>('gardens', [], validateGardens);
/** Which garden is open on this device. */
const openGardenId = new Persisted<string | null>(
	'open-garden',
	null,
	(raw) => (typeof raw === 'string' || raw === null ? raw : undefined),
	true
);

/** The garden being looked at; the first one until another is opened. */
export function activeGarden(): GardenDiary | null {
	const all = gardens.current;
	return all.find((g) => g.id === openGardenId.current) ?? all[0] ?? null;
}

export function openGarden(id: string) {
	openGardenId.current = id;
}

/** Stores a garden – a new one is added, a known one replaced – and opens it. */
export function saveGarden(diary: GardenDiary) {
	const name = diary.name.trim().slice(0, MAX_GARDEN_NAME) || GARDEN_NAMES[diary.place];
	const next = { ...diary, name };
	gardens.current = gardens.current.some((g) => g.id === next.id)
		? gardens.current.map((g) => (g.id === next.id ? next : g))
		: [...gardens.current, next].slice(0, MAX_GARDENS);
	openGardenId.current = next.id;
}

export function removeGarden(id: string) {
	gardens.current = gardens.current.filter((g) => g.id !== id);
}

/**
 * Until October 2026 there was one garden under `garden`, and the planner's inputs were written
 * to the same key. Whichever of the two is there moves to where it belongs now.
 */
export const PLANNER_KEY = `${PREFIX}planner`;
function migrateSingleGarden() {
	const LEGACY_KEY = `${PREFIX}garden`;
	try {
		const raw = localStorage.getItem(LEGACY_KEY);
		if (raw === null) return;
		const garden = validateGarden(JSON.parse(raw));
		if (garden && localStorage.getItem(`${PREFIX}gardens`) === null) {
			localStorage.setItem(`${PREFIX}gardens`, JSON.stringify([garden]));
		} else if (!garden && localStorage.getItem(PLANNER_KEY) === null) {
			localStorage.setItem(PLANNER_KEY, raw);
		}
		localStorage.removeItem(LEGACY_KEY);
	} catch {
		// Corrupt or inaccessible storage: nothing to carry over.
	}
}

/** Home-made jars and freezer bags, with the date they were made. */
export const preserves = new Persisted<Preserve[]>('preserves', [], validatePreserves);

/** Food and water diary, off until switched on in Moje. */
export const journal = new Persisted<Journal>('journal', NO_JOURNAL, validateJournal);

/** Writes one eaten portion of a recipe into today's diary. */
export function logPortion(recipeId: string, variant?: string) {
	const today = localToday();
	const id = crypto.randomUUID().slice(0, 8);
	journal.current = withDay(
		journal.current,
		today,
		(day) =>
			addItem(
				day,
				variant
					? { id, kind: 'recipe', recipeId, variant, portions: 1 }
					: { id, kind: 'recipe', recipeId, portions: 1 }
			),
		today
	);
}

/** Everything kept on this device, for backup/restore. */
export const ALL_PERSISTED = {
	pantry,
	pantryAdded,
	plan,
	checkedItems,
	extraItems,
	outOfStock,
	settings,
	history,
	favorites,
	notes,
	gardens,
	preserves,
	avoid,
	presets,
	savedWeeks,
	journal
};

export const ui = $state({ loaded: false });

export function loadPersisted() {
	migrateSingleGarden();
	for (const store of Object.values(ALL_PERSISTED)) store.load();
	openGardenId.load();
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
	if (!(id in pantry.current)) {
		pantryAdded.current = {
			...pantryAdded.current,
			[id]: new Date().toISOString().slice(0, 10)
		};
	}
	pantry.current = { ...pantry.current, [id]: grams };
}

export function removePantryItem(id: string) {
	const { [id]: _removed, ...rest } = pantry.current;
	pantry.current = rest;
	const { [id]: _date, ...dates } = pantryAdded.current;
	pantryAdded.current = dates;
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
export interface CookedStats {
	cooked: number;
	rating?: number;
	ratings: number;
}

export const likes = $state<{
	counts: Record<string, number>;
	mine: string[];
	/** What other cooks reported: how often it worked and the average stars. */
	cooked: Record<string, CookedStats>;
	available: boolean;
}>({
	counts: {},
	mine: [],
	cooked: {},
	available: false
});

export async function loadLikes() {
	try {
		const res = await fetch('/api/likes');
		if (!res.ok) return;
		const data = (await res.json()) as {
			counts: Record<string, number>;
			mine: string[];
			cooked?: Record<string, CookedStats>;
		};
		likes.counts = data.counts;
		likes.mine = data.mine;
		likes.cooked = data.cooked ?? {};
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
