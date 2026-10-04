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
