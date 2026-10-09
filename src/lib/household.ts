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

export interface Member {
	id: string;
	name: string;
	allergens: Allergen[];
	/** Ingredient ids they don't eat. */
	avoid: string[];
	/** No spicy food (children, sensitive stomachs). */
	mild: boolean;
	glutenFree: boolean;
	/** Removed members stay as a tombstone so the removal wins over older copies. */
	removed: boolean;
	at: number;
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
const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MEMBER_ID_RE = /^[a-z0-9]{1,16}$/;

export function newDoc(name: string, now: number): HouseholdDoc {
	return {
		v: 1,
		name: [name.trim().slice(0, MAX_NAME) || 'Domácnosť', now],
		members: {},
		plan: [[], 0],
		pantry: {},
		checked: {},
		extras: {}
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
		removed: raw.removed === true,
		at: raw.at
	};
}

function validatePlanEntries(raw: unknown): PlanEntry[] | undefined {
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
		if (typeof e.frozenOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.frozenOn)) {
			entry.frozenOn = e.frozenOn;
		}
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
		extras: record(raw.extras, /^[a-zA-Z0-9-]{1,40}$/, (v) =>
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
		)
	};
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
		extras: mergeRecord(a.extras, b.extras)
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
