import { browser } from '$app/environment';
import { DEFAULT_KITCHEN, KITCHEN_TOOLS, type Kitchen, type KitchenTool } from './dish';
import type { Pantry } from './pantry';

const PREFIX = 'receptio:';

/** Every stored value by its storage key, so a change in another tab reaches it. */
const byKey = new Map<string, Persisted<unknown>>();

/**
 * A value mirrored to localStorage. Starts with `initial` on the server and during hydration and
 * reads storage only in `loadPersisted()`, so prerendered HTML and the first render match.
 */
class Persisted<T> {
	#key: string;
	#value: T = $state() as T;
	#validate: (raw: unknown) => T | undefined;

	constructor(key: string, initial: T, validate: (raw: unknown) => T | undefined) {
		this.#key = PREFIX + key;
		this.#value = initial;
		this.#validate = validate;
		byKey.set(this.#key, this as Persisted<unknown>);
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
			// Blocked or full storage: the change still holds for this visit.
		}
	}

	load(raw: string | null = localStorage.getItem(this.#key)) {
		if (raw === null) return;
		try {
			const parsed = this.#validate(JSON.parse(raw));
			if (parsed !== undefined) this.#value = parsed;
		} catch {
			// Corrupt storage: keep what we have.
		}
	}
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

export function validatePantry(raw: unknown): Pantry | undefined {
	if (!isRecord(raw)) return undefined;
	const pantry: Pantry = {};
	for (const [id, grams] of Object.entries(raw)) {
		if (!/^[a-z0-9-]{1,60}$/.test(id)) continue;
		if (grams === null || (typeof grams === 'number' && Number.isFinite(grams) && grams >= 0)) {
			pantry[id] = grams;
		}
	}
	return pantry;
}

export const MAX_BURNERS = 6;

export function validateKitchen(raw: unknown): Kitchen | undefined {
	if (!isRecord(raw)) return undefined;
	const burners = raw.burners;
	if (typeof burners !== 'number' || !Number.isInteger(burners)) return undefined;
	if (burners < 1 || burners > MAX_BURNERS || !Array.isArray(raw.tools)) return undefined;
	const tools = raw.tools.filter((t): t is KitchenTool =>
		(KITCHEN_TOOLS as readonly unknown[]).includes(t)
	);
	return { burners, tools: [...new Set(tools)] };
}

/** A built plate put on the week: the dish and its build as URL parameters. */
export interface PlanItem {
	id: string;
	dish: string;
	/** `buildToParams` output, read back with `buildFromParams`. */
	query: string;
}

export const MAX_PLAN = 30;

function validatePlan(raw: unknown): PlanItem[] | undefined {
	if (!Array.isArray(raw)) return undefined;
	return raw
		.filter(
			(e): e is PlanItem =>
				isRecord(e) &&
				typeof e.id === 'string' &&
				/^[a-z0-9-]{1,40}$/.test(e.id) &&
				typeof e.dish === 'string' &&
				/^[a-z0-9-]{1,80}$/.test(e.dish) &&
				typeof e.query === 'string' &&
				e.query.length <= 500
		)
		.slice(0, MAX_PLAN);
}

function validateFlags(raw: unknown): Record<string, boolean> | undefined {
	if (!isRecord(raw)) return undefined;
	return Object.fromEntries(Object.entries(raw).filter(([, v]) => v === true)) as Record<
		string,
		boolean
	>;
}

export type Theme = 'auto' | 'light' | 'dark';

export interface Settings {
	theme: Theme;
	/** The kitchen was set up once (first visit asks about it). */
	kitchenSet: boolean;
}

const DEFAULT_SETTINGS: Settings = { theme: 'auto', kitchenSet: false };

function validateSettings(raw: unknown): Settings | undefined {
	if (!isRecord(raw)) return undefined;
	return {
		theme: raw.theme === 'light' || raw.theme === 'dark' ? raw.theme : 'auto',
		kitchenSet: raw.kitchenSet === true
	};
}

/** ingredientId → grams at home, or null for "have some". Same key and shape as before v2. */
export const pantry = new Persisted<Pantry>('pantry', {}, validatePantry);
export const kitchen = new Persisted<Kitchen>('kitchen', DEFAULT_KITCHEN, validateKitchen);
export const settings = new Persisted<Settings>('settings', DEFAULT_SETTINGS, validateSettings);
/** `week-plan`, not `plan`: the old app stored a different shape under that key. */
export const plan = new Persisted<PlanItem[]>('week-plan', [], validatePlan);
/** Recipes put together from ingredients and kept, newest first. */
export const myParts = new Persisted<string[]>('moje-recepty', [], (raw) =>
	Array.isArray(raw)
		? raw
				.filter((x): x is string => typeof x === 'string' && /^x\.[a-z0-9.+-]{1,300}$/.test(x))
				.slice(0, 30)
		: undefined
);

export function keepPart(id: string) {
	myParts.current = [id, ...myParts.current.filter((x) => x !== id)].slice(0, 30);
}

/** Shopping list items ticked off, by ingredient id. */
export const ticked = new Persisted<Record<string, boolean>>('ticked', {}, validateFlags);

export const ui = $state({ loaded: false });

export function loadPersisted() {
	for (const store of byKey.values()) store.load();
	addEventListener('storage', (event) => {
		if (event.storageArea !== localStorage || event.key === null) return;
		byKey.get(event.key)?.load(event.newValue);
	});
	ui.loaded = true;
}

export function setPantryItem(id: string, grams: number | null) {
	pantry.current = { ...pantry.current, [id]: grams };
}

export function removePantryItem(id: string) {
	const { [id]: _removed, ...rest } = pantry.current;
	pantry.current = rest;
}

export function toggleTool(tool: KitchenTool) {
	const tools = kitchen.current.tools.includes(tool)
		? kitchen.current.tools.filter((t) => t !== tool)
		: [...kitchen.current.tools, tool];
	kitchen.current = { ...kitchen.current, tools };
}

export function addToPlan(dish: string, query: string): boolean {
	if (plan.current.length >= MAX_PLAN) return false;
	plan.current = [...plan.current, { id: crypto.randomUUID().slice(0, 8), dish, query }];
	return true;
}

export function removeFromPlan(id: string) {
	plan.current = plan.current.filter((p) => p.id !== id);
}

export function setPlanQuery(id: string, query: string) {
	plan.current = plan.current.map((p) => (p.id === id ? { ...p, query } : p));
}
