import { decrypt, deriveKeys, encrypt, generateCode, normalizeCode, request } from './sync.svelte';
import type { SyncKeys } from './sync.svelte';

/**
 * A shopping list two people tick off together. It rides on the encrypted sync storage: the code
 * lives only in the link's fragment, the server keeps ciphertext it can't read, and anyone with
 * the link can tick. Each tick carries a time, so concurrent edits merge instead of clobbering.
 */

/** Seen from the link: /zoznam#z=CODE. */
export const LIVE_PREFIX = 'z=';
/** Often enough to feel live in a shop, well under the sync rate limit (30/min per address). */
const POLL_MS = 5000;
const MAX_TICKS = 300;

export type Ticks = Record<string, [done: boolean, at: number]>;

export interface LiveListData {
	/** encodeSharedPlan() output; decoded and validated like a snapshot link. */
	list: string;
	ticks: Ticks;
}

export const live = $state<{
	status: 'off' | 'connecting' | 'live' | 'offline' | 'missing';
	data: LiveListData | null;
}>({ status: 'off', data: null });

let keys: SyncKeys | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
/** Ticks made here that the server hasn't confirmed yet. */
let pending = false;

const TICK_ID = /^[a-z0-9-]{1,80}$/;

/** Untrusted: whatever the server (or another client) stored. Bad entries are dropped. */
export function parseLiveData(text: string): LiveListData | null {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		return null;
	}
	if (typeof raw !== 'object' || raw === null) return null;
	const { list, ticks } = raw as Record<string, unknown>;
	if (typeof list !== 'string' || list.length > 20_000) return null;
	const clean: Ticks = {};
	if (typeof ticks === 'object' && ticks !== null) {
		for (const [id, tick] of Object.entries(ticks).slice(0, MAX_TICKS)) {
			if (!TICK_ID.test(id) || !Array.isArray(tick)) continue;
			const [done, at] = tick as unknown[];
			if (typeof done === 'boolean' && typeof at === 'number' && Number.isFinite(at)) {
				clean[id] = [done, at];
			}
		}
	}
	return { list, ticks: clean };
}

/** The newer tick wins per item, so both people's changes survive. */
export function mergeTicks(a: Ticks, b: Ticks): Ticks {
	const merged: Ticks = { ...a };
	for (const [id, tick] of Object.entries(b)) {
		if (!merged[id] || tick[1] > merged[id][1]) merged[id] = tick;
	}
	return merged;
}

/** True when `local` knows something `remote` doesn't yet. */
export function hasNewer(local: Ticks, remote: Ticks): boolean {
	return Object.entries(local).some(([id, tick]) => !remote[id] || tick[1] > remote[id][1]);
}

async function upload(data: LiveListData) {
	if (!keys) return;
	await request(keys, 'PUT', {
		token: keys.token,
		data: await encrypt(keys.key, JSON.stringify(data))
	});
}

async function poll() {
	clearTimeout(timer);
	if (!keys) return;
	try {
		const remote = await request(keys, 'GET');
		const data = parseLiveData(await decrypt(keys.key, remote.data as string));
		if (!data) throw new Error('corrupt');
		const local = live.data?.ticks ?? {};
		const merged = { list: data.list, ticks: mergeTicks(data.ticks, local) };
		live.data = merged;
		if (pending || hasNewer(local, data.ticks)) {
			await upload(merged);
			pending = false;
		}
		live.status = 'live';
	} catch (err) {
		const status = err instanceof Error && 'status' in err ? Number(err.status) : 0;
		live.status = status === 404 ? 'missing' : 'offline';
		if (status === 404) return;
	}
	if (document.visibilityState === 'visible') timer = setTimeout(() => void poll(), POLL_MS);
}

function onVisibility() {
	if (document.visibilityState === 'visible' && keys) void poll();
	else clearTimeout(timer);
}

/** Starts a live list from a snapshot of the plan's list and returns its code. */
export async function createLiveList(list: string): Promise<string> {
	const code = generateCode();
	const newKeys = await deriveKeys(code);
	await request(newKeys, 'PUT', {
		token: newKeys.token,
		data: await encrypt(newKeys.key, JSON.stringify({ list, ticks: {} } satisfies LiveListData))
	});
	return code;
}

export async function joinLiveList(input: string): Promise<void> {
	const code = normalizeCode(input);
	if (!code) {
		live.status = 'missing';
		return;
	}
	live.status = 'connecting';
	keys = await deriveKeys(code);
	document.addEventListener('visibilitychange', onVisibility);
	await poll();
}

export function leaveLiveList() {
	clearTimeout(timer);
	document.removeEventListener('visibilitychange', onVisibility);
	keys = null;
	live.status = 'off';
	live.data = null;
}

export function tickLive(id: string, done: boolean) {
	if (!live.data) return;
	live.data = { ...live.data, ticks: { ...live.data.ticks, [id]: [done, Date.now()] } };
	pending = true;
	void poll();
}
