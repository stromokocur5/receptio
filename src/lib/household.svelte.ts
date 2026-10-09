import {
	EMPTY_BODY,
	MAX_MEMBERS,
	STALE_OWNER_MS,
	acceptMember,
	activeMembers,
	changeEvents,
	collect,
	FORGET_AFTER_MS,
	latestStamp,
	householdNeeds,
	isAway,
	logId,
	mergeDocs,
	newDoc,
	planIdsFor,
	SUM_UP_AFTER_MS,
	sumUpOldExpenses,
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
import {
	canonical,
	newInbox,
	newSigner,
	openSealed,
	seal,
	signMember,
	verifyMember,
	type KeyPair,
	type Sealed,
	type Signer
} from './member-keys';
import type { Pantry } from './pantry';
import type { PlanEntry } from './shopping';
import {
	changes,
	checkedItems,
	extraItems,
	gardens,
	keptAside,
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
/** A phone whose clock runs further ahead than this doesn't drag everyone's times with it. */
const MAX_AHEAD_MS = 24 * 60 * 60 * 1000;

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
	/** This phone among the household's, for its own pantry changes. */
	phone: string;
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
let phone = newPhoneId();
let timer: ReturnType<typeof setTimeout> | undefined;
let pushTimer: ReturnType<typeof setTimeout> | undefined;
let running: Promise<void> | null = null;
let seenRestores = 0;
/** Changes up to this count came from the household itself – nothing new to share. */
let appliedUpTo = 0;
/** Told to the others with the next sync. */
let pendingEvents: LogEvent[] = [];
const cookedSinceSync = new Set<string>();
/** The newest time this phone has seen or given out. */
let lastStamp = 0;

/**
 * When a change happened, for "the newer one wins": the clock, but always after everything this
 * phone has seen – a phone whose clock runs behind still wins with a change made after the
 * others', and two changes here never share a time.
 */
function stamp(): number {
	lastStamp = Math.max(Date.now(), lastStamp + 1);
	return lastStamp;
}

/** Keeps the household's document and notes its newest time for `stamp`. */
function setDoc(doc: HouseholdDoc) {
	household.doc = doc;
	lastStamp = Math.max(lastStamp, latestStamp(doc, Date.now() + MAX_AHEAD_MS));
}

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
	// Shared ones never fall off the end: a garden missing here would read as "stop sharing it".
	gardens.current = [...kept, ...shared.filter((g) => !known.has(g.id))];
}

/** Starts growing a garden together: the others get it with its diary on their next sync. */
export function shareGarden(id: string) {
	const garden = gardens.current.find((g) => g.id === id);
	if (!garden || !household.doc) return;
	const shared = Object.values(household.doc.gardens).filter(([g]) => g !== false).length;
	if (shared >= MAX_GARDENS) return;
	updateDoc((doc) =>
		withLocalChanges(
			doc,
			{ ...viewOf(doc), gardens: [] },
			{ ...viewOf(doc), gardens: [garden] },
			stamp()
		)
	);
}

/** Stops sharing; everyone keeps a copy of it as their own. */
export function unshareGarden(id: string) {
	updateDoc((doc) => ({ ...doc, gardens: { ...doc.gardens, [id]: [false, stamp()] } }));
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
				signer,
				phone
			} satisfies Saved)
		);
	} catch {
		// Works for this session; the next visit asks for the link again.
	}
}

/** `ifVersion`: write only over the copy this phone merged with; creating a new copy has none. */
async function upload(k: SyncKeys, doc: HouseholdDoc | Forward, ifVersion?: number) {
	await request(k, 'PUT', {
		token: k.token,
		data: await encrypt(k.key, JSON.stringify(doc)),
		...(ifVersion !== undefined && { ifVersion })
	});
}

/** What stays under a changed link: the new one, sealed for each phone that stays. */
interface Forward {
	moved: Sealed;
}

/** The household moved to a new link. */
class Moved extends Error {
	constructor(readonly sealed: Sealed) {
		super('moved');
	}
}

const BOX_RE = /^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{20,200}$/;

function validateSealed(raw: unknown): Sealed | null {
	if (typeof raw !== 'object' || raw === null) return null;
	const r = raw as Record<string, unknown>;
	if (typeof r.from !== 'string' || !/^[A-Za-z0-9_-]{80,100}$/.test(r.from)) return null;
	if (typeof r.boxes !== 'object' || r.boxes === null) return null;
	const boxes = Object.entries(r.boxes)
		.filter((e): e is [string, string] => typeof e[1] === 'string' && BOX_RE.test(e[1]))
		.slice(0, MAX_MEMBERS);
	return { from: r.from, boxes: Object.fromEntries(boxes) };
}

interface Remote {
	doc: HouseholdDoc;
	/** Absent until the server has the version column. */
	version?: number;
}

async function fetchDoc(k: SyncKeys): Promise<Remote> {
	const remote = await request(k, 'GET');
	const raw = JSON.parse(await decrypt(k.key, remote.data as string));
	const moved = raw && typeof raw === 'object' && 'moved' in raw && validateSealed(raw.moved);
	if (moved) throw new Moved(moved);
	const doc = validateDoc(raw);
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
		// Older, or the very same profile: the merge keeps this phone's copy anyway.
		if (
			mine &&
			(theirs.at < mine.at || (theirs.at === mine.at && canonical(theirs) === canonical(mine)))
		)
			continue;
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
		const fresh = await trusted(remote.doc, household.doc);
		const now = Date.now();
		const doc = sumUpOldExpenses(
			collect(mergeDocs(fresh, local()), now - FORGET_AFTER_MS),
			now - SUM_UP_AFTER_MS
		);
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

/**
 * Writes what changed on this device since the last time into the household's document here,
 * before anything goes over the network: offline, or when switching to planning alone right
 * after, the change is already part of the document and goes out with the next sync.
 */
function commitLocal() {
	if (!household.doc || !base) return;
	// Another device's backup replaced the data here: that isn't an edit to share.
	if (restores.count !== seenRestores) {
		seenRestores = restores.count;
		const restored = currentView();
		base = { ...restored, planIds: planIdsFor(withIds(viewOf(household.doc)), restored.plan) };
	}
	const view = sharedView();
	view.planIds = planIdsFor(withIds(base), view.plan);
	const events = [
		...pendingEvents,
		...changeEvents(base, view, household.me, Date.now(), cookedSinceSync)
	];
	pendingEvents = [];
	cookedSinceSync.clear();
	const doc = withEvents(withLocalChanges(household.doc, base, view, stamp(), phone), events);
	if (!same(doc, household.doc)) {
		setDoc(doc);
		save();
	}
	base = view;
}

const withIds = (view: SharedView) => ({ plan: view.plan, planIds: view.planIds ?? [] });

async function syncOnce() {
	if (!keys || !household.doc || !base) return;
	try {
		commitLocal();
		const remote = await fetchDoc(keys);
		// Each round takes what changed here since the last one – also while an upload was waiting.
		await mergeAndUpload(
			keys,
			remote,
			() => {
				commitLocal();
				return household.doc!;
			},
			(doc) => {
				setDoc(doc);
				base = viewOf(doc);
				applyView(base);
			}
		);
		household.status = 'live';
		household.syncedAt = Date.now();
		save();
	} catch (err) {
		const status = err instanceof Error && 'status' in err ? Number(err.status) : 0;
		household.status = status === 404 || err instanceof Moved ? 'missing' : 'offline';
		if (err instanceof Moved) void follow(err.sealed);
	}
}

/** Someone changed the link: this phone's profile got the new one, sealed for its inbox key. */
async function follow(sealed: Sealed) {
	const me = household.me;
	const inbox = signer?.inbox;
	const code = me && inbox && normalizeCode((await openSealed(sealed, me, inbox)) ?? '');
	if (!code || code === household.code) return;
	household.code = code;
	household.status = 'connecting';
	save();
	await start(code);
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
		// Another sync may have finished meanwhile and set its own: only one poll waits.
		clearTimeout(timer);
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

/** Backups hold the own plan, list and pantry; restoring one puts them aside again. */
function keepAsideForBackups() {
	keptAside.read = () =>
		household.code && !household.solo && personal
			? {
					plan: personal.plan,
					checkedItems: personal.checked,
					extraItems: personal.extras,
					pantry: personal.pantry,
					pantryAdded: personal.added
				}
			: null;
	keptAside.write = (parts) => {
		if (!household.code || household.solo || !personal) return false;
		personal = {
			plan: parts.plan ?? personal.plan,
			checked: parts.checkedItems ?? personal.checked,
			extras: parts.extraItems ?? personal.extras,
			pantry: parts.pantry ?? personal.pantry,
			added: parts.pantryAdded ?? personal.added
		};
		save();
		return true;
	};
}

/** Once, from the root layout after local data is loaded. */
export function initHousehold() {
	keepAsideForBackups();
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
				signer: validateSigner(raw.signer),
				phone:
					typeof raw.phone === 'string' && /^[a-z0-9]{1,16}$/.test(raw.phone)
						? raw.phone
						: newPhoneId()
			};
		}
	} catch {
		saved = null;
	}
	if (!saved) return;
	household.code = saved.code;
	household.me = saved.me;
	setDoc(saved.doc);
	household.solo = saved.solo;
	household.soloAway = saved.soloAway;
	personal = saved.personal;
	signer = saved.signer;
	phone = saved.phone;
	household.status = 'connecting';
	base = viewOf(saved.doc);
	void start(saved.code).then(async () => {
		const me = myMember();
		// Picked "this is me" before profiles had owners: make it theirs now.
		if (me && !me.owner) return claimMember(me.id);
		// Owned before profiles carried an inbox: without one a changed link can't find this phone.
		if (me && signer && canEdit(me) && (!signer.inbox || me.inbox !== signer.inbox.pub)) {
			signer.inbox ??= await newInbox();
			save();
			await putSigned({ ...me, at: stamp() });
		}
	});
}

function validateKeyPair(raw: unknown): KeyPair | null {
	if (typeof raw !== 'object' || raw === null) return null;
	const r = raw as Record<string, unknown>;
	return typeof r.pub === 'string' && typeof r.jwk === 'object' && r.jwk !== null
		? { pub: r.pub, jwk: r.jwk as JsonWebKey }
		: null;
}

function validateSigner(raw: unknown): Signer | null {
	const pair = validateKeyPair(raw);
	if (!pair) return null;
	const inbox = validateKeyPair((raw as Record<string, unknown>).inbox);
	return inbox ? { ...pair, inbox } : pair;
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
function newPhoneId() {
	return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

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
	const now = stamp();
	const code = generateCode();
	let doc = newDoc(name, now);
	if (myName.trim()) await ownSigner();
	const me = myName.trim() && signer ? await signMember(blankMember(myName, now), signer) : null;
	if (me) doc = { ...doc, members: { [me.id]: me } };
	await upload(await deriveKeys(code), doc);
	household.code = code;
	household.me = me?.id ?? null;
	setDoc(doc);
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
		if (err instanceof Moved)
			return 'Tento odkaz už vymenili – popros niekoho z domácnosti o nový.';
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
	setDoc(remote);
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
	commitLocal();
	if (k && me && household.doc?.members[me]) {
		const doc = household.doc;
		const gone = { ...doc.members[me], removed: true, at: stamp() };
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

/** Phones that find a changed link on their own: whose own profile carries their inbox key. */
export const followsLink = (m: Member) => !m.removed && !!m.owner && !!m.inbox;

/**
 * A new link for the same household: the data moves to a new code, and the old one keeps only
 * the new code sealed for the profiles still here – their phones move over by themselves, while
 * someone removed (or anyone else holding the old link) finds nothing they can open. Others,
 * like profiles nobody owns yet, need the new link sent.
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
	// Profiles here were checked against their signatures when they came in.
	const stays = Object.values(household.doc.members).filter(followsLink);
	const forward = {
		moved: await seal(code, Object.fromEntries(stays.map((m) => [m.id, m.inbox!])))
	};
	for (let attempt = 0; ; attempt++) {
		const remote = await fetchDoc(old);
		commitLocal();
		const doc = mergeDocs(await trusted(remote.doc, household.doc), household.doc);
		setDoc(doc);
		await upload(next, doc);
		try {
			// Over exactly the copy just merged, so no one's last change stays behind.
			await upload(old, forward, remote.version);
			break;
		} catch (err) {
			if (!isConflict(err) || attempt >= MAX_RETRIES) throw err;
		}
	}
	household.code = code;
	save();
	await start(code);
	return code;
}

function updateDoc(change: (doc: HouseholdDoc) => HouseholdDoc) {
	if (!household.doc) return;
	setDoc(change(household.doc));
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
	if (clean) updateDoc((doc) => ({ ...doc, name: [clean, stamp()] }));
}

export function addMember(name: string): Member | null {
	if (!name.trim() || members().length >= MAX_MEMBERS) return null;
	const member = blankMember(name, stamp());
	updateDoc((doc) => ({ ...doc, members: { ...doc.members, [member.id]: member } }));
	return member;
}

/** This phone's keys, made the first time it owns a profile; older ones get their inbox. */
async function ownSigner(): Promise<Signer> {
	signer ??= await newSigner();
	signer.inbox ??= await newInbox();
	return signer;
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
	change: Partial<Omit<Member, 'id' | 'at' | 'owner' | 'sig' | 'inbox'>>
) {
	const current = household.doc?.members[id];
	if (!current || !canEdit(current)) return;
	const next: Member = { ...current, ...change, at: stamp() };
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
	else putMember({ ...current, removed: true, at: stamp() });
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
	const own = await ownSigner();
	setMe(id);
	await putSigned({ ...current, owner: own.pub, at: stamp() });
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
	// The last changes to the household's plan are kept even when the sync below can't run.
	commitLocal();
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
		claims: { ...doc.claims, [itemId]: [mine ? me : false, stamp()] }
	}));
}

export function addExpense(expense: Omit<Expense, 'date'> & { date?: string }) {
	if (!(expense.amount > 0)) return;
	const at = stamp();
	const date = expense.date ?? localToday();
	// Shared by whoever was home that day, unless said otherwise; a payback is between two.
	const home = members().filter((m) => !isAway(m, date));
	const shares = expense.for ?? (home.length ? home : members()).map((m) => m.id);
	const clean: Expense = {
		...expense,
		amount: Math.round(expense.amount * 100) / 100,
		note: expense.note.trim().slice(0, 60),
		date,
		...(!expense.to && shares.length && { for: shares })
	};
	updateDoc((doc) =>
		withEvents(
			{ ...doc, expenses: { ...doc.expenses, [logId(at)]: [clean, at] } },
			clean.to ? [] : [{ at, who: clean.by, kind: 'expense', n: clean.amount }]
		)
	);
}

export function removeExpense(id: string) {
	updateDoc((doc) => ({ ...doc, expenses: { ...doc.expenses, [id]: [false, stamp()] } }));
}

export const moneyOn = () => !!household.doc?.money[0];

export function setMoney(on: boolean) {
	updateDoc((doc) => ({ ...doc, money: [on, stamp()] }));
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
	updateDoc((doc) => ({ ...doc, wishes: { ...doc.wishes, [key]: [!wanted, stamp()] } }));
}
