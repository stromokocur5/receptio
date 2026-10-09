import { exportBackup, importBackup } from './backup';
import { kvGet, kvSet } from './kv';
import { merge3 } from './merge3';
import { changes } from './state.svelte';
import { onSyncStart, onSyncStop, tab } from './tabs.svelte';

/**
 * Account-free sync. A random recovery code is the only secret: the browser derives from it the
 * record id, a write token and an AES key, encrypts the backup and uploads only ciphertext. The
 * server can't read the data and nobody can overwrite it without the code.
 */

const CODE_KEY = 'receptio:sync-code';
const META_KEY = 'receptio:sync-meta';
/** Crockford base32: no I, L, O, U, so the code survives being read aloud or written by hand. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
/** 20 characters × 5 bits = 100 bits, far beyond guessing. */
export const CODE_LENGTH = 20;
const PUSH_DELAY_MS = 4000;

type Status = 'off' | 'idle' | 'syncing' | 'error';

export const syncState = $state<{
	code: string | null;
	status: Status;
	/** Server time (s) of the version this device last matched. */
	syncedAt: number | null;
	message: string;
}>({ code: null, status: 'off', syncedAt: null, message: '' });

interface Meta {
	syncedAt: number | null;
	/** The server's version this device last matched; null before the server had versions. */
	version: number | null;
	/** Local changes not yet uploaded. */
	dirty: boolean;
}

let meta: Meta = { syncedAt: null, version: null, dirty: false };
let pushTimer: ReturnType<typeof setTimeout> | undefined;
/** Wait before retrying a failed upload; doubles up to RETRY_MAX_MS, resets on success. */
const RETRY_FIRST_MS = 60_000;
const RETRY_MAX_MS = 10 * 60_000;
let retryDelay = RETRY_FIRST_MS;
/** Two devices changed at once this many times in a row: give up for now and retry later. */
const MAX_MERGES = 4;
/** The backup both this device and the server last agreed on, for merging (IndexedDB, it's big). */
const BASE_KEY = 'sync-base';
let running: Promise<void> | null = null;
/** Bumped when another device's backup replaced the data here (the household takes that as its base). */
export const restores = $state({ count: 0 });
/** Changes up to this count came from the server, not from the user – don't upload them back. */
let appliedUpTo = 0;

export function formatCode(code: string): string {
	return code.match(/.{1,4}/g)!.join('-');
}

export function generateCode(random = crypto.getRandomValues(new Uint8Array(CODE_LENGTH))): string {
	// 256 is a multiple of 32, so taking each byte modulo 32 stays uniform.
	return [...random].map((b) => ALPHABET[b % 32]).join('');
}

/** Accepts the code with or without dashes, in any case, with O/I/L typed for 0/1. */
export function normalizeCode(input: string): string | null {
	const code = input
		.toUpperCase()
		.replace(/[^0-9A-Z]/g, '')
		.replace(/O/g, '0')
		.replace(/[IL]/g, '1');
	if (code.length !== CODE_LENGTH || [...code].some((c) => !ALPHABET.includes(c))) return null;
	return code;
}

const encoder = new TextEncoder();

function hex(bytes: Uint8Array): string {
	return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function toBase64(bytes: Uint8Array): string {
	let binary = '';
	for (let i = 0; i < bytes.length; i += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	return btoa(binary);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
	return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

export interface SyncKeys {
	id: string;
	token: string;
	key: CryptoKey;
}

export async function deriveKeys(code: string): Promise<SyncKeys> {
	const base = await crypto.subtle.importKey('raw', encoder.encode(code), 'HKDF', false, [
		'deriveBits',
		'deriveKey'
	]);
	const params = (info: string): HkdfParams => ({
		name: 'HKDF',
		hash: 'SHA-256',
		salt: encoder.encode('receptio-sync-v1'),
		info: encoder.encode(info)
	});
	const bits = async (info: string) =>
		hex(new Uint8Array(await crypto.subtle.deriveBits(params(info), base, 256)));
	return {
		id: await bits('id'),
		token: await bits('write'),
		key: await crypto.subtle.deriveKey(
			params('data'),
			base,
			{ name: 'AES-GCM', length: 256 },
			false,
			['encrypt', 'decrypt']
		)
	};
}

export async function encrypt(key: CryptoKey, text: string): Promise<string> {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(text));
	return `${toBase64(iv)}.${toBase64(new Uint8Array(cipher))}`;
}

export async function decrypt(key: CryptoKey, payload: string): Promise<string> {
	const [iv, cipher] = payload.split('.');
	const plain = await crypto.subtle.decrypt(
		{ name: 'AES-GCM', iv: fromBase64(iv) },
		key,
		fromBase64(cipher)
	);
	return new TextDecoder().decode(plain);
}

function saveMeta() {
	try {
		localStorage.setItem(META_KEY, JSON.stringify(meta));
	} catch {
		// Sync still works this session.
	}
}

export async function request(
	keys: SyncKeys,
	method: 'GET' | 'PUT' | 'DELETE',
	body?: object,
	query = ''
) {
	const res = await fetch(`/api/sync/${keys.id}${query}`, {
		method,
		headers: body ? { 'content-type': 'application/json' } : undefined,
		body: body ? JSON.stringify(body) : undefined
	});
	if (!res.ok) {
		const message = ((await res.json().catch(() => null)) as { message?: string } | null)?.message;
		throw Object.assign(new Error(message ?? `HTTP ${res.status}`), { status: res.status });
	}
	return res.json() as Promise<Record<string, unknown>>;
}

/** Offline, server trouble or rate limit: worth trying again later; a refused token is not. */
function isTemporary(err: unknown): boolean {
	if (!(err instanceof Error) || !('status' in err)) return true;
	const status = Number(err.status);
	return status >= 500 || status === 429;
}

function fail(err: unknown) {
	syncState.status = 'error';
	syncState.message = isTemporary(err)
		? 'Zálohu sa teraz nepodarilo uložiť – server alebo pripojenie nefunguje. Kód platí, skúsim to znova sám.'
		: err instanceof Error
			? err.message
			: 'Synchronizácia zlyhala.';
}

/** Uploads everything now. */
/** Uploads everything now; when another device saved meanwhile, merges with it first. */
export async function pushNow(): Promise<void> {
	clearTimeout(pushTimer);
	pushTimer = undefined;
	if (!syncState.code || !tab.syncs) return;
	await exclusive(async () => {
		syncState.status = 'syncing';
		try {
			const keys = await deriveKeys(syncState.code!);
			for (let attempt = 0; ; attempt++) {
				const text = exportBackup();
				try {
					const saved = await request(keys, 'PUT', {
						token: keys.token,
						data: await encrypt(keys.key, text),
						...(meta.version !== null && { ifVersion: meta.version })
					});
					await agreed(text, saved.updatedAt as number, saved.version);
					break;
				} catch (err) {
					if (!isConflict(err) || attempt >= MAX_MERGES) throw err;
					// Someone else saved since: take their changes into ours, then try again.
					await mergeRemote(await fetchRemote(keys));
				}
			}
			syncState.status = 'idle';
			syncState.message = '';
			retryDelay = RETRY_FIRST_MS;
		} catch (err) {
			fail(err);
			if (isTemporary(err)) {
				pushTimer = setTimeout(() => void pushNow(), retryDelay);
				retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
			}
		}
	});
}

/** One push or pull at a time. */
async function exclusive(job: () => Promise<void>) {
	while (running) await running;
	running = job();
	try {
		await running;
	} finally {
		running = null;
	}
}

const isConflict = (err: unknown) => err instanceof Error && 'status' in err && err.status === 409;

interface Remote {
	text: string;
	updatedAt: number;
	version: number | null;
}

async function fetchRemote(keys: SyncKeys): Promise<Remote | null> {
	const query = meta.version !== null ? `?known=${meta.version}` : '';
	const remote = await request(keys, 'GET', undefined, query);
	if (remote.unchanged === true) return null;
	return {
		text: await decrypt(keys.key, remote.data as string),
		updatedAt: remote.updatedAt as number,
		version: typeof remote.version === 'number' ? remote.version : null
	};
}

/** This device and the server now hold the same backup. */
async function agreed(text: string, updatedAt: number, version: unknown) {
	meta = {
		syncedAt: updatedAt,
		version: typeof version === 'number' ? version : null,
		// Changed again while uploading: that goes up next.
		dirty: dataOf(text) !== dataOf(exportBackup())
	};
	saveMeta();
	syncState.syncedAt = meta.syncedAt;
	try {
		await kvSet(BASE_KEY, text);
	} catch {
		// Without the base the next merge keeps both sides' additions (nothing is lost).
	}
}

/** A backup's data without its export time, to compare two backups. */
function dataOf(text: string): string {
	try {
		return JSON.stringify((JSON.parse(text) as { data?: unknown }).data);
	} catch {
		return text;
	}
}

/** Puts a backup's data on this device; it isn't an edit of this device's to upload back. */
function apply(text: string) {
	const restored = importBackup(text);
	if (restored === null) throw new Error('Záloha na serveri je poškodená.');
	appliedUpTo = changes.count;
	restores.count++;
}

/**
 * The server has a newer backup: without changes here it simply replaces the data; with changes
 * on both devices the two merge against the backup they last shared, and this device keeps
 * changes to upload.
 */
async function mergeRemote(remote: Remote | null) {
	if (!remote) return;
	if (!meta.dirty) {
		apply(remote.text);
		await agreed(remote.text, remote.updatedAt, remote.version);
		return;
	}
	const base = await kvGet<string>(BASE_KEY).catch(() => undefined);
	apply(mergeBackups(base ?? null, exportBackup(), remote.text));
	meta = { syncedAt: remote.updatedAt, version: remote.version, dirty: true };
	saveMeta();
	try {
		await kvSet(BASE_KEY, remote.text);
	} catch {
		// See agreed().
	}
}

/** Both devices' changes since `base`; where both changed the same thing, this device's. */
export function mergeBackups(base: string | null, local: string, remote: string): string {
	const data = (text: string | null) => {
		try {
			return text ? (JSON.parse(text) as { data?: unknown }).data : undefined;
		} catch {
			return undefined;
		}
	};
	const parsed = JSON.parse(local) as Record<string, unknown>;
	return JSON.stringify({ ...parsed, data: merge3(data(base), data(local), data(remote)) });
}

/** Takes newer data from another device, merging when both changed. */
export async function pullIfNewer(): Promise<void> {
	if (!syncState.code || !tab.syncs) return;
	try {
		const keys = await deriveKeys(syncState.code);
		await exclusive(async () => mergeRemote(await fetchRemote(keys)));
		syncState.status = 'idle';
		syncState.message = '';
		if (meta.dirty) await pushNow();
	} catch (err) {
		// A code whose data was deleted elsewhere: upload what this device has.
		if (err instanceof Error && 'status' in err && err.status === 404) {
			meta = { ...meta, version: null, dirty: true };
			await pushNow();
		} else fail(err);
	}
}

function storeCode(code: string | null) {
	syncState.code = code;
	syncState.status = code ? 'idle' : 'off';
	try {
		if (code) localStorage.setItem(CODE_KEY, code);
		else {
			localStorage.removeItem(CODE_KEY);
			localStorage.removeItem(META_KEY);
		}
	} catch {
		// Kept in memory for this session.
	}
}

/** Starts syncing this device under a brand new code. */
export async function enableSync(): Promise<void> {
	void requestPersistence();
	storeCode(generateCode());
	meta = { syncedAt: null, version: null, dirty: true };
	saveMeta();
	await pushNow();
}

/** Joins an existing code: replaces this device's data with the saved one. */
export async function connectSync(input: string): Promise<string | null> {
	const code = normalizeCode(input);
	if (!code) return 'Kód má 20 znakov – skontroluj, či je celý.';
	try {
		const keys = await deriveKeys(code);
		const remote = await request(keys, 'GET');
		const text = await decrypt(keys.key, remote.data as string);
		storeCode(code);
		apply(text);
		meta.dirty = false;
		await agreed(text, remote.updatedAt as number, remote.version);
		void requestPersistence();
		return null;
	} catch (err) {
		if (err instanceof Error && 'status' in err && err.status === 404) {
			return 'Pre tento kód nie sú uložené žiadne dáta.';
		}
		return err instanceof Error && err.name === 'OperationError'
			? 'Dáta sa nepodarilo odomknúť – je kód správny?'
			: 'Nepodarilo sa spojiť so serverom.';
	}
}

/** Stops syncing here; optionally deletes the saved copy for every device. */
export async function disableSync(deleteRemote: boolean): Promise<void> {
	if (deleteRemote && syncState.code) {
		try {
			const keys = await deriveKeys(syncState.code);
			await request(keys, 'DELETE', { token: keys.token });
		} catch (err) {
			fail(err);
			return;
		}
	}
	clearTimeout(pushTimer);
	storeCode(null);
	meta = { syncedAt: null, version: null, dirty: false };
}

/** Called after saved changes; the syncing tab uploads a few seconds after the last one. */
export function noteChange() {
	if (!syncState.code || !tab.syncs || changes.count <= appliedUpTo) return;
	meta.dirty = true;
	saveMeta();
	clearTimeout(pushTimer);
	pushTimer = setTimeout(() => void pushNow(), PUSH_DELAY_MS);
}

/** Asks the browser not to evict our storage when space runs low. */
export async function requestPersistence(): Promise<boolean> {
	try {
		return (await navigator.storage?.persist?.()) ?? false;
	} catch {
		return false;
	}
}

export async function isPersisted(): Promise<boolean> {
	try {
		return (await navigator.storage?.persisted?.()) ?? false;
	} catch {
		return false;
	}
}

function readMeta(raw: unknown): Meta {
	const saved = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
	return {
		syncedAt: typeof saved.syncedAt === 'number' ? saved.syncedAt : null,
		version: typeof saved.version === 'number' ? saved.version : null,
		dirty: saved.dirty === true
	};
}

/** Once, from the root layout after local data is loaded. */
export function initSync() {
	try {
		const code = localStorage.getItem(CODE_KEY);
		meta = readMeta(JSON.parse(localStorage.getItem(META_KEY) ?? 'null'));
		if (code && normalizeCode(code)) {
			syncState.code = code;
			syncState.status = 'idle';
			syncState.syncedAt = meta.syncedAt;
		}
	} catch {
		return;
	}
	// Only the tab in front syncs; it takes over what's pending when it comes forward.
	onSyncStart(() => pullIfNewer());
	onSyncStop(async () => {
		if (pushTimer) await pushNow();
	});
	addEventListener('online', () => void pullIfNewer());
	// Sync switched on or off, or synced, in another tab.
	addEventListener('storage', (event) => {
		if (event.key === CODE_KEY) {
			syncState.code = event.newValue && normalizeCode(event.newValue);
			syncState.status = syncState.code ? 'idle' : 'off';
		} else if (event.key === META_KEY) {
			try {
				meta = readMeta(JSON.parse(event.newValue ?? 'null'));
			} catch {
				return;
			}
			syncState.syncedAt = meta.syncedAt;
		}
	});
}
