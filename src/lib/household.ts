import { ACTIVITY_PROTEIN, type Activity } from './nutrition';
import type { PlanEntry } from './shopping';
import { ALLERGENS, type Allergen, type Ingredient, type RecipeSummary } from './types';

/**
 * A household: people who cook and shop together share one plan, shopping list and pantry, and
 * every member says what they can't or won't eat. The whole document is encrypted on the device
 * (it rides on the sync storage, see household.svelte.ts); the server never reads it.
 *
 * Everyone edits at once, so every value carries the time it was changed and two copies merge by
 * keeping the newer value per item – a tick on one phone and a new pantry item on another both
 * survive. The plan is one value: plans are rarely edited by two people in the same minute.
 */

/** A value and when it was set (ms). */
export type Stamped<T> = [value: T, at: number];

/** The meals the plan can cook. */
export type PlanMeal = 'ranajky' | 'obed' | 'vecera';
export const PLAN_MEALS: PlanMeal[] = ['ranajky', 'obed', 'vecera'];

export type BodyGoal = 'udrzat' | 'schudnut' | 'pribrat';
export const BODY_GOAL_LABELS: Record<BodyGoal, string> = {
	udrzat: 'Udržať váhu',
	schudnut: 'Schudnúť',
	pribrat: 'Pribrať'
};

/** Optional; everyone in the household sees it. */
export interface Body {
	heightCm: number | null;
	weightKg: number | null;
	age: number | null;
	sex: 'm' | 'f' | null;
	activity: Activity;
	goal: BodyGoal;
}

export const EMPTY_BODY: Body = {
	heightCm: null,
	weightKg: null,
	age: null,
	sex: null,
	activity: 'bezne',
	goal: 'udrzat'
};

export interface Member {
	id: string;
	name: string;
	allergens: Allergen[];
	/** Ingredient ids they don't eat. */
	avoid: string[];
	/** No spicy food (children, sensitive stomachs). */
	mild: boolean;
	glutenFree: boolean;
	/** Which planned meals they eat at home. */
	meals: Record<PlanMeal, boolean>;
	/** Portion size against an adult's (1); null = from the body data, or 1 without it. */
	portion: number | null;
	body: Body;
	/** Not eating at home on these days (ISO dates, inclusive; `to` null = until they're back). */
	away: { from: string; to: string | null } | null;
	/** Removed members stay as a tombstone so the removal wins over older copies. */
	removed: boolean;
	at: number;
}

/** Money one member put into the household, or a payback from one member to another. */
export interface Expense {
	by: string;
	amount: number;
	date: string;
	note: string;
	/** A payback: `by` gave the money to this member. */
	to?: string;
}

export type LogKind = 'plan-add' | 'plan-remove' | 'bought' | 'pantry' | 'expense' | 'cooked';

/** One line of "who did what" for the others. `ref` is a recipe id, `n` a count or an amount. */
export interface LogEvent {
	at: number;
	who: string | null;
	kind: LogKind;
	ref?: string;
	n?: number;
}

export interface HouseholdDoc {
	v: 1;
	name: Stamped<string>;
	members: Record<string, Member>;
	plan: Stamped<PlanEntry[]>;
	/** Ingredient → grams (null: some, amount unknown), or false when taken out. */
	pantry: Record<string, Stamped<number | null | false>>;
	/** Shopping list ticks. */
	checked: Record<string, Stamped<boolean>>;
	/** Hand-added list items, false when deleted. */
	extras: Record<string, Stamped<{ text: string; checked: boolean } | false>>;
	/** Shopping list item → the member who'll buy it. */
	claims: Record<string, Stamped<string | false>>;
	expenses: Record<string, Stamped<Expense | false>>;
	/** Recent changes, newest kept. Events never change, so a merge is a union. */
	log: Record<string, LogEvent>;
	/** `member.recipe` → that member would like it cooked. */
	wishes: Record<string, Stamped<boolean>>;
}

/** The shared parts of one device's data, as the rest of the app keeps them. */
export interface SharedView {
	plan: PlanEntry[];
	pantry: Record<string, number | null>;
	checked: Record<string, boolean>;
	extras: { id: string; text: string; checked: boolean }[];
}

export const MAX_MEMBERS = 12;
const MAX_NAME = 40;
const MAX_ITEMS = 400;
/** The sync storage holds 400 kB; old money and history go first. */
export const MAX_EXPENSES = 200;
export const MAX_LOG = 80;
const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MEMBER_ID_RE = /^[a-z0-9]{1,16}$/;
const ITEM_ID_RE = /^[a-zA-Z0-9-]{1,40}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LOG_KINDS: LogKind[] = ['plan-add', 'plan-remove', 'bought', 'pantry', 'expense', 'cooked'];

export function newDoc(name: string, now: number): HouseholdDoc {
	return {
		v: 1,
		name: [name.trim().slice(0, MAX_NAME) || 'Domácnosť', now],
		members: {},
		plan: [[], 0],
		pantry: {},
		checked: {},
		extras: {},
		claims: {},
		expenses: {},
		log: {},
		wishes: {}
	};
}

// ── Validation (the stored document is untrusted) ──────────────

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);
const isTime = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

function stamped<T>(raw: unknown, value: (v: unknown) => T | undefined): Stamped<T> | undefined {
	if (!Array.isArray(raw) || raw.length !== 2 || !isTime(raw[1])) return undefined;
	const v = value(raw[0]);
	return v === undefined ? undefined : [v, raw[1]];
}

function record<T>(raw: unknown, key: RegExp, value: (v: unknown) => T | undefined) {
	if (!isRecord(raw)) return {};
	return Object.fromEntries(
		Object.entries(raw)
			.slice(0, MAX_ITEMS)
			.flatMap(([k, v]) => {
				const item = key.test(k) ? value(v) : undefined;
				return item === undefined ? [] : [[k, item] as const];
			})
	);
}

function validateMember(raw: unknown): Member | undefined {
	if (!isRecord(raw) || typeof raw.id !== 'string' || !MEMBER_ID_RE.test(raw.id)) return undefined;
	if (typeof raw.name !== 'string' || !isTime(raw.at)) return undefined;
	const name = raw.name.trim().slice(0, MAX_NAME);
	if (!name) return undefined;
	return {
		id: raw.id,
		name,
		allergens: Array.isArray(raw.allergens)
			? [...new Set(raw.allergens.filter((a): a is Allergen => ALLERGENS.includes(a as Allergen)))]
			: [],
		avoid: Array.isArray(raw.avoid)
			? [
					...new Set(raw.avoid.filter((a): a is string => typeof a === 'string' && ID_RE.test(a)))
				].slice(0, 100)
			: [],
		mild: raw.mild === true,
		glutenFree: raw.glutenFree === true,
		meals: validateMemberMeals(raw.meals),
		portion:
			typeof raw.portion === 'number' && raw.portion >= 0.25 && raw.portion <= 2.5
				? raw.portion
				: null,
		body: validateBody(raw.body),
		away: validateAway(raw.away),
		removed: raw.removed === true,
		at: raw.at
	};
}

function validateMemberMeals(raw: unknown): Record<PlanMeal, boolean> {
	const meals = Object.fromEntries(
		PLAN_MEALS.map((m) => [m, !isRecord(raw) || raw[m] !== false])
	) as Record<PlanMeal, boolean>;
	return PLAN_MEALS.some((m) => meals[m]) ? meals : { ranajky: true, obed: true, vecera: true };
}

function validateBody(raw: unknown): Body {
	if (!isRecord(raw)) return EMPTY_BODY;
	const num = (v: unknown, min: number, max: number) =>
		typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? Math.round(v) : null;
	return {
		heightCm: num(raw.heightCm, 50, 250),
		weightKg: num(raw.weightKg, 10, 250),
		age: num(raw.age, 1, 110),
		sex: raw.sex === 'm' || raw.sex === 'f' ? raw.sex : null,
		activity:
			typeof raw.activity === 'string' && raw.activity in ACTIVITY_PROTEIN
				? (raw.activity as Activity)
				: 'bezne',
		goal: raw.goal === 'schudnut' || raw.goal === 'pribrat' ? raw.goal : 'udrzat'
	};
}

function validateAway(raw: unknown): Member['away'] {
	if (!isRecord(raw) || typeof raw.from !== 'string' || !DATE_RE.test(raw.from)) return null;
	const to =
		typeof raw.to === 'string' && DATE_RE.test(raw.to) && raw.to >= raw.from ? raw.to : null;
	return { from: raw.from, to };
}

function validateExpense(raw: unknown): Expense | undefined {
	if (!isRecord(raw) || typeof raw.by !== 'string' || !MEMBER_ID_RE.test(raw.by)) return undefined;
	if (typeof raw.amount !== 'number' || !(raw.amount > 0) || raw.amount > 10_000) return undefined;
	if (typeof raw.date !== 'string' || !DATE_RE.test(raw.date)) return undefined;
	const expense: Expense = {
		by: raw.by,
		amount: Math.round(raw.amount * 100) / 100,
		date: raw.date,
		note: typeof raw.note === 'string' ? raw.note.trim().slice(0, 60) : ''
	};
	if (typeof raw.to === 'string' && MEMBER_ID_RE.test(raw.to) && raw.to !== raw.by) {
		expense.to = raw.to;
	}
	return expense;
}

function validateLogEvent(raw: unknown): LogEvent | undefined {
	if (!isRecord(raw) || !isTime(raw.at) || !LOG_KINDS.includes(raw.kind as LogKind))
		return undefined;
	const event: LogEvent = {
		at: raw.at,
		who: typeof raw.who === 'string' && MEMBER_ID_RE.test(raw.who) ? raw.who : null,
		kind: raw.kind as LogKind
	};
	if (typeof raw.ref === 'string' && ID_RE.test(raw.ref) && raw.ref.length <= 80)
		event.ref = raw.ref;
	if (typeof raw.n === 'number' && Number.isFinite(raw.n) && raw.n >= 0 && raw.n <= 100_000) {
		event.n = raw.n;
	}
	return event;
}

export function validatePlanEntries(raw: unknown): PlanEntry[] | undefined {
	if (!Array.isArray(raw)) return undefined;
	return raw.slice(0, 100).flatMap((e): PlanEntry[] => {
		if (!isRecord(e) || typeof e.recipeId !== 'string' || !ID_RE.test(e.recipeId)) return [];
		if (typeof e.servings !== 'number' || !(e.servings > 0) || e.servings > 100) return [];
		const entry: PlanEntry = { recipeId: e.recipeId, servings: e.servings };
		if (typeof e.variant === 'string' && e.variant.length <= 80) entry.variant = e.variant;
		if (typeof e.breakfast === 'boolean') entry.breakfast = e.breakfast;
		if (
			typeof e.freezeExtra === 'number' &&
			Number.isInteger(e.freezeExtra) &&
			e.freezeExtra > 0 &&
			e.freezeExtra < e.servings
		) {
			entry.freezeExtra = e.freezeExtra;
		}
		if (e.fromFreezer === true) entry.fromFreezer = true;
		if (typeof e.frozenOn === 'string' && DATE_RE.test(e.frozenOn)) {
			entry.frozenOn = e.frozenOn;
		}
		if (typeof e.cook === 'string' && MEMBER_ID_RE.test(e.cook)) entry.cook = e.cook;
		return [entry];
	});
}

export function validateDoc(raw: unknown): HouseholdDoc | null {
	if (!isRecord(raw) || raw.v !== 1) return null;
	const name = stamped(raw.name, (v) =>
		typeof v === 'string' && v.trim() ? v.trim().slice(0, MAX_NAME) : undefined
	);
	const plan = stamped(raw.plan, validatePlanEntries);
	if (!name || !plan) return null;
	const members = record(raw.members, MEMBER_ID_RE, validateMember);
	return {
		v: 1,
		name,
		members: Object.fromEntries(
			Object.values(members)
				.slice(0, MAX_MEMBERS * 2)
				.map((m) => [m.id, m])
		),
		plan,
		pantry: record(raw.pantry, ID_RE, (v) =>
			stamped(v, (x) =>
				x === false || x === null || (typeof x === 'number' && x >= 0 && x <= 100_000)
					? (x as number | null | false)
					: undefined
			)
		),
		checked: record(raw.checked, ID_RE, (v) =>
			stamped(v, (x) => (typeof x === 'boolean' ? x : undefined))
		),
		extras: record(raw.extras, ITEM_ID_RE, (v) =>
			stamped(v, (x) =>
				x === false
					? false
					: isRecord(x) &&
						  typeof x.text === 'string' &&
						  x.text.trim() &&
						  x.text.length <= 80 &&
						  typeof x.checked === 'boolean'
						? { text: x.text, checked: x.checked }
						: undefined
			)
		),
		claims: record(raw.claims, ITEM_ID_RE, (v) =>
			stamped(v, (x) =>
				x === false || (typeof x === 'string' && MEMBER_ID_RE.test(x))
					? (x as string | false)
					: undefined
			)
		),
		expenses: newest(
			record(raw.expenses, ITEM_ID_RE, (v) =>
				stamped(v, (x) => (x === false ? false : validateExpense(x)))
			),
			MAX_EXPENSES,
			(e) => e[1]
		),
		log: newest(record(raw.log, ITEM_ID_RE, validateLogEvent), MAX_LOG, (e) => e.at),
		wishes: record(raw.wishes, /^[a-z0-9]{1,16}\.[a-z0-9]+(-[a-z0-9]+)*$/, (v) =>
			stamped(v, (x) => (typeof x === 'boolean' ? x : undefined))
		)
	};
}

/** The `max` newest entries of a record. */
function newest<T>(items: Record<string, T>, max: number, at: (item: T) => number) {
	const entries = Object.entries(items);
	if (entries.length <= max) return items;
	return Object.fromEntries(entries.sort((a, b) => at(b[1]) - at(a[1])).slice(0, max));
}

// ── Merging ────────────────────────────────────────────────────

const newer = <T>(a: Stamped<T> | undefined, b: Stamped<T> | undefined) =>
	!a ? b! : !b ? a : b[1] > a[1] ? b : a;

function mergeRecord<T>(a: Record<string, Stamped<T>>, b: Record<string, Stamped<T>>) {
	const out: Record<string, Stamped<T>> = { ...a };
	for (const [k, v] of Object.entries(b)) out[k] = newer(out[k], v);
	return out;
}

/** Both copies' changes, the newer one per item. Order doesn't matter: merge(a, b) = merge(b, a). */
export function mergeDocs(a: HouseholdDoc, b: HouseholdDoc): HouseholdDoc {
	const members = { ...a.members };
	for (const m of Object.values(b.members)) {
		if (!members[m.id] || m.at > members[m.id].at) members[m.id] = m;
	}
	return {
		v: 1,
		name: newer(a.name, b.name),
		members,
		plan: newer(a.plan, b.plan),
		pantry: mergeRecord(a.pantry, b.pantry),
		checked: mergeRecord(a.checked, b.checked),
		extras: mergeRecord(a.extras, b.extras),
		claims: mergeRecord(a.claims, b.claims),
		expenses: newest(mergeRecord(a.expenses, b.expenses), MAX_EXPENSES, (e) => e[1]),
		log: newest({ ...a.log, ...b.log }, MAX_LOG, (e) => e.at),
		wishes: mergeRecord(a.wishes, b.wishes)
	};
}

/** What the household document means for one device's plan, pantry and list. */
export function viewOf(doc: HouseholdDoc): SharedView {
	return {
		plan: doc.plan[0],
		pantry: Object.fromEntries(
			Object.entries(doc.pantry).flatMap(([id, [v]]) => (v === false ? [] : [[id, v]]))
		),
		checked: Object.fromEntries(
			Object.entries(doc.checked).flatMap(([id, [v]]) => (v ? [[id, true]] : []))
		),
		extras: Object.entries(doc.extras).flatMap(([id, [v]]) =>
			v === false ? [] : [{ id, text: v.text, checked: v.checked }]
		)
	};
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Stamps what changed on this device since the last sync (`before` → `now`) into the document,
 * so a merge carries this device's edits and keeps everyone else's.
 */
export function withLocalChanges(
	doc: HouseholdDoc,
	before: SharedView,
	current: SharedView,
	at: number
): HouseholdDoc {
	const next: HouseholdDoc = {
		...doc,
		pantry: { ...doc.pantry },
		checked: { ...doc.checked },
		extras: { ...doc.extras }
	};
	if (!same(before.plan, current.plan)) next.plan = [current.plan, at];
	for (const id of new Set([...Object.keys(before.pantry), ...Object.keys(current.pantry)])) {
		const had = id in before.pantry;
		const has = id in current.pantry;
		if (has && (!had || before.pantry[id] !== current.pantry[id])) {
			next.pantry[id] = [current.pantry[id], at];
		} else if (had && !has) next.pantry[id] = [false, at];
	}
	for (const id of new Set([...Object.keys(before.checked), ...Object.keys(current.checked)])) {
		if (!!before.checked[id] !== !!current.checked[id])
			next.checked[id] = [!!current.checked[id], at];
	}
	const beforeExtras = new Map(before.extras.map((x) => [x.id, x]));
	const currentExtras = new Map(current.extras.map((x) => [x.id, x]));
	for (const [id, x] of currentExtras) {
		const old = beforeExtras.get(id);
		if (!old || old.text !== x.text || old.checked !== x.checked) {
			next.extras[id] = [{ text: x.text, checked: x.checked }, at];
		}
	}
	for (const id of beforeExtras.keys()) {
		if (!currentExtras.has(id)) next.extras[id] = [false, at];
	}
	return next;
}

// ── Cooking for everyone ───────────────────────────────────────

export const activeMembers = (doc: HouseholdDoc) =>
	Object.values(doc.members)
		.filter((m) => !m.removed)
		.sort((a, b) => a.name.localeCompare(b.name, 'sk'));

/** Everything the household as a whole must leave out. */
export interface HouseholdNeeds {
	allergens: Allergen[];
	avoid: string[];
	mild: boolean;
	glutenFree: boolean;
}

export function householdNeeds(members: Member[]): HouseholdNeeds {
	return {
		allergens: [...new Set(members.flatMap((m) => m.allergens))],
		avoid: [...new Set(members.flatMap((m) => m.avoid))],
		mild: members.some((m) => m.mild),
		glutenFree: members.some((m) => m.glutenFree)
	};
}

export interface MemberConflict {
	member: Member;
	/** "orechy", "cícer", "pálivé", "lepok" */
	reasons: string[];
}

/** Who in the household can't eat this recipe as it is, and why. */
export function recipeConflicts(
	recipe: RecipeSummary,
	members: Member[],
	ingredientsById: Map<string, Ingredient>,
	allergenLabels: Record<Allergen, string>
): MemberConflict[] {
	const groups = new Set(recipe.lines.map((l) => ingredientsById.get(l.ingredientId)?.group));
	return members.flatMap((member) => {
		const reasons = [
			...member.allergens.filter((a) => recipe.allergens.includes(a)).map((a) => allergenLabels[a]),
			...member.avoid
				.filter((id) => groups.has(ingredientsById.get(id)?.group))
				.map((id) => (ingredientsById.get(id)?.name ?? id).split(' (')[0].toLowerCase()),
			...(member.mild && recipe.spicy >= 2 ? ['pálivé'] : []),
			...(member.glutenFree && recipe.gluten === 'contains'
				? [recipe.gfSwappable ? 'lepok – uvar bezlepkovú verziu' : 'lepok']
				: [])
		];
		return reasons.length ? [{ member, reasons }] : [];
	});
}

/**
 * A test for "everyone at the table can eat it", built once for a whole list. A recipe with a
 * gluten-free version passes: the recipe page offers that version.
 */
export function householdFilter(
	needs: HouseholdNeeds,
	ingredientsById: Map<string, Ingredient>
): (recipe: RecipeSummary) => boolean {
	const groups = new Set(needs.avoid.map((id) => ingredientsById.get(id)?.group ?? id));
	return (recipe) =>
		!recipe.allergens.some((a) => needs.allergens.includes(a)) &&
		!(needs.mild && recipe.spicy >= 2) &&
		!(needs.glutenFree && recipe.gluten === 'contains' && !recipe.gfSwappable) &&
		!recipe.lines.some((l) => groups.has(ingredientsById.get(l.ingredientId)?.group ?? ''));
}

export const hasNeeds = (needs: HouseholdNeeds) =>
	needs.allergens.length > 0 || needs.avoid.length > 0 || needs.mild || needs.glutenFree;

// ── Who did what ───────────────────────────────────────────────

/**
 * What the others should hear about from this device's changes (`before` → `current`):
 * recipes added to or dropped from the plan, things bought, new food in the pantry.
 * `cooked` recipes left the plan by being cooked, which is told separately.
 */
export function changeEvents(
	before: SharedView,
	current: SharedView,
	who: string | null,
	at: number,
	cooked: ReadonlySet<string> = new Set()
): LogEvent[] {
	const had = new Set(before.plan.map((e) => e.recipeId));
	const has = new Set(current.plan.map((e) => e.recipeId));
	const events: LogEvent[] = [
		...[...has].filter((id) => !had.has(id)).map((ref) => ({ kind: 'plan-add' as const, ref })),
		...[...had]
			.filter((id) => !has.has(id) && !cooked.has(id))
			.map((ref) => ({ kind: 'plan-remove' as const, ref }))
	].map((e) => ({ at, who, ...e }));
	const wasBought = new Set(before.extras.filter((x) => x.checked).map((x) => x.id));
	const bought =
		Object.keys(current.checked).filter((id) => current.checked[id] && !before.checked[id]).length +
		current.extras.filter((x) => x.checked && !wasBought.has(x.id)).length;
	if (bought) events.push({ at, who, kind: 'bought', n: bought });
	const added = Object.keys(current.pantry).filter((id) => !(id in before.pantry)).length;
	if (added) events.push({ at, who, kind: 'pantry', n: added });
	return events;
}

export const logId = (at: number, random = Math.random()) =>
	`${at.toString(36)}-${Math.floor(random * 36 ** 6).toString(36)}`;

export function withEvents(doc: HouseholdDoc, events: LogEvent[]): HouseholdDoc {
	if (!events.length) return doc;
	const log = { ...doc.log };
	for (const e of events) log[logId(e.at)] = e;
	return { ...doc, log: newest(log, MAX_LOG, (e) => e.at) };
}

/** The log, newest first. */
export const logOf = (doc: HouseholdDoc) =>
	Object.entries(doc.log)
		.map(([id, e]) => ({ id, ...e }))
		.sort((a, b) => b.at - a.at);

// ── Bodies and portions ────────────────────────────────────────

const ACTIVITY_FACTOR: Record<Activity, number> = { bezne: 1.4, aktivne: 1.6, silovy: 1.7 };
const GOAL_KCAL: Record<BodyGoal, number> = { udrzat: 0, schudnut: -400, pribrat: 300 };
/** An adult's day, the portion size the recipes are written for. */
const ADULT_KCAL = 2000;
/** Children's portions by age; the adult formula doesn't fit them. */
const CHILD_PORTIONS: [maxAge: number, portion: number][] = [
	[3, 0.4],
	[6, 0.5],
	[10, 0.65],
	[13, 0.8]
];

export interface MemberTargets {
	kcal: number | null;
	protein: number | null;
	/** The portion the body data suggests, null without enough of it. */
	portion: number | null;
}

/**
 * Energy from Mifflin-St Jeor (the sex term averaged when not given) times activity, adjusted
 * for the goal; protein from weight as in `dailyTargets`. Children get a portion by age only.
 */
export function memberTargets(body: Body): MemberTargets {
	const { heightCm, weightKg, age, sex, activity, goal } = body;
	const protein = weightKg ? Math.round(weightKg * ACTIVITY_PROTEIN[activity]) : null;
	const child = age !== null ? CHILD_PORTIONS.find(([max]) => age <= max) : undefined;
	if (child) return { kcal: Math.round(child[1] * ADULT_KCAL), protein, portion: child[1] };
	if (!heightCm || !weightKg || !age) return { kcal: null, protein, portion: null };
	const sexTerm = sex === 'm' ? 5 : sex === 'f' ? -161 : -78;
	const rest = 10 * weightKg + 6.25 * heightCm - 5 * age + sexTerm;
	const kcal = Math.max(
		1200,
		Math.round((rest * ACTIVITY_FACTOR[activity] + GOAL_KCAL[goal]) / 50) * 50
	);
	const portion = Math.min(2, Math.max(0.5, Math.round((kcal / ADULT_KCAL) * 20) / 20));
	return { kcal, protein, portion };
}

/** The portion a member eats: set by hand, else from the body, else an adult's. */
export const portionOf = (m: Member) => m.portion ?? memberTargets(m.body).portion ?? 1;

export const isAway = (m: Member, date: string) =>
	!!m.away && m.away.from <= date && (m.away.to === null || date <= m.away.to);

/** Portions eaten at home at this meal on this day (0 when nobody is home). */
export function portionsAt(members: Member[], date: string, meal: PlanMeal): number {
	return members
		.filter((m) => m.meals[meal] && !isAway(m, date))
		.reduce((sum, m) => sum + portionOf(m), 0);
}

// ── Money ──────────────────────────────────────────────────────

export const expensesOf = (doc: HouseholdDoc) =>
	Object.entries(doc.expenses)
		.flatMap(([id, [e, at]]) => (e === false ? [] : [{ id, at, ...e }]))
		.sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at);

/**
 * What each member is owed (+) or owes (−). Shared costs split evenly among `members`; a
 * payback moves money from one member to another.
 */
export function balances(expenses: Expense[], members: Member[]): Map<string, number> {
	const out = new Map(members.map((m) => [m.id, 0]));
	const add = (id: string, amount: number) => out.set(id, (out.get(id) ?? 0) + amount);
	for (const e of expenses) {
		add(e.by, e.amount);
		if (e.to) add(e.to, -e.amount);
		else for (const m of members) add(m.id, -e.amount / members.length);
	}
	for (const [id, v] of out) out.set(id, Math.round(v * 100) / 100);
	return out;
}

/** The fewest paybacks that settle everyone: the biggest debtor pays the biggest creditor. */
export function settleUp(
	balance: Map<string, number>
): { from: string; to: string; amount: number }[] {
	const debtors = [...balance].filter(([, v]) => v < -0.004).map(([id, v]) => ({ id, v: -v }));
	const creditors = [...balance].filter(([, v]) => v > 0.004).map(([id, v]) => ({ id, v }));
	const out: { from: string; to: string; amount: number }[] = [];
	while (debtors.length && creditors.length) {
		debtors.sort((a, b) => b.v - a.v);
		creditors.sort((a, b) => b.v - a.v);
		const d = debtors[0];
		const c = creditors[0];
		const amount = Math.round(Math.min(d.v, c.v) * 100) / 100;
		if (amount > 0) out.push({ from: d.id, to: c.id, amount });
		d.v -= amount;
		c.v -= amount;
		if (d.v < 0.005) debtors.shift();
		if (c.v < 0.005) creditors.shift();
	}
	return out;
}

// ── Cooking turns and wishes ───────────────────────────────────

/** Hands out the cooking in turns among `cooks`, in plan order; freezer portions need no cook. */
export function shareCooking(plan: PlanEntry[], cooks: string[]): PlanEntry[] {
	if (!cooks.length) return plan;
	let turn = 0;
	return plan.map((e) => (e.fromFreezer ? e : { ...e, cook: cooks[turn++ % cooks.length] }));
}

export const wishKey = (memberId: string, recipeId: string) => `${memberId}.${recipeId}`;

/** Recipe id → who wants it. */
export function wishesOf(doc: HouseholdDoc, members: Member[]): Map<string, Member[]> {
	const byId = new Map(members.map((m) => [m.id, m]));
	const out = new Map<string, Member[]>();
	for (const [key, [wanted]] of Object.entries(doc.wishes)) {
		if (!wanted) continue;
		const [memberId, recipeId] = key.split('.');
		const member = byId.get(memberId);
		if (member) out.set(recipeId, [...(out.get(recipeId) ?? []), member]);
	}
	return out;
}
