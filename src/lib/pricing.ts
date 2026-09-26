import type { Ingredient, PriceEntry, Store } from './types';

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

export interface StoreBasket {
	store: Store;
	total: number;
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
			let covered = 0;
			for (const { ingredient, grams } of items) {
				const price = bestPrice(ingredient, prices, today, store.id);
				total += (price.perKg * grams) / 1000;
				if (!price.isEstimate) covered++;
			}
			return { store, total, covered, items: items.length };
		})
		.filter((b) => b.covered > 0)
		.sort((a, b) => b.covered / b.items - a.covered / a.items || a.total - b.total);
}
