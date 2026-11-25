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
