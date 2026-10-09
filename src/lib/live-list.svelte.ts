import { joinRoom, type Room } from './room';
import { decrypt, deriveKeys, encrypt, generateCode, normalizeCode, request } from './sync.svelte';
import type { SyncKeys } from './sync.svelte';

/**
 * A shopping list two people tick off together. It rides on the encrypted sync storage: the code
 * lives only in the link's fragment, the server keeps ciphertext it can't read, and anyone with
 * the link can tick. Each tick carries a time, so concurrent edits merge instead of clobbering,
 * and a save goes only over the version it merged with. The room tells the others at once.
 *
 * Whoever shared it keeps it tied to their own shopping list (`followOwnList`): ticks go both
 * ways, and a changed plan updates the shared list.
 */

/** Seen from the link: /zoznam#z=CODE. */
export const LIVE_PREFIX = 'z=';
/** Without the live room: often enough to feel live in a shop, well under the rate limit. */
const POLL_MS = 5000;
/** With it: only to catch a missed announcement. */
const LIVE_POLL_MS = 60_000;
/** Ticks in a row (walking down an aisle) go out together. */
const SEND_DELAY_MS = 800;
const MAX_TICKS = 300;
const OWN_KEY = 'receptio:live-own';
/** A shared shopping trip is over by then; the own list stops following it. */
const OWN_FOR_MS = 3 * 24 * 60 * 60 * 1000;

export type Ticks = Record<string, [done: boolean, at: number]>;

export interface LiveListData {
	/** encodeSharedPlan() output; decoded and validated like a snapshot link. */
	list: string;
	/** When the list was last replaced (the sharer's plan changed). */
	listAt: number;
	ticks: Ticks;
}

export const live = $state<{
	status: 'off' | 'connecting' | 'live' | 'offline' | 'missing';
	data: LiveListData | null;
}>({ status: 'off', data: null });

let keys: SyncKeys | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let sendTimer: ReturnType<typeof setTimeout> | undefined;
let room: Room | null = null;
/** The server's version as last read or written. */
let version: number | undefined;
/** Changes made here that the server hasn't confirmed yet. */
let pending = false;
let running: Promise<void> | null = null;

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
	const { list, listAt, ticks } = raw as Record<string, unknown>;
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
	const at = typeof listAt === 'number' && Number.isFinite(listAt) ? listAt : 0;
	return { list, listAt: at, ticks: clean };
}

/** The newer tick wins per item, so both people's changes survive. */
export function mergeTicks(a: Ticks, b: Ticks): Ticks {
	const merged: Ticks = { ...a };
	for (const [id, tick] of Object.entries(b)) {
		if (!merged[id] || tick[1] > merged[id][1]) merged[id] = tick;
	}
	return merged;
}

/** Both sides: the newer list, every newest tick. */
export function mergeLive(a: LiveListData, b: LiveListData): LiveListData {
	const list = b.listAt > a.listAt ? b : a;
	return { list: list.list, listAt: list.listAt, ticks: mergeTicks(a.ticks, b.ticks) };
}

/** True when `local` knows something `remote` doesn't yet. */
export function hasNewer(local: LiveListData, remote: LiveListData): boolean {
	return (
		local.listAt > remote.listAt ||
		Object.entries(local.ticks).some(
			([id, tick]) => !remote.ticks[id] || tick[1] > remote.ticks[id][1]
		)
	);
}

const isConflict = (err: unknown) => err instanceof Error && 'status' in err && err.status === 409;

async function upload(k: SyncKeys, data: LiveListData, ifVersion?: number) {
	const saved = await request(k, 'PUT', {
		token: k.token,
		data: await encrypt(k.key, JSON.stringify(data)),
		announce: true,
		...(ifVersion !== undefined && { ifVersion })
	});
	version = typeof saved.version === 'number' ? saved.version : undefined;
}

/** Reads the list, merges what changed here and writes it back over exactly that version. */
async function syncOnce() {
	if (!keys) return;
	const k = keys;
	for (let attempt = 0; ; attempt++) {
		const remote = await request(k, 'GET');
		const data = parseLiveData(await decrypt(k.key, remote.data as string));
		if (!data) throw new Error('corrupt');
		const read = typeof remote.version === 'number' ? remote.version : undefined;
		const local = live.data;
		const merged = local ? mergeLive(data, local) : data;
		if (keys !== k) return;
		live.data = merged;
		version = read;
		if (!pending && !(local && hasNewer(local, data))) return;
		try {
			pending = false;
			await upload(k, merged, read);
			return;
		} catch (err) {
			pending = true;
			if (!isConflict(err) || attempt >= 4) throw err;
		}
	}
}

async function poll() {
	clearTimeout(timer);
	if (!keys) return;
	while (running) await running;
	running = syncOnce();
	try {
		await running;
		live.status = 'live';
	} catch (err) {
		const status = err instanceof Error && 'status' in err ? Number(err.status) : 0;
		live.status = status === 404 ? 'missing' : 'offline';
		if (status === 404) return;
	} finally {
		running = null;
	}
	if (keys && document.visibilityState === 'visible') {
		clearTimeout(timer);
		timer = setTimeout(() => void poll(), room?.open ? LIVE_POLL_MS : POLL_MS);
	}
}

function onVisibility() {
	if (!keys) return;
	if (document.visibilityState === 'visible') {
		room?.retry();
		void poll();
	} else {
		clearTimeout(timer);
		if (sendTimer) {
			clearTimeout(sendTimer);
			sendTimer = undefined;
			void poll();
		}
	}
}

/** Starts a live list from a snapshot of the plan's list and returns its code. */
export async function createLiveList(list: string): Promise<string> {
	const code = generateCode();
	const newKeys = await deriveKeys(code);
	await request(newKeys, 'PUT', {
		token: newKeys.token,
		data: await encrypt(
			newKeys.key,
			JSON.stringify({ list, listAt: Date.now(), ticks: {} } satisfies LiveListData)
		)
	});
	try {
		localStorage.setItem(OWN_KEY, JSON.stringify({ code, at: Date.now() }));
	} catch {
		// The own list just won't follow it.
	}
	return code;
}

export async function joinLiveList(input: string): Promise<void> {
	const code = normalizeCode(input);
	if (!code) {
		live.status = 'missing';
		return;
	}
	leaveLiveList();
	live.status = 'connecting';
	keys = await deriveKeys(code);
	const id = keys.id;
	document.addEventListener('visibilitychange', onVisibility);
	room = joinRoom(
		id,
		(v) => {
			if (keys?.id === id && v !== version) void poll();
		},
		() => void poll()
	);
	await poll();
}

export function leaveLiveList() {
	clearTimeout(timer);
	clearTimeout(sendTimer);
	sendTimer = undefined;
	document.removeEventListener('visibilitychange', onVisibility);
	room?.close();
	room = null;
	keys = null;
	version = undefined;
	pending = false;
	live.status = 'off';
	live.data = null;
}

/** Changed here: goes out after a short pause, together with the next few. */
function changed() {
	pending = true;
	clearTimeout(sendTimer);
	sendTimer = setTimeout(() => {
		sendTimer = undefined;
		void poll();
	}, SEND_DELAY_MS);
}

export function tickLive(id: string, done: boolean) {
	if (!live.data) return;
	live.data = { ...live.data, ticks: { ...live.data.ticks, [id]: [done, Date.now()] } };
	changed();
}

/** The sharer's plan changed: the shared list shows the new one. */
export function replaceLiveList(list: string) {
	if (!live.data || live.data.list === list) return;
	live.data = { ...live.data, list, listAt: Date.now() };
	changed();
}

/** The list this device shared lately, which its own shopping list follows. */
export function ownLiveCode(): string | null {
	try {
		const saved = JSON.parse(localStorage.getItem(OWN_KEY) ?? 'null') as {
			code?: unknown;
			at?: unknown;
		} | null;
		if (typeof saved?.code !== 'string' || typeof saved.at !== 'number') return null;
		if (Date.now() - saved.at > OWN_FOR_MS) return null;
		return normalizeCode(saved.code);
	} catch {
		return null;
	}
}

/** Shopping together is over: the own list stops following the shared one. */
export function stopOwnLive() {
	try {
		localStorage.removeItem(OWN_KEY);
	} catch {
		// Expires on its own.
	}
	leaveLiveList();
}
