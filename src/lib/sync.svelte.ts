import { exportBackup, importBackup } from './backup';
import { changes } from './state.svelte';

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

type Status = 'off' | 'idle' | 'syncing' | 'error' | 'conflict';

export const syncState = $state<{
	code: string | null;
	status: Status;
	/** Server time (s) of the version this device last matched. */
	syncedAt: number | null;
	message: string;
}>({ code: null, status: 'off', syncedAt: null, message: '' });

interface Meta {
	syncedAt: number | null;
	/** Local changes not yet uploaded. */
	dirty: boolean;
}

let meta: Meta = { syncedAt: null, dirty: false };
let pushTimer: ReturnType<typeof setTimeout> | undefined;
/** Wait before retrying a failed upload; doubles up to RETRY_MAX_MS, resets on success. */
const RETRY_FIRST_MS = 60_000;
const RETRY_MAX_MS = 10 * 60_000;
let retryDelay = RETRY_FIRST_MS;
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
export async function pushNow(): Promise<void> {
	clearTimeout(pushTimer);
	pushTimer = undefined;
	if (!syncState.code) return;
	syncState.status = 'syncing';
	try {
		const keys = await deriveKeys(syncState.code);
		const { updatedAt } = await request(keys, 'PUT', {
			token: keys.token,
			data: await encrypt(keys.key, exportBackup())
		});
		meta = { syncedAt: updatedAt as number, dirty: false };
		saveMeta();
		syncState.syncedAt = meta.syncedAt;
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
}

async function applyRemote(keys: SyncKeys, remote: { data: string; updatedAt: number }) {
	const restored = importBackup(await decrypt(keys.key, remote.data));
	if (restored === null) throw new Error('Záloha na serveri je poškodená.');
	appliedUpTo = changes.count;
	restores.count++;
	meta = { syncedAt: remote.updatedAt, dirty: false };
	saveMeta();
	syncState.syncedAt = meta.syncedAt;
	syncState.status = 'idle';
	syncState.message = '';
}

/** Takes newer data from another device, unless this one has unsent changes (then asks). */
export async function pullIfNewer(): Promise<void> {
	if (!syncState.code || syncState.status === 'syncing') return;
	try {
		const keys = await deriveKeys(syncState.code);
		const remote = (await request(keys, 'GET')) as { data: string; updatedAt: number };
		if (meta.syncedAt !== null && remote.updatedAt <= meta.syncedAt) {
			if (meta.dirty) await pushNow();
			return;
		}
		if (meta.dirty) {
			syncState.status = 'conflict';
			return;
		}
		await applyRemote(keys, remote);
	} catch (err) {
		// A code whose data was deleted elsewhere: upload what this device has.
		if (err instanceof Error && 'status' in err && err.status === 404) await pushNow();
		else fail(err);
	}
}

/** When both devices changed: keep the server's version or overwrite it with this one. */
export async function resolveConflict(keep: 'remote' | 'local'): Promise<void> {
	if (!syncState.code) return;
	if (keep === 'local') return pushNow();
	try {
		const keys = await deriveKeys(syncState.code);
		await applyRemote(keys, (await request(keys, 'GET')) as { data: string; updatedAt: number });
	} catch (err) {
		fail(err);
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
	meta = { syncedAt: null, dirty: true };
	await pushNow();
}

/** Joins an existing code: replaces this device's data with the saved one. */
export async function connectSync(input: string): Promise<string | null> {
	const code = normalizeCode(input);
	if (!code) return 'Kód má 20 znakov – skontroluj, či je celý.';
	try {
		const keys = await deriveKeys(code);
		const remote = (await request(keys, 'GET')) as { data: string; updatedAt: number };
		storeCode(code);
		await applyRemote(keys, remote);
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
	meta = { syncedAt: null, dirty: false };
}

/** Called after saved changes; uploads a few seconds after the last one. */
export function noteChange() {
	if (!syncState.code || changes.count <= appliedUpTo) return;
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

/** Once, from the root layout after local data is loaded. */
export function initSync() {
	try {
		const code = localStorage.getItem(CODE_KEY);
		const saved = JSON.parse(localStorage.getItem(META_KEY) ?? 'null');
		if (saved && typeof saved === 'object') {
			meta = {
				syncedAt: typeof saved.syncedAt === 'number' ? saved.syncedAt : null,
				dirty: saved.dirty === true
			};
		}
		if (code && normalizeCode(code)) {
			syncState.code = code;
			syncState.status = 'idle';
			syncState.syncedAt = meta.syncedAt;
		}
	} catch {
		return;
	}
	// Listeners go on even without a code: sync can be switched on later in this session.
	if (syncState.code) void pullIfNewer();
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible') void pullIfNewer();
		else if (pushTimer) void pushNow();
	});
	addEventListener('online', () => void pullIfNewer());
}
