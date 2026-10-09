import {
	MAX_MEMBERS,
	activeMembers,
	householdNeeds,
	mergeDocs,
	newDoc,
	validateDoc,
	viewOf,
	withLocalChanges,
	type HouseholdDoc,
	type HouseholdNeeds,
	type Member,
	type SharedView
} from './household';
import { changes, checkedItems, extraItems, pantry, plan, settings } from './state.svelte';
import {
	decrypt,
	deriveKeys,
	encrypt,
	generateCode,
	normalizeCode,
	request,
	restores,
	type SyncKeys
} from './sync.svelte';

/**
 * The household on this device: the shared plan, pantry and list stay in their usual stores, and
 * this loop merges them with everyone else's copy on the encrypted sync storage. The code lives
 * only on the device and in the invite link's fragment (/domacnost#d=CODE).
 */

export const HOUSEHOLD_PREFIX = 'd=';
const STORAGE_KEY = 'receptio:household';
/** Visible tab only; with the live list both stay well under 30 requests a minute. */
const POLL_MS = 15_000;
const PUSH_DELAY_MS = 1500;

interface Saved {
	code: string;
	/** Which member is the person holding this phone, if they picked one. */
	me: string | null;
	/** As of the last sync, so its view tells what changed here since. */
	doc: HouseholdDoc;
}

export const household = $state<{
	status: 'off' | 'connecting' | 'live' | 'offline' | 'missing';
	code: string | null;
	me: string | null;
	doc: HouseholdDoc | null;
	/** Last successful sync, ms. */
	syncedAt: number | null;
}>({ status: 'off', code: null, me: null, doc: null, syncedAt: null });

let keys: SyncKeys | null = null;
/** The shared data as it was after the last sync, to tell what changed here since. */
let base: SharedView | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let pushTimer: ReturnType<typeof setTimeout> | undefined;
let running: Promise<void> | null = null;
let seenRestores = 0;
/** Changes up to this count came from the household itself – nothing new to share. */
let appliedUpTo = 0;

export const members = (): Member[] => (household.doc ? activeMembers(household.doc) : []);

/** What the whole table has to leave out; null outside a household or when nobody has needs. */
export function tableNeeds(): HouseholdNeeds | null {
	const list = members();
	return list.length ? householdNeeds(list) : null;
}

export const inviteLink = (code: string) =>
	`${location.origin}/domacnost#${HOUSEHOLD_PREFIX}${code}`;

function currentView(): SharedView {
	return {
		plan: plan.current,
		pantry: pantry.current,
		checked: checkedItems.current,
		extras: extraItems.current
	};
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function applyView(view: SharedView) {
	const now = currentView();
	if (!same(now.plan, view.plan)) plan.current = view.plan;
	if (!same(now.pantry, view.pantry)) pantry.current = view.pantry;
	if (!same(now.checked, view.checked)) checkedItems.current = view.checked;
	if (!same(now.extras, view.extras)) extraItems.current = view.extras;
	syncPeople();
	appliedUpTo = changes.count;
}

/** Everyone in the household eats, so the plan cooks for all of them. */
function syncPeople() {
	const count = members().length;
	if (count && count !== settings.current.people) {
		settings.current = { ...settings.current, people: Math.min(count, 12) };
	}
}

function save() {
	if (!household.code || !household.doc || !base) return;
	try {
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({
				code: household.code,
				me: household.me,
				doc: household.doc
			} satisfies Saved)
		);
	} catch {
		// Works for this session; the next visit asks for the link again.
	}
}

async function upload(doc: HouseholdDoc) {
	if (!keys) return;
	await request(keys, 'PUT', {
		token: keys.token,
		data: await encrypt(keys.key, JSON.stringify(doc))
	});
}

async function fetchDoc(k: SyncKeys): Promise<HouseholdDoc> {
	const remote = await request(k, 'GET');
	const doc = validateDoc(JSON.parse(await decrypt(k.key, remote.data as string)));
	if (!doc) throw new Error('corrupt');
	return doc;
}

async function syncOnce() {
	if (!keys || !household.doc || !base) return;
	try {
		const remote = await fetchDoc(keys);
		// Another device's backup replaced the data here: that isn't an edit to share.
		if (restores.count !== seenRestores) {
			seenRestores = restores.count;
			base = currentView();
		}
		const local = withLocalChanges(household.doc, base, currentView(), Date.now());
		const merged = mergeDocs(remote, local);
		household.doc = merged;
		base = viewOf(merged);
		applyView(base);
		if (!same(merged, remote)) await upload(merged);
		household.status = 'live';
		household.syncedAt = Date.now();
		save();
	} catch (err) {
		const status = err instanceof Error && 'status' in err ? Number(err.status) : 0;
		household.status = status === 404 ? 'missing' : 'offline';
	}
}

/** One sync at a time; a request while one runs waits for it and runs again. */
async function sync(): Promise<void> {
	clearTimeout(timer);
	while (running) await running;
	running = syncOnce();
	try {
		await running;
	} finally {
		running = null;
	}
	if (keys && household.status !== 'missing' && document.visibilityState === 'visible') {
		timer = setTimeout(() => void sync(), POLL_MS);
	}
}

function onVisibility() {
	if (!keys) return;
	if (document.visibilityState === 'visible') void sync();
	else {
		clearTimeout(timer);
		if (pushTimer) {
			clearTimeout(pushTimer);
			pushTimer = undefined;
			void sync();
		}
	}
}

async function start(code: string) {
	keys = await deriveKeys(code);
	seenRestores = restores.count;
	document.addEventListener('visibilitychange', onVisibility);
	addEventListener('online', onVisibility);
	await sync();
}

/** Once, from the root layout after local data is loaded. */
export function initHousehold() {
	let saved: Saved | null = null;
	try {
		const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
		const doc = raw && validateDoc(raw.doc);
		const code = raw && typeof raw.code === 'string' ? normalizeCode(raw.code) : null;
		if (doc && code) saved = { code, me: typeof raw.me === 'string' ? raw.me : null, doc };
	} catch {
		saved = null;
	}
	if (!saved) return;
	household.code = saved.code;
	household.me = saved.me;
	household.doc = saved.doc;
	household.status = 'connecting';
	base = viewOf(saved.doc);
	void start(saved.code);
}

/** Saved changes on this device: share them after a short pause. */
export function noteHouseholdChange() {
	if (!keys || changes.count <= appliedUpTo) return;
	clearTimeout(pushTimer);
	pushTimer = setTimeout(() => {
		pushTimer = undefined;
		void sync();
	}, PUSH_DELAY_MS);
}

const newMemberId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 10);

function blankMember(name: string, at: number): Member {
	return {
		id: newMemberId(),
		name: name.trim().slice(0, 40),
		allergens: [],
		avoid: [],
		mild: false,
		glutenFree: false,
		removed: false,
		at
	};
}

/** Starts a household from what this device already has (plan, pantry, list) and returns its code. */
export async function createHousehold(name: string, myName: string): Promise<string> {
	const now = Date.now();
	const code = generateCode();
	let doc = withLocalChanges(newDoc(name, now), viewOf(newDoc('', 0)), currentView(), now);
	const me = myName.trim() ? blankMember(myName, now) : null;
	if (me) doc = { ...doc, members: { [me.id]: me } };
	const k = await deriveKeys(code);
	await request(k, 'PUT', { token: k.token, data: await encrypt(k.key, JSON.stringify(doc)) });
	household.code = code;
	household.me = me?.id ?? null;
	household.doc = doc;
	household.status = 'connecting';
	base = viewOf(doc);
	save();
	await start(code);
	return code;
}

/**
 * Joins from an invite link. The household's plan and list replace this device's; pantry
 * items only this device knows about are added to the shared pantry.
 */
export async function joinHousehold(input: string): Promise<string | null> {
	const code = normalizeCode(input);
	if (!code) return 'Odkaz je neúplný – skús ho skopírovať znova.';
	household.status = 'connecting';
	let remote: HouseholdDoc;
	try {
		remote = await fetchDoc(await deriveKeys(code));
	} catch (err) {
		household.status = household.code ? household.status : 'off';
		if (err instanceof Error && 'status' in err && err.status === 404) {
			return 'Táto domácnosť už neexistuje.';
		}
		return 'Nepodarilo sa spojiť so serverom.';
	}
	const shared = viewOf(remote);
	const ownPantry = Object.fromEntries(
		Object.entries(pantry.current).filter(([id]) => !(id in shared.pantry))
	);
	household.code = code;
	household.me = null;
	household.doc = remote;
	base = shared;
	applyView(shared);
	if (Object.keys(ownPantry).length) pantry.current = { ...shared.pantry, ...ownPantry };
	save();
	await start(code);
	return null;
}

/** Leaves on this device; plan, pantry and list stay here as they are now. */
export async function leaveHousehold() {
	const me = household.me;
	const k = keys;
	clearTimeout(timer);
	clearTimeout(pushTimer);
	while (running) await running;
	if (k && me && household.doc?.members[me]) {
		const doc = household.doc;
		const left = {
			...doc,
			members: { ...doc.members, [me]: { ...doc.members[me], removed: true, at: Date.now() } }
		};
		try {
			await request(k, 'PUT', {
				token: k.token,
				data: await encrypt(k.key, JSON.stringify(mergeDocs(await fetchDoc(k), left)))
			});
		} catch {
			// The others still see this person; they can remove them by hand.
		}
	}
	document.removeEventListener('visibilitychange', onVisibility);
	removeEventListener('online', onVisibility);
	keys = null;
	base = null;
	Object.assign(household, { status: 'off', code: null, me: null, doc: null, syncedAt: null });
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch {
		// Nothing saved to remove.
	}
}

function updateDoc(change: (doc: HouseholdDoc) => HouseholdDoc) {
	if (!household.doc) return;
	household.doc = change(household.doc);
	save();
	syncPeople();
	noteHouseholdChange();
}

export function renameHousehold(name: string) {
	const clean = name.trim().slice(0, 40);
	if (clean) updateDoc((doc) => ({ ...doc, name: [clean, Date.now()] }));
}

export function addMember(name: string): Member | null {
	if (!name.trim() || members().length >= MAX_MEMBERS) return null;
	const member = blankMember(name, Date.now());
	updateDoc((doc) => ({ ...doc, members: { ...doc.members, [member.id]: member } }));
	return member;
}

export function updateMember(id: string, change: Partial<Omit<Member, 'id' | 'at'>>) {
	updateDoc((doc) =>
		doc.members[id]
			? {
					...doc,
					members: { ...doc.members, [id]: { ...doc.members[id], ...change, at: Date.now() } }
				}
			: doc
	);
}

export function removeMember(id: string) {
	updateMember(id, { removed: true });
	if (household.me === id) setMe(null);
}

export function setMe(id: string | null) {
	household.me = id;
	save();
}
