import type { Ingredient, IngredientCategory, PriceEntry, Store } from './types';

export const STALE_AFTER_DAYS = 60;
export const BULK_PACK_GRAMS = 2000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function pricePerKg(entry: PriceEntry): number {
	return (entry.price / entry.packGrams) * 1000;
}

export function ageInDays(isoDate: string, today: Date): number {
	return Math.floor((today.getTime() - new Date(isoDate).getTime()) / DAY_MS);
}

export function isStale(entry: PriceEntry, today: Date): boolean {
	return ageInDays(entry.date, today) > STALE_AFTER_DAYS;
}

export function isSaleActive(entry: PriceEntry, today: Date): boolean {
	return (
		entry.saleUntil !== undefined && new Date(entry.saleUntil).getTime() + DAY_MS > today.getTime()
	);
}

/** A sale price stops counting once it has ended; a regular price stops counting once stale. */
export function isUsable(entry: PriceEntry, today: Date): boolean {
	if (entry.saleUntil !== undefined) return isSaleActive(entry, today);
	return !isStale(entry, today);
}

export interface BestPrice {
	perKg: number;
	storeId: string | null;
	isEstimate: boolean;
}

export function bestPrice(
	ingredient: Ingredient,
	prices: PriceEntry[],
	today: Date,
	storeId?: string
): BestPrice {
	const candidates = prices.filter(
		(p) =>
			p.ingredientId === ingredient.id &&
			(storeId === undefined || p.storeId === storeId) &&
			isUsable(p, today)
	);
	if (candidates.length === 0) {
		return { perKg: ingredient.priceEstimate, storeId: null, isEstimate: true };
	}
	const cheapest = candidates.reduce((a, b) => (pricePerKg(b) < pricePerKg(a) ? b : a));
	return { perKg: pricePerKg(cheapest), storeId: cheapest.storeId, isEstimate: false };
}

const LOOSE_CATEGORIES: ReadonlySet<IngredientCategory> = new Set(['zelenina', 'ovocie']);

/** What you actually pay at the till: whole packs, the cheapest way to cover `grams`. */
export interface ShelfCost {
	storeId: string;
	product: string;
	packGrams: number;
	/** Whole packs; a fraction for loose produce sold by weight. */
	packs: number;
	cost: number;
}

/**
 * Cheapest whole-pack purchase covering `grams` (a 500 g bag beats a 5 kg sack for 200 g),
 * or null when no real price is known – estimates have no pack size.
 */
export function shelfCost(
	ingredient: Ingredient,
	grams: number,
	prices: PriceEntry[],
	today: Date,
	storeId?: string
): ShelfCost | null {
	if (grams <= 0) return null;
	let best: ShelfCost | null = null;
	for (const p of prices) {
		if (p.ingredientId !== ingredient.id || !isUsable(p, today)) continue;
		if (storeId !== undefined && p.storeId !== storeId) continue;
		// Loose produce is priced per kg and weighed at the till – you pay for what you take.
		const byWeight = LOOSE_CATEGORIES.has(ingredient.category) && p.packGrams === 1000;
		// A few grams over a pack (rounded recipe amounts) shouldn't mean buying a second one.
		const packs = byWeight
			? grams / p.packGrams
			: Math.max(1, Math.ceil(grams / p.packGrams - 0.05));
		const cost = packs * p.price;
		if (!best || cost < best.cost) {
			best = { storeId: p.storeId, product: p.product, packGrams: p.packGrams, packs, cost };
		}
	}
	return best;
}

/** Going to one more shop has to save at least this much to be worth it. */
export const EXTRA_STORE_WORTH_EUR = 1;

export interface StorePlan {
	storeIds: string[];
	/** Whole-pack total for the items that have a real price somewhere. */
	total: number;
	/** ingredientId → the store to buy it in (absent: no price in these stores). */
	assignment: Map<string, string>;
	/** Items with no price in these stores, counted at their dearest known price. */
	missing: number;
}

export interface StoreComparison {
	/** Every shop on its own, best first. */
	singles: StorePlan[];
	single: StorePlan | null;
	pair: StorePlan | null;
	/** Every item wherever it's cheapest, however many shops that takes. */
	anywhere: StorePlan | null;
	/** The plan worth doing: another shop only when it saves EXTRA_STORE_WORTH_EUR. */
	recommended: StorePlan | null;
	/** Items with no real price anywhere – the same in every plan, left out of the totals. */
	unpriced: number;
}

/** One shop, two shops, or every item where it's cheapest – which way the shopping is cheapest. */
export function compareStores(
	items: { ingredient: Ingredient; grams: number }[],
	stores: Store[],
	prices: PriceEntry[],
	today: Date
): StoreComparison {
	const priced = items
		.filter((i) => i.grams > 0)
		.map((item) => {
			const costs = new Map<string, number>();
			for (const store of stores) {
				const shelf = shelfCost(item.ingredient, item.grams, prices, today, store.id);
				if (shelf) costs.set(store.id, shelf.cost);
			}
			return { id: item.ingredient.id, costs, dearest: Math.max(0, ...costs.values()) };
		});
	const withPrice = priced.filter((i) => i.costs.size > 0);

	const plan = (storeIds: string[]): StorePlan => {
		let total = 0;
		let missing = 0;
		const assignment = new Map<string, string>();
		for (const item of withPrice) {
			let best: [string, number] | null = null;
			for (const id of storeIds) {
				const cost = item.costs.get(id);
				if (cost !== undefined && (!best || cost < best[1])) best = [id, cost];
			}
			if (best) {
				assignment.set(item.id, best[0]);
				total += best[1];
			} else {
				total += item.dearest;
				missing++;
			}
		}
		const used = storeIds.filter((id) => [...assignment.values()].includes(id));
		return { storeIds: used, total, assignment, missing };
	};
	// A shop that has everything beats a cheaper-looking one where things are missing.
	const better = (a: StorePlan, b: StorePlan) =>
		b.missing < a.missing || (b.missing === a.missing && b.total < a.total);
	const cheapest = (plans: StorePlan[]) =>
		plans.reduce<StorePlan | null>((a, b) => (!a || better(a, b) ? b : a), null);

	const ids = stores.map((s) => s.id).filter((id) => withPrice.some((i) => i.costs.has(id)));
	const singles = ids.map((id) => plan([id])).sort((a, b) => (better(a, b) ? 1 : -1));
	const single = singles[0] ?? null;
	const pairs: StorePlan[] = [];
	for (let a = 0; a < ids.length; a++) {
		for (let b = a + 1; b < ids.length; b++) pairs.push(plan([ids[a], ids[b]]));
	}
	const pairBest = cheapest(pairs);
	const pair = pairBest && pairBest.storeIds.length === 2 ? pairBest : null;
	const anywhere = ids.length ? plan(ids) : null;

	let recommended = single;
	if (
		pair &&
		recommended &&
		(pair.missing < recommended.missing || pair.total <= recommended.total - EXTRA_STORE_WORTH_EUR)
	) {
		recommended = pair;
	}
	return {
		singles,
		single,
		pair,
		anywhere,
		recommended,
		unpriced: priced.length - withPrice.length
	};
}
