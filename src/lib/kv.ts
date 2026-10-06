/**
 * A tiny IndexedDB key-value store, readable from the service worker (which can't use
 * localStorage). Only holds what background frost checks need.
 */
const DB = 'receptio';
const STORE = 'kv';

function open(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB, 1);
		req.onupgradeneeded = () => req.result.createObjectStore(STORE);
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
	const db = await open();
	return new Promise((resolve, reject) => {
		const req = db.transaction(STORE).objectStore(STORE).get(key);
		req.onsuccess = () => resolve(req.result as T | undefined);
		req.onerror = () => reject(req.error);
	});
}

export async function kvSet(key: string, value: unknown): Promise<void> {
	const db = await open();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE, 'readwrite');
		tx.objectStore(STORE).put(value, key);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

export const FROST_WATCH_KEY = 'frost-watch';
export const FROST_SYNC_TAG = 'receptio-frost';

/** What the service worker needs to warn about frost: where, and until which month. */
export interface FrostWatch {
	lat: number;
	lon: number;
	name: string;
}

export const WATER_TODAY_KEY = 'water-today';

/** Today's water, so a reminder can say how far along you are. */
export interface WaterToday {
	date: string;
	ml: number;
	goalMl: number;
}

export const SUPPLEMENTS_TODAY_KEY = 'supplements-today';

/** Today's supplements by reminder time, so a reminder can name what to take. */
export interface SupplementsToday {
	date: string;
	/** Minutes after midnight → names still to take at that time today. */
	open: Record<number, string[]>;
	/** Minutes after midnight → every name at that time, for a day the app wasn't opened yet. */
	all: Record<number, string[]>;
	/** Whether water reminders are on too, to tell which of two pushes is which. */
	water: boolean;
}

/** "date|minute" of the last supplement reminder shown, so the next push in that slot is water. */
export const REMINDER_SHOWN_KEY = 'reminder-shown';
/** Set right before a test push, so the service worker knows which kind to show. */
export const REMINDER_TEST_KEY = 'reminder-test';
export interface ReminderTest {
	kind: 'water' | 'supplements';
	at: number;
}

/** Set on the admin's devices: on a push, ask /api/zdravie whether the site is down. */
export const ADMIN_ALERTS_KEY = 'admin-alerts';
