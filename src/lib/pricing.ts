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

export interface StoreBasket {
	store: Store;
	total: number;
	/** Paid at the till for whole packs (estimates where the store has no price). */
	shelfTotal: number;
	/** How many of the items have a real price in this store (rest uses estimates). */
	covered: number;
	items: number;
}

/** Totals a basket per store, filling gaps with estimates so stores stay comparable. */
export function basketByStore(
	items: { ingredient: Ingredient; grams: number }[],
	stores: Store[],
	prices: PriceEntry[],
	today: Date
): StoreBasket[] {
	return stores
		.map((store) => {
			let total = 0;
			let shelfTotal = 0;
			let covered = 0;
			for (const { ingredient, grams } of items) {
				const price = bestPrice(ingredient, prices, today, store.id);
				const used = (price.perKg * grams) / 1000;
				total += used;
				shelfTotal += shelfCost(ingredient, grams, prices, today, store.id)?.cost ?? used;
				if (!price.isEstimate) covered++;
			}
			return { store, total, shelfTotal, covered, items: items.length };
		})
		.filter((b) => b.covered > 0)
		.sort((a, b) => b.covered / b.items - a.covered / a.items || a.total - b.total);
}
