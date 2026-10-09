import {
	EMPTY_BODY,
	MAX_MEMBERS,
	STALE_OWNER_MS,
	acceptMember,
	activeMembers,
	changeEvents,
	householdNeeds,
	logId,
	mergeDocs,
	newDoc,
	portionsAt,
	validateDoc,
	validatePlanEntries,
	viewOf,
	wishKey,
	withEvents,
	withLocalChanges,
	type EatenDay,
	type Expense,
	type HouseholdDoc,
	type HouseholdNeeds,
	type LogEvent,
	type Member,
	type PlanMeal,
	type SharedView
} from './household';
import { localToday, shiftDate } from './journal';
import { newSigner, signMember, verifyMember, type Signer } from './member-keys';
import type { Pantry } from './pantry';
import type { PlanEntry } from './shopping';
import {
	changes,
	checkedItems,
	extraItems,
	gardens,
	mainMeals,
	MAX_GARDENS,
	pantry,
	pantryAdded,
	plan,
	settings,
	validateDates,
	validatePantry,
	type ExtraItem,
	type Settings
} from './state.svelte';
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
 *
 * The household's plan, list and pantry are kept apart from the person's own: joining puts the
 * own ones aside untouched, "planning for myself" switches back to them for a while (on holiday,
 * a week of lunches at work) and leaving brings them back. Nothing is merged either way.
 */

export const HOUSEHOLD_PREFIX = 'd=';
const STORAGE_KEY = 'receptio:household';
/** Visible tab only; a few phones on one home connection plus the live list stay under 60 a minute. */
const POLL_MS = 15_000;
const PUSH_DELAY_MS = 1500;

/** One person's own plan, list and pantry, kept aside while they plan with the household. */
interface PersonalPlan {
	plan: PlanEntry[];
	checked: Record<string, boolean>;
	extras: ExtraItem[];
	pantry: Pantry;
	/** When each own pantry item was added, for "use soon". */
	added: Record<string, string>;
}

const EMPTY_PERSONAL: PersonalPlan = { plan: [], checked: {}, extras: [], pantry: {}, added: {} };

/** What's on this device now – the own data while planning for oneself. */
const onDevice = (): PersonalPlan => ({
	plan: plan.current,
	checked: checkedItems.current,
	extras: extraItems.current,
	pantry: pantry.current,
	added: pantryAdded.current
});

function putOnDevice(data: PersonalPlan) {
	plan.current = data.plan;
	checkedItems.current = data.checked;
	extraItems.current = data.extras;
	pantry.current = data.pantry;
	pantryAdded.current = data.added;
}

interface Saved {
	code: string;
	/** Which member is the person holding this phone, if they picked one. */
	me: string | null;
	/** As of the last sync, so its view tells what changed here since. */
	doc: HouseholdDoc;
	solo: boolean;
	/** Planning alone marked them away; coming back clears it. */
	soloAway: boolean;
	/** The own data while the household's is on the device; null while planning for oneself. */
	personal: PersonalPlan | null;
	/** This phone's key for its own profile. */
	signer: Signer | null;
}

export const household = $state<{
	status: 'off' | 'connecting' | 'live' | 'offline' | 'missing';
	code: string | null;
	me: string | null;
	doc: HouseholdDoc | null;
	/** Last successful sync, ms. */
	syncedAt: number | null;
	/** This device plans on its own for now. */
	solo: boolean;
	soloAway: boolean;
}>({
	status: 'off',
	code: null,
	me: null,
	doc: null,
	syncedAt: null,
	solo: false,
	soloAway: false
});

let keys: SyncKeys | null = null;
/** The shared data as it was after the last sync, to tell what changed here since. */
let base: SharedView | null = null;
let personal: PersonalPlan | null = null;
let signer: Signer | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let pushTimer: ReturnType<typeof setTimeout> | undefined;
let running: Promise<void> | null = null;
let seenRestores = 0;
/** Changes up to this count came from the household itself – nothing new to share. */
let appliedUpTo = 0;
/** Told to the others with the next sync. */
let pendingEvents: LogEvent[] = [];
const cookedSinceSync = new Set<string>();

/** Everyone in the household, alone-planning or not. */
export const members = (): Member[] => (household.doc ? activeMembers(household.doc) : []);

/** Who the plan cooks for: the household, or only this person while they plan alone. */
export function tableMembers(): Member[] {
	if (!household.solo) return members();
	return members().filter((m) => m.id === household.me);
}

/** True when the household decides how many eat (not the "cook for" setting). */
export const planFromHousehold = () => !household.solo && members().length > 0;

/**
 * Cooked by one member just for themselves: bought with the rest, but not one of the shared
 * meals. Outside the household (or once they've left it) it's an ordinary entry.
 */
export const isPersonal = (e: PlanEntry) =>
	!!e.only && planFromHousehold() && members().some((m) => m.id === e.only);

/** What the whole table has to leave out; null outside a household or when nobody has needs. */
export function tableNeeds(): HouseholdNeeds | null {
	const list = tableMembers();
	return list.length ? householdNeeds(list) : null;
}

export const myMember = (): Member | null =>
	(household.me && members().find((m) => m.id === household.me)) || null;

export const inviteLink = (code: string) =>
	`${location.origin}/domacnost#${HOUSEHOLD_PREFIX}${code}`;

// ── Portions for the plan ──────────────────────────────────────

/**
 * Portions eaten at each meal of the plan (day 0 = today), from who's home and how much they eat;
 * undefined outside a household, where every meal is "cook for" people.
 */
export function planNeed(
	s: Settings
): ((day: number, meal: number | 'ranajky') => number) | undefined {
	if (!planFromHousehold()) return undefined;
	const list = members();
	const slots = mainMeals(s);
	const today = localToday();
	return (day, meal) =>
		portionsAt(list, shiftDate(today, day), meal === 'ranajky' ? 'ranajky' : slots[meal]);
}

/** The plan's meals and portions in all, for the automatic plan. */
export function planSlots(s: Settings) {
	const need = planNeed(s);
	if (!need) return undefined;
	const slots = { main: 0, mainPortions: 0, morning: 0, morningPortions: 0 };
	for (let day = 0; day < s.planDays; day++) {
		mainMeals(s).forEach((_, slot) => {
			const portions = need(day, slot);
			if (portions > 0) {
				slots.main++;
				slots.mainPortions += portions;
			}
		});
		const morning = s.breakfasts ? need(day, 'ranajky') : 0;
		if (morning > 0) {
			slots.morning++;
			slots.morningPortions += morning;
		}
	}
	return slots;
}

/** Who eats at this meal on this plan day, for the schedule. */
export function eatersAt(day: number, meal: PlanMeal): Member[] {
	if (!planFromHousehold()) return [];
	const date = shiftDate(localToday(), day);
	return members().filter((m) => portionsAt([m], date, meal) > 0);
}

// ── Sync ───────────────────────────────────────────────────────

/** Gardens grown with the household; the others on this phone stay the person's own. */
export const isSharedGarden = (id: string) => {
	const shared = household.doc?.gardens[id];
	return !!shared && shared[0] !== false;
};

function currentView(): SharedView {
	return {
		plan: plan.current,
		pantry: pantry.current,
		checked: checkedItems.current,
		extras: extraItems.current,
		gardens: gardens.current.filter((g) => isSharedGarden(g.id))
	};
}

/**
 * What this device shares: planning for oneself, only the gardens – the household's plan, list
 * and pantry wait as they were.
 */
function sharedView(): SharedView {
	if (!household.solo || !base) return currentView();
	return { ...base, gardens: currentView().gardens };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function applyView(view: SharedView) {
	const now = currentView();
	if (!household.solo) {
		if (!same(now.plan, view.plan)) plan.current = view.plan;
		if (!same(now.checked, view.checked)) checkedItems.current = view.checked;
		if (!same(now.extras, view.extras)) extraItems.current = view.extras;
		if (!same(now.pantry, view.pantry)) pantry.current = view.pantry;
	}
	if (!same(now.gardens, view.gardens)) applyGardens(view.gardens);
	syncPeople();
	appliedUpTo = changes.count;
}

/**
 * Shared gardens replace their copy here or arrive as new ones. One that stopped being shared
 * stays on every phone as that person's own – nobody loses a diary.
 */
function applyGardens(shared: SharedView['gardens']) {
	const byId = new Map(shared.map((g) => [g.id, g]));
	const kept = gardens.current.map((g) => byId.get(g.id) ?? g);
	const known = new Set(kept.map((g) => g.id));
	gardens.current = [...kept, ...shared.filter((g) => !known.has(g.id))].slice(0, MAX_GARDENS);
}

/** Starts growing a garden together: the others get it with its diary on their next sync. */
export function shareGarden(id: string) {
	const garden = gardens.current.find((g) => g.id === id);
	if (!garden || !household.doc) return;
	updateDoc((doc) =>
		withLocalChanges(
			doc,
			{ ...viewOf(doc), gardens: [] },
			{ ...viewOf(doc), gardens: [garden] },
			Date.now()
		)
	);
}

/** Stops sharing; everyone keeps a copy of it as their own. */
export function unshareGarden(id: string) {
	updateDoc((doc) => ({ ...doc, gardens: { ...doc.gardens, [id]: [false, Date.now()] } }));
}

/** Everyone in the household eats, so the plan cooks for all of them. */
function syncPeople() {
	const count = members().length;
	if (!household.solo && count && count !== settings.current.people) {
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
				doc: household.doc,
				solo: household.solo,
				soloAway: household.soloAway,
				personal,
				signer
			} satisfies Saved)
		);
	} catch {
		// Works for this session; the next visit asks for the link again.
	}
}

/** `ifVersion`: write only over the copy this phone merged with; creating a new copy has none. */
async function upload(k: SyncKeys, doc: HouseholdDoc, ifVersion?: number) {
	await request(k, 'PUT', {
		token: k.token,
		data: await encrypt(k.key, JSON.stringify(doc)),
		...(ifVersion !== undefined && { ifVersion })
	});
}

interface Remote {
	doc: HouseholdDoc;
	/** Absent until the server has the version column. */
	version?: number;
}

async function fetchDoc(k: SyncKeys): Promise<Remote> {
	const remote = await request(k, 'GET');
	const doc = validateDoc(JSON.parse(await decrypt(k.key, remote.data as string)));
	if (!doc) throw new Error('corrupt');
	return { doc, version: typeof remote.version === 'number' ? remote.version : undefined };
}

/**
 * The other phones' copy, minus profile changes they had no right to make: an owned profile
 * changes only with its owner's signature. `local` is what this phone trusts already.
 */
async function trusted(remote: HouseholdDoc, local: HouseholdDoc | null): Promise<HouseholdDoc> {
	const now = Date.now();
	const members = { ...remote.members };
	for (const theirs of Object.values(remote.members)) {
		const mine = local?.members[theirs.id];
		if (mine && theirs.at <= mine.at) continue;
		const signed = !!theirs.owner && (await verifyMember(theirs));
		if (acceptMember(mine, theirs, signed, now)) continue;
		if (mine) members[theirs.id] = mine;
		else delete members[theirs.id];
	}
	return { ...remote, members };
}

const isConflict = (err: unknown) => err instanceof Error && 'status' in err && err.status === 409;
/** Someone else saved in between: read their copy, merge again and retry – a few times at most. */
const MAX_RETRIES = 4;

/**
 * Merges this phone's changes into `remote` and writes the result over exactly that version. When
 * another phone wrote first, its copy is read and merged again, so neither change is lost.
 */
async function mergeAndUpload(
	k: SyncKeys,
	remote: Remote,
	local: () => HouseholdDoc,
	merged: (doc: HouseholdDoc) => void
) {
	for (let attempt = 0; ; attempt++) {
		const doc = mergeDocs(await trusted(remote.doc, household.doc), local());
		merged(doc);
		if (same(doc, remote.doc)) return;
		try {
			await upload(k, doc, remote.version);
			return;
		} catch (err) {
			if (!isConflict(err) || attempt >= MAX_RETRIES) throw err;
			remote = await fetchDoc(k);
		}
	}
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
		// Each round takes what changed here since the last one – also while an upload was waiting.
		await mergeAndUpload(
			keys,
			remote,
			() => {
				const now = Date.now();
				const view = sharedView();
				const events = [
					...pendingEvents,
					...changeEvents(base!, view, household.me, now, cookedSinceSync)
				];
				pendingEvents = [];
				cookedSinceSync.clear();
				return withEvents(withLocalChanges(household.doc!, base!, view, now), events);
			},
			(doc) => {
				household.doc = doc;
				base = viewOf(doc);
				applyView(base);
			}
		);
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
	stop();
	keys = await deriveKeys(code);
	seenRestores = restores.count;
	document.addEventListener('visibilitychange', onVisibility);
	addEventListener('online', onVisibility);
	await sync();
}

function stop() {
	clearTimeout(timer);
	clearTimeout(pushTimer);
	pushTimer = undefined;
	document.removeEventListener('visibilitychange', onVisibility);
	removeEventListener('online', onVisibility);
	keys = null;
}

/** Once, from the root layout after local data is loaded. */
export function initHousehold() {
	let saved: Saved | null = null;
	try {
		const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
		const doc = raw && validateDoc(raw.doc);
		const code = raw && typeof raw.code === 'string' ? normalizeCode(raw.code) : null;
		if (doc && code) {
			saved = {
				code,
				me: typeof raw.me === 'string' ? raw.me : null,
				doc,
				solo: raw.solo === true,
				soloAway: raw.soloAway === true,
				personal: validatePersonal(raw.personal),
				signer: validateSigner(raw.signer)
			};
		}
	} catch {
		saved = null;
	}
	if (!saved) return;
	household.code = saved.code;
	household.me = saved.me;
	household.doc = saved.doc;
	household.solo = saved.solo;
	household.soloAway = saved.soloAway;
	personal = saved.personal;
	signer = saved.signer;
	household.status = 'connecting';
	base = viewOf(saved.doc);
	void start(saved.code).then(() => {
		// Picked "this is me" before profiles had owners: make it theirs now.
		const me = myMember();
		if (me && !me.owner) void claimMember(me.id);
	});
}

function validateSigner(raw: unknown): Signer | null {
	if (typeof raw !== 'object' || raw === null) return null;
	const r = raw as Record<string, unknown>;
	return typeof r.pub === 'string' && typeof r.jwk === 'object' && r.jwk !== null
		? { pub: r.pub, jwk: r.jwk as JsonWebKey }
		: null;
}

/** The stash was written by this app, but storage can be edited – keep only what fits. */
function validatePersonal(raw: unknown): PersonalPlan | null {
	if (typeof raw !== 'object' || raw === null) return null;
	const r = raw as Record<string, unknown>;
	const checked = typeof r.checked === 'object' && r.checked !== null ? r.checked : {};
	return {
		plan: validatePlanEntries(r.plan) ?? [],
		checked: Object.fromEntries(Object.entries(checked).filter(([, v]) => typeof v === 'boolean')),
		extras: Array.isArray(r.extras)
			? r.extras.filter(
					(x): x is ExtraItem =>
						typeof x === 'object' &&
						x !== null &&
						typeof x.id === 'string' &&
						typeof x.text === 'string' &&
						typeof x.checked === 'boolean'
				)
			: [],
		// Stashed before the pantry was kept apart too: it was shared, so the current one is it.
		pantry: validatePantry(r.pantry) ?? pantry.current,
		added: validateDates(r.added) ?? pantryAdded.current
	};
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

/** A recipe from the shared plan was cooked: the others hear that, not "dropped from the plan". */
export function noteCooked(recipeId: string) {
	if (!keys || household.solo) return;
	cookedSinceSync.add(recipeId);
	pendingEvents.push({ at: Date.now(), who: household.me, kind: 'cooked', ref: recipeId });
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
		meals: { ranajky: true, obed: true, vecera: true },
		portion: null,
		body: EMPTY_BODY,
		away: null,
		removed: false,
		at
	};
}

/** Starts an empty household (the own plan, list and pantry go aside) and returns its code. */
export async function createHousehold(name: string, myName: string): Promise<string> {
	const now = Date.now();
	const code = generateCode();
	let doc = newDoc(name, now);
	if (myName.trim()) signer ??= await newSigner();
	const me = myName.trim() && signer ? await signMember(blankMember(myName, now), signer) : null;
	if (me) doc = { ...doc, members: { [me.id]: me } };
	await upload(await deriveKeys(code), doc);
	household.code = code;
	household.me = me?.id ?? null;
	household.doc = doc;
	household.solo = false;
	household.soloAway = false;
	personal = onDevice();
	household.status = 'connecting';
	base = viewOf(doc);
	applyView(base);
	save();
	await start(code);
	return code;
}

/**
 * Joins from an invite link. The own plan, list and pantry go aside as they are and come back
 * when planning for oneself or after leaving; the household's are shown instead.
 */
export async function joinHousehold(input: string): Promise<string | null> {
	const code = normalizeCode(input);
	if (!code) return 'Odkaz je neúplný – skús ho skopírovať znova.';
	const before = household.status;
	household.status = 'connecting';
	let remote: HouseholdDoc;
	try {
		const fetched = (await fetchDoc(await deriveKeys(code))).doc;
		remote = await trusted(fetched, household.doc);
	} catch (err) {
		household.status = household.code ? before : 'off';
		if (err instanceof Error && 'status' in err && err.status === 404) {
			return 'Táto domácnosť už neexistuje.';
		}
		return 'Nepodarilo sa spojiť so serverom.';
	}
	// A new link to the same household (after it was changed) keeps who this phone is.
	const sameHousehold = household.doc && household.me && remote.members[household.me];
	// In another household the device holds that one's data; the own data is already aside.
	const own = household.solo || !household.code ? onDevice() : (personal ?? EMPTY_PERSONAL);
	const shared = viewOf(remote);
	personal = own;
	household.code = code;
	household.me = sameHousehold ? household.me : null;
	household.doc = remote;
	household.solo = false;
	household.soloAway = false;
	base = shared;
	applyView(shared);
	save();
	await start(code);
	return null;
}

/** Leaves on this device; the own plan, list and pantry come back, the household's stay with it. */
export async function leaveHousehold() {
	const me = household.me;
	const k = keys;
	clearTimeout(timer);
	clearTimeout(pushTimer);
	while (running) await running;
	if (k && me && household.doc?.members[me]) {
		const doc = household.doc;
		const gone = { ...doc.members[me], removed: true, at: Date.now() };
		const left = {
			...doc,
			members: {
				...doc.members,
				[me]: gone.owner && signer ? await signMember(gone, signer) : gone
			}
		};
		try {
			await mergeAndUpload(
				k,
				await fetchDoc(k),
				() => left,
				() => {}
			);
		} catch {
			// The others still see this person; they can remove them by hand.
		}
	}
	stop();
	// Joined before own data was kept apart: nothing was put aside, so the household's stays.
	if (!household.solo && personal) putOnDevice(personal);
	base = null;
	personal = null;
	pendingEvents = [];
	Object.assign(household, {
		status: 'off',
		code: null,
		me: null,
		doc: null,
		syncedAt: null,
		solo: false,
		soloAway: false
	});
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch {
		// Nothing saved to remove.
	}
}

/**
 * A new link for the same household: the data moves to a new code and the old one is deleted,
 * so whoever still has the old link (someone who moved out) can't get in any more. Everyone
 * staying needs the new link.
 */
export async function changeLink(): Promise<string> {
	if (!keys || !household.doc) throw new Error('no household');
	await sync();
	clearTimeout(timer);
	clearTimeout(pushTimer);
	while (running) await running;
	const old = keys;
	const code = generateCode();
	const next = await deriveKeys(code);
	await upload(next, household.doc);
	household.code = code;
	save();
	try {
		await request(old, 'DELETE', { token: old.token });
	} catch {
		// The old copy stays readable until it expires; the new one already works.
	}
	await start(code);
	return code;
}

function updateDoc(change: (doc: HouseholdDoc) => HouseholdDoc) {
	if (!household.doc) return;
	household.doc = change(household.doc);
	save();
	syncPeople();
	if (keys) {
		clearTimeout(pushTimer);
		pushTimer = setTimeout(() => {
			pushTimer = undefined;
			void sync();
		}, PUSH_DELAY_MS);
	}
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

/** Own profile, or one nobody owns (a child without a phone): this phone may change it. */
export const canEdit = (m: Member) => !m.owner || (!!signer && m.owner === signer.pub);

/** Someone else's profile can be removed only once its phone has been silent for long. */
export const canRemove = (m: Member) => canEdit(m) || Date.now() - m.at > STALE_OWNER_MS;

function putMember(member: Member) {
	updateDoc((doc) => ({ ...doc, members: { ...doc.members, [member.id]: member } }));
}

/** Shows the change at once, then replaces it with the signed copy the others will accept. */
async function putSigned(member: Member) {
	putMember(member);
	if (!member.owner || !signer) return;
	const signed = await signMember(member, signer);
	if (household.doc?.members[member.id]?.at === member.at) putMember(signed);
}

/** `undefined` in the change clears that field (`eaten` when sharing stops). */
export function updateMember(
	id: string,
	change: Partial<Omit<Member, 'id' | 'at' | 'owner' | 'sig'>>
) {
	const current = household.doc?.members[id];
	if (!current || !canEdit(current)) return;
	const next: Member = { ...current, ...change, at: Date.now() };
	for (const [key, value] of Object.entries(change)) {
		if (value === undefined) delete next[key as keyof Member];
	}
	void putSigned(next);
}

export function removeMember(id: string) {
	const current = household.doc?.members[id];
	if (!current || !canRemove(current)) return;
	if (canEdit(current)) updateMember(id, { removed: true });
	// A lost phone's profile: the others accept the removal unsigned, and only the removal.
	else putMember({ ...current, removed: true, at: Date.now() });
	if (household.me === id) setMe(null);
}

export function setMe(id: string | null) {
	household.me = id;
	save();
}

/** "This is me": the profile becomes this phone's – the others see it but can't change it. */
export async function claimMember(id: string) {
	const current = household.doc?.members[id];
	if (!current || current.owner) return;
	signer ??= await newSigner();
	setMe(id);
	await putSigned({ ...current, owner: signer.pub, at: Date.now() });
}

/** What this person ate the last days, for the others – or null to stop showing it. */
export function shareEaten(days: EatenDay[] | null) {
	const me = myMember();
	if (!me?.owner || !canEdit(me)) return;
	if (JSON.stringify(me.eaten ?? null) === JSON.stringify(days)) return;
	updateMember(me.id, { eaten: days ?? undefined });
}

// ── Planning for oneself ───────────────────────────────────────

/**
 * The own plan, list and pantry come back on this device; the household's wait in the shared
 * document as they are. `away` also tells the others this person isn't eating at home, from
 * today until `until` (null: until they're back).
 */
export async function startSolo(away: boolean, until: string | null) {
	if (household.solo || !household.doc) return;
	if (keys) await sync();
	const own = personal ?? EMPTY_PERSONAL;
	personal = null;
	household.solo = true;
	putOnDevice(own);
	appliedUpTo = changes.count;
	settings.current = { ...settings.current, people: 1 };
	const me = myMember();
	household.soloAway = away && !!me;
	if (me && away) updateMember(me.id, { away: { from: localToday(), to: until } });
	save();
}

/** Back to the household's plan, list and pantry; the own ones go aside for next time. */
export async function stopSolo() {
	if (!household.solo || !household.doc) return;
	personal = onDevice();
	household.solo = false;
	const me = myMember();
	if (me && household.soloAway) updateMember(me.id, { away: null });
	household.soloAway = false;
	base = viewOf(household.doc);
	applyView(base);
	save();
	if (keys) await sync();
}

// ── Shopping, money, wishes ────────────────────────────────────

/** Who'll buy each shopping list item. */
export function claims(): Map<string, Member> {
	const doc = household.doc;
	if (!doc || household.solo) return new Map();
	const byId = new Map(members().map((m) => [m.id, m]));
	return new Map(
		Object.entries(doc.claims).flatMap(([item, [who]]) => {
			const member = who === false ? undefined : byId.get(who);
			return member ? [[item, member] as const] : [];
		})
	);
}

export function claimItem(itemId: string, mine: boolean) {
	const me = household.me;
	if (!me) return;
	updateDoc((doc) => ({
		...doc,
		claims: { ...doc.claims, [itemId]: [mine ? me : false, Date.now()] }
	}));
}

export function addExpense(expense: Omit<Expense, 'date'> & { date?: string }) {
	if (!(expense.amount > 0)) return;
	const at = Date.now();
	const clean: Expense = {
		...expense,
		amount: Math.round(expense.amount * 100) / 100,
		note: expense.note.trim().slice(0, 60),
		date: expense.date ?? localToday()
	};
	updateDoc((doc) =>
		withEvents(
			{ ...doc, expenses: { ...doc.expenses, [logId(at)]: [clean, at] } },
			clean.to ? [] : [{ at, who: clean.by, kind: 'expense', n: clean.amount }]
		)
	);
}

export function removeExpense(id: string) {
	updateDoc((doc) => ({ ...doc, expenses: { ...doc.expenses, [id]: [false, Date.now()] } }));
}

export const moneyOn = () => !!household.doc?.money[0];

export function setMoney(on: boolean) {
	updateDoc((doc) => ({ ...doc, money: [on, Date.now()] }));
}

/** With money tracking on, a shopping trip paid from this phone is this person's expense. */
export function notePurchase(amount: number) {
	if (household.solo || !household.me || !moneyOn() || !(amount > 0)) return;
	addExpense({ by: household.me, amount, note: 'Nákup' });
}

export function toggleWish(recipeId: string) {
	const me = household.me;
	if (!me || !household.doc) return;
	const key = wishKey(me, recipeId);
	const wanted = household.doc.wishes[key]?.[0] ?? false;
	updateDoc((doc) => ({ ...doc, wishes: { ...doc.wishes, [key]: [!wanted, Date.now()] } }));
}
