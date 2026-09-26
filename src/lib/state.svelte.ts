import { browser } from '$app/environment';
import type { Pantry } from './pantry';
import type { PlanEntry } from './shopping';

const PREFIX = 'receptio:';

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
		try {
			localStorage.setItem(this.#key, JSON.stringify(value));
		} catch {
			// Storage can be full or blocked (private mode); state still works for this session.
		}
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

export interface Settings {
	weightKg: number | null;
	planDays: number;
	theme: 'auto' | 'light' | 'dark';
}

function validateSettings(raw: unknown): Settings | undefined {
	if (!isRecord(raw)) return undefined;
	const weight = raw.weightKg;
	const days = raw.planDays;
	const theme = raw.theme;
	return {
		weightKg: typeof weight === 'number' && weight >= 20 && weight <= 250 ? weight : null,
		planDays: typeof days === 'number' && days >= 1 && days <= 14 ? days : 7,
		theme: theme === 'light' || theme === 'dark' ? theme : 'auto'
	};
}

export const pantry = new Persisted<Pantry>('pantry', {}, validatePantry);
export const plan = new Persisted<PlanEntry[]>('plan', [], validatePlan);
export const checkedItems = new Persisted<Record<string, boolean>>('checked', {}, validateFlags);
/** Basics (spices, oils) the user marked as missing at home. */
export const outOfStock = new Persisted<Record<string, boolean>>('out-of-stock', {}, validateFlags);
export const settings = new Persisted<Settings>(
	'settings',
	{ weightKg: null, planDays: 7, theme: 'auto' },
	validateSettings
);

export const ui = $state({ loaded: false });

export function loadPersisted() {
	pantry.load();
	plan.load();
	checkedItems.load();
	outOfStock.load();
	settings.load();
	ui.loaded = true;
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
	const before = { counts: { ...likes.counts }, mine: [...likes.mine] };
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
		likes.counts = before.counts;
		likes.mine = before.mine;
	}
}
