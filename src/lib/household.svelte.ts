import {
	EMPTY_BODY,
	MAX_MEMBERS,
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
	type Expense,
	type HouseholdDoc,
	type HouseholdNeeds,
	type LogEvent,
	type Member,
	type PlanMeal,
	type SharedView
} from './household';
import { localToday, shiftDate } from './journal';
import type { PlanEntry } from './shopping';
import {
	changes,
	checkedItems,
	extraItems,
	mainMeals,
	pantry,
	plan,
	settings,
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
 * "Planning alone" (on holiday, a week of lunches at work) gives this device its own plan and
 * shopping list for a while; the pantry stays shared and the household's plan waits in the
 * document until they're back.
 */

export const HOUSEHOLD_PREFIX = 'd=';
const STORAGE_KEY = 'receptio:household';
/** Visible tab only; a few phones on one home connection plus the live list stay under 60 a minute. */
const POLL_MS = 15_000;
const PUSH_DELAY_MS = 1500;

/** One person's own plan and list, kept aside while they plan with the household. */
interface PersonalPlan {
	plan: PlanEntry[];
	checked: Record<string, boolean>;
	extras: ExtraItem[];
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
	personal: PersonalPlan | null;
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

function currentView(): SharedView {
	return {
		plan: plan.current,
		pantry: pantry.current,
		checked: checkedItems.current,
		extras: extraItems.current
	};
}

/** What this device shares: alone, only the pantry – the plan and list are its own. */
function sharedView(): SharedView {
	if (!household.solo || !base) return currentView();
	return { ...base, pantry: pantry.current };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function applyView(view: SharedView) {
	const now = currentView();
	if (!household.solo) {
		if (!same(now.plan, view.plan)) plan.current = view.plan;
		if (!same(now.checked, view.checked)) checkedItems.current = view.checked;
		if (!same(now.extras, view.extras)) extraItems.current = view.extras;
	}
	if (!same(now.pantry, view.pantry)) pantry.current = view.pantry;
	syncPeople();
	appliedUpTo = changes.count;
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
				personal
			} satisfies Saved)
		);
	} catch {
		// Works for this session; the next visit asks for the link again.
	}
}

async function upload(k: SyncKeys, doc: HouseholdDoc) {
	await request(k, 'PUT', { token: k.token, data: await encrypt(k.key, JSON.stringify(doc)) });
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
		const now = Date.now();
		const view = sharedView();
		const events = [
			...pendingEvents,
			...changeEvents(base, view, household.me, now, cookedSinceSync)
		];
		const local = withEvents(withLocalChanges(household.doc, base, view, now), events);
		pendingEvents = [];
		cookedSinceSync.clear();
		const merged = mergeDocs(remote, local);
		household.doc = merged;
		base = viewOf(merged);
		applyView(base);
		if (!same(merged, remote)) await upload(keys, merged);
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
				personal: validatePersonal(raw.personal)
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
	household.status = 'connecting';
	base = viewOf(saved.doc);
	void start(saved.code);
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
			: []
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

/** Starts a household from what this device already has (plan, pantry, list) and returns its code. */
export async function createHousehold(name: string, myName: string): Promise<string> {
	const now = Date.now();
	const code = generateCode();
	let doc = withLocalChanges(newDoc(name, now), viewOf(newDoc('', 0)), currentView(), now);
	const me = myName.trim() ? blankMember(myName, now) : null;
	if (me) doc = { ...doc, members: { [me.id]: me } };
	await upload(await deriveKeys(code), doc);
	household.code = code;
	household.me = me?.id ?? null;
	household.doc = doc;
	household.solo = false;
	household.soloAway = false;
	personal = null;
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
	const before = household.status;
	household.status = 'connecting';
	let remote: HouseholdDoc;
	try {
		remote = await fetchDoc(await deriveKeys(code));
	} catch (err) {
		household.status = household.code ? before : 'off';
		if (err instanceof Error && 'status' in err && err.status === 404) {
			return 'Táto domácnosť už neexistuje.';
		}
		return 'Nepodarilo sa spojiť so serverom.';
	}
	// A new link to the same household (after it was changed) keeps who this phone is.
	const sameHousehold = household.doc && household.me && remote.members[household.me];
	if (household.solo) await stopSolo(false);
	const shared = viewOf(remote);
	const ownPantry = Object.fromEntries(
		Object.entries(pantry.current).filter(([id]) => !(id in shared.pantry))
	);
	household.code = code;
	household.me = sameHousehold ? household.me : null;
	household.doc = remote;
	household.solo = false;
	household.soloAway = false;
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
			await upload(k, mergeDocs(await fetchDoc(k), left));
		} catch {
			// The others still see this person; they can remove them by hand.
		}
	}
	stop();
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

// ── Planning alone ─────────────────────────────────────────────

/**
 * This device gets its own plan and shopping list (the one from last time, or empty); the
 * household's wait in the shared document. `away` also tells the others this person isn't
 * eating at home, from today until `until` (null: until they're back).
 */
export async function startSolo(away: boolean, until: string | null) {
	if (household.solo || !household.doc) return;
	if (keys) await sync();
	const own = personal ?? { plan: [], checked: {}, extras: [] };
	personal = null;
	household.solo = true;
	plan.current = own.plan;
	checkedItems.current = own.checked;
	extraItems.current = own.extras;
	appliedUpTo = changes.count;
	settings.current = { ...settings.current, people: 1 };
	const me = myMember();
	household.soloAway = away && !!me;
	if (me && away) updateMember(me.id, { away: { from: localToday(), to: until } });
	save();
}

/** Back to the household's plan and list; this person's own are kept for next time. */
export async function stopSolo(resync = true) {
	if (!household.solo || !household.doc) return;
	// The pantry changed while alone is shared first, or the household's copy would undo it.
	if (resync && keys) await sync();
	personal = {
		plan: plan.current,
		checked: checkedItems.current,
		extras: extraItems.current
	};
	household.solo = false;
	const me = myMember();
	if (me && household.soloAway) updateMember(me.id, { away: null });
	household.soloAway = false;
	base = viewOf(household.doc);
	applyView(base);
	save();
	if (resync && keys) await sync();
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
