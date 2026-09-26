import type { PlanEntry } from './shopping';

/**
 * A plan and its shopping list packed into a URL fragment. The fragment never reaches the
 * server, so a shared list stays between the people who have the link.
 */
export interface SharedPlan {
	plan: PlanEntry[];
	/** What the sender still has to buy (their pantry already subtracted): ingredientId → grams. */
	buy: [string, number][];
	people: number;
	days: number;
}

const VERSION = 1;
const MAX_ITEMS = 200;
const ID_RE = /^[a-z0-9-]{1,80}$/;
const MAX_VARIANT_LENGTH = 80;

function toBase64Url(text: string): string {
	const bytes = new TextEncoder().encode(text);
	let binary = '';
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(encoded: string): string {
	const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
	const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
	return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

export function encodeSharedPlan(shared: SharedPlan): string {
	return toBase64Url(
		JSON.stringify({
			v: VERSION,
			p: shared.plan.map((e) =>
				e.variant ? [e.recipeId, e.servings, e.variant] : [e.recipeId, e.servings]
			),
			b: shared.buy.map(([id, grams]) => [id, Math.round(grams)]),
			n: shared.people,
			d: shared.days
		})
	);
}

const isInt = (v: unknown, min: number, max: number): v is number =>
	typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/**
 * Parses a fragment from a link someone sent, so it's untrusted: anything malformed returns
 * null, and unknown recipes or ingredients are dropped.
 */
export function decodeSharedPlan(
	encoded: string,
	knownRecipes: ReadonlySet<string>,
	knownIngredients: ReadonlySet<string>
): SharedPlan | null {
	if (encoded.length > 20_000) return null;
	let raw: unknown;
	try {
		raw = JSON.parse(fromBase64Url(encoded));
	} catch {
		return null;
	}
	if (typeof raw !== 'object' || raw === null) return null;
	const { v, p, b, n, d } = raw as Record<string, unknown>;
	if (v !== VERSION || !Array.isArray(p) || !Array.isArray(b)) return null;
	if (p.length > MAX_ITEMS || b.length > MAX_ITEMS) return null;

	const plan: PlanEntry[] = [];
	for (const item of p) {
		if (!Array.isArray(item)) return null;
		const [recipeId, servings, variant] = item as unknown[];
		if (typeof recipeId !== 'string' || !ID_RE.test(recipeId) || !isInt(servings, 1, 100))
			return null;
		if (
			variant !== undefined &&
			(typeof variant !== 'string' || variant.length > MAX_VARIANT_LENGTH)
		)
			return null;
		if (!knownRecipes.has(recipeId)) continue;
		plan.push(variant ? { recipeId, servings, variant } : { recipeId, servings });
	}

	const buy: [string, number][] = [];
	for (const item of b) {
		if (!Array.isArray(item)) return null;
		const [id, grams] = item as unknown[];
		if (typeof id !== 'string' || !ID_RE.test(id) || !isInt(grams, 0, 1_000_000)) return null;
		if (knownIngredients.has(id)) buy.push([id, grams]);
	}

	return {
		plan,
		buy,
		people: isInt(n, 1, 12) ? n : 1,
		days: isInt(d, 1, 14) ? d : 7
	};
}
