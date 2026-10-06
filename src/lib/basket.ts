import { shiftDate } from './journal';
import { priceOn, type PriceHistory } from './price-history';

/** A fixed weekly shop the price index follows (content/kosik.yaml). */
export interface Basket {
	version: number;
	items: { ingredientId: string; grams: number }[];
}

export interface BasketDay {
	date: string;
	/** What the basket cost that day, in €. */
	cost: number;
	/** Cost against the first day, which is 100. */
	index: number;
	/** Items with a price carried over from an earlier day (a shop didn't report). */
	carried: number;
}

/** A price older than this isn't carried forward; the day drops out instead. */
export const CARRY_DAYS = 7;

const median = (values: number[]) => {
	const sorted = values.toSorted((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * The typical shelf price per kg of an ingredient on a day: the median across shops of each
 * shop's cheapest regular (not sale) price. One discounter or one sale doesn't move it.
 */
export function typicalPerKg(
	history: PriceHistory,
	ingredientId: string,
	storeIds: string[],
	day: string
): number | null {
	const perShop = new Map<string, number>();
	for (const s of history.series) {
		if (s.sale || s.ingredientId !== ingredientId || !storeIds.includes(s.storeId)) continue;
		const price = priceOn(s, day);
		if (price === null) continue;
		const kg = (price / s.packGrams) * 1000;
		perShop.set(s.storeId, Math.min(perShop.get(s.storeId) ?? Infinity, kg));
	}
	return perShop.size ? median([...perShop.values()]) : null;
}

/** The basket's cost day by day, from the first day every item has a price. */
export function basketIndex(
	history: PriceHistory,
	basket: Basket,
	storeIds: string[]
): BasketDay[] {
	const last = new Map<string, { day: string; perKg: number }>();
	const out: Omit<BasketDay, 'index'>[] = [];
	// Only days the shops reported; e-shop days would repeat the last shop prices.
	const shopDays = new Set(storeIds.flatMap((id) => history.storeDays[id] ?? []));
	for (const day of history.days.filter((d) => shopDays.has(d))) {
		let cost = 0;
		let carried = 0;
		let complete = true;
		for (const item of basket.items) {
			const perKg = typicalPerKg(history, item.ingredientId, storeIds, day);
			if (perKg !== null) last.set(item.ingredientId, { day, perKg });
			const known = last.get(item.ingredientId);
			if (!known || known.day < shiftDate(day, -CARRY_DAYS)) {
				complete = false;
				break;
			}
			if (perKg === null) carried++;
			cost += (known.perKg * item.grams) / 1000;
		}
		if (complete) out.push({ date: day, cost, carried });
	}
	const base = out[0]?.cost;
	return out.map((d) => ({
		...d,
		cost: Math.round(d.cost * 100) / 100,
		index: Math.round((d.cost / base) * 1000) / 10
	}));
}
