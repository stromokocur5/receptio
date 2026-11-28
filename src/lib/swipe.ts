import { hashString } from './art';
import type { Member } from './household';

/**
 * "What shall we eat?" one card at a time: everyone in the household swipes recipes on their own
 * phone, right for "I'd eat that" (a wish, shared with the household), left for "not now" (kept
 * on this phone only). A recipe everyone wants is a match.
 */

/** Ids → who wants each (household.ts `wishesOf`). */
export type Wishes = Map<string, Member[]>;

/**
 * The cards still to swipe for `me`: first what the others already want, most wanted first, so
 * matches come quickly; then the rest in an order that changes every day.
 */
export function swipeDeck<R extends { id: string }>(
	recipes: R[],
	wishes: Wishes,
	me: string,
	seen: Record<string, unknown>,
	inPlan: Set<string>,
	day: string,
	seasonal: (recipe: R) => boolean = () => false
): R[] {
	const open = recipes.filter(
		(r) => !(r.id in seen) && !inPlan.has(r.id) && !wishes.get(r.id)?.some((m) => m.id === me)
	);
	const othersWant = (r: R) => wishes.get(r.id)?.length ?? 0;
	const shuffle = (r: R) => hashString(`${day}:${r.id}`);
	return open.sort(
		(a, b) =>
			othersWant(b) - othersWant(a) ||
			Number(seasonal(b)) - Number(seasonal(a)) ||
			shuffle(a) - shuffle(b)
	);
}

/**
 * Who swipes: members with their own phone. A child's profile can't swipe, so it doesn't
 * hold back a match (everyone, when nobody has a phone of their own).
 */
export function swipers(members: Member[]): Member[] {
	return members.some((m) => m.owner) ? members.filter((m) => m.owner) : members;
}

/** Recipes everyone in the household wants (two people at least). */
export function matches(wishes: Wishes, members: Member[]): string[] {
	if (members.length < 2) return [];
	const everyone = new Set(members.map((m) => m.id));
	return [...wishes]
		.filter(([, who]) => who.filter((m) => everyone.has(m.id)).length === everyone.size)
		.map(([id]) => id);
}

/** Wanted by all but one: worth a second look by that one. */
export function almost(wishes: Wishes, members: Member[]): { id: string; missing: Member }[] {
	if (members.length < 3) return [];
	return [...wishes].flatMap(([id, who]) => {
		const missing = members.filter((m) => !who.some((w) => w.id === m.id));
		return missing.length === 1 ? [{ id, missing: missing[0] }] : [];
	});
}

export const MAX_SEEN = 600;

export function validateSeen(raw: unknown): Record<string, string> | undefined {
	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
	return Object.fromEntries(
		Object.entries(raw)
			.filter((e): e is [string, string] => typeof e[1] === 'string')
			.slice(-MAX_SEEN)
	);
}
