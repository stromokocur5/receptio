import { shiftDate } from './journal';
import { unitPrice } from './pricing';

/** One row of content/price-history*.csv, with the pack weighed in grams. */
export interface HistoryRow {
	date: string;
	ingredientId: string;
	storeId: string;
	product: string;
	pack: string;
	packGrams: number;
	price: number;
	saleUntil?: string;
}

/**
 * One product in one shop over time. Only the days its price changed are kept, so years of
 * daily prices stay small. A sale price is its own series next to the regular one.
 */
export interface PriceSeries {
	ingredientId: string;
	storeId: string;
	product: string;
	pack: string;
	packGrams: number;
	sale: boolean;
	/** [day, price, sale end ('' for regular prices)] on the first day and every change. */
	changes: [string, number, string][];
	/** The last day the product was listed; after it, its price is unknown. */
	lastSeen: string;
}

export interface PriceHistory {
	/** Every day with any price, oldest first. */
	days: string[];
	/** The days each shop reported prices – a day missing here is a day without data. */
	storeDays: Record<string, string[]>;
	series: PriceSeries[];
}

/** Rows (any order) → series that keep only the changes. */
export function compressHistory(rows: HistoryRow[]): PriceHistory {
	const sorted = rows.toSorted((a, b) => a.date.localeCompare(b.date));
	const byKey = new Map<string, PriceSeries>();
	for (const row of sorted) {
		const sale = row.saleUntil !== undefined;
		const key = [row.ingredientId, row.storeId, row.product, row.pack, sale].join('|');
		const until = row.saleUntil ?? '';
		let series = byKey.get(key);
		if (!series) {
			series = {
				ingredientId: row.ingredientId,
				storeId: row.storeId,
				product: row.product,
				pack: row.pack,
				packGrams: row.packGrams,
				sale,
				changes: [],
				lastSeen: row.date
			};
			byKey.set(key, series);
		}
		const last = series.changes.at(-1);
		if (last && last[0] === row.date) {
			// Two listings of the same product on one day: the lower price is the one on offer.
			if (row.price < last[1])
				series.changes[series.changes.length - 1] = [row.date, row.price, until];
		} else if (!last || last[1] !== row.price || last[2] !== until) {
			series.changes.push([row.date, row.price, until]);
		}
		series.lastSeen = row.date;
	}
	const storeDays: Record<string, string[]> = {};
	for (const row of sorted) {
		const days = (storeDays[row.storeId] ??= []);
		if (days.at(-1) !== row.date) days.push(row.date);
	}
	return {
		days: [...new Set(sorted.map((r) => r.date))],
		storeDays,
		series: [...byKey.values()]
	};
}

/** The series' price on `day`, or null when it wasn't listed or the sale had ended. */
export function priceOn(series: PriceSeries, day: string): number | null {
	if (day > series.lastSeen) return null;
	let current: [string, number, string] | undefined;
	for (const change of series.changes) {
		if (change[0] > day) break;
		current = change;
	}
	if (!current) return null;
	if (series.sale && current[2] < day) return null;
	return current[1];
}

/** Price per kg, or per litre for liquids – the unit the series is shown in. */
export function seriesUnit(series: PriceSeries): 'kg' | 'l' {
	return unitPrice({ pack: series.pack, packGrams: series.packGrams, price: 1 }).unit;
}

function perUnit(series: PriceSeries, price: number): number {
	return unitPrice({ pack: series.pack, packGrams: series.packGrams, price }).value;
}

/** Per kg whatever the pack – for comparing products sold by volume and by weight. */
function perKg(series: PriceSeries, price: number): number {
	return (price / series.packGrams) * 1000;
}

export interface StoreLine {
	storeId: string;
	/** Per `unit`, one value per day in `days` (null: not listed that day). */
	regular: (number | null)[];
	/** Sale price per `unit` on the days a sale ran there. */
	sale: (number | null)[];
}

export interface IngredientTimeline {
	unit: 'kg' | 'l';
	days: string[];
	stores: StoreLine[];
}

/** The cheapest regular and sale price of an ingredient in each shop, day by day. */
export function ingredientTimeline(
	history: PriceHistory,
	ingredientId: string,
	storeIds?: string[]
): IngredientTimeline {
	const series = history.series.filter(
		(s) => s.ingredientId === ingredientId && (!storeIds || storeIds.includes(s.storeId))
	);
	// Mixed packs (1 l carton and 500 g tub) are shown per kg, which works for both.
	const units = new Set(series.map(seriesUnit));
	const unit = units.size === 1 && units.has('l') ? 'l' : 'kg';
	const value = (s: PriceSeries, price: number) =>
		unit === 'l' ? perUnit(s, price) : perKg(s, price);
	const days = history.days.filter((d) => series.some((s) => s.changes[0][0] <= d));
	const stores = [...new Set(series.map((s) => s.storeId))].map((storeId) => {
		const mine = series.filter((s) => s.storeId === storeId);
		const cheapest = (sale: boolean, day: string) => {
			const prices = mine
				.filter((s) => s.sale === sale)
				.flatMap((s) => {
					const price = priceOn(s, day);
					return price === null ? [] : [value(s, price)];
				});
			return prices.length ? Math.min(...prices) : null;
		};
		return {
			storeId,
			regular: days.map((d) => cheapest(false, d)),
			sale: days.map((d) => cheapest(true, d))
		};
	});
	return { unit, days, stores };
}

/** Cheapest regular price per kg of each ingredient on a day, across the given shops. */
function cheapestRegular(
	history: PriceHistory,
	day: string,
	storeIds: Set<string>
): Map<string, number> {
	const best = new Map<string, number>();
	for (const s of history.series) {
		if (s.sale || !storeIds.has(s.storeId)) continue;
		const price = priceOn(s, day);
		if (price === null) continue;
		const kg = perKg(s, price);
		if (kg < (best.get(s.ingredientId) ?? Infinity)) best.set(s.ingredientId, kg);
	}
	return best;
}

export interface PriceChange {
	ingredientId: string;
	storeId: string;
	product: string;
	pack: string;
	/** Price of the pack at the start and at the end. */
	from: number;
	to: number;
	/** Relative change, +0.1 = 10 % dearer. */
	change: number;
	since: string;
}

/**
 * How regular prices moved between the first day of the window and the last day with data,
 * product by product: only products listed on both days, each against itself – a cheap pack
 * that left the shelf isn't a price rise. Sales are left out, they come and go.
 */
export function priceChanges(
	history: PriceHistory,
	storeIds: string[],
	windowDays: number | null
): PriceChange[] {
	const last = history.days.at(-1);
	if (!last) return [];
	const start =
		windowDays === null
			? history.days[0]
			: history.days.find((d) => d >= shiftDate(last, -windowDays));
	if (!start || start === last) return [];
	return history.series
		.flatMap((s): PriceChange[] => {
			if (s.sale || !storeIds.includes(s.storeId)) return [];
			const from = priceOn(s, start);
			const to = priceOn(s, last);
			if (from === null || to === null || from === to) return [];
			const { ingredientId, storeId, product, pack } = s;
			return [
				{ ingredientId, storeId, product, pack, from, to, change: to / from - 1, since: start }
			];
		})
		.sort((a, b) => b.change - a.change);
}

export interface LowestPrice {
	/** Per `unit`, the same unit the ingredient's chart uses. */
	value: number;
	unit: 'kg' | 'l';
	/** Every shop that had it at that price, each with the first day it did. */
	stores: { storeId: string; day: string; sale: boolean }[];
}

/** The lowest price, sales included, in the last `days` days of data – with every shop tied at it. */
export function lowestPrice(
	history: PriceHistory,
	ingredientId: string,
	storeIds: string[],
	days: number
): LowestPrice | null {
	const timeline = ingredientTimeline(history, ingredientId, storeIds);
	const last = timeline.days.at(-1);
	if (!last) return null;
	const from = shiftDate(last, -days);
	const seen: { value: number; storeId: string; day: string; sale: boolean }[] = [];
	for (const line of timeline.stores) {
		timeline.days.forEach((day, i) => {
			if (day < from) return;
			if (line.regular[i] !== null)
				seen.push({ value: line.regular[i]!, storeId: line.storeId, day, sale: false });
			if (line.sale[i] !== null)
				seen.push({ value: line.sale[i]!, storeId: line.storeId, day, sale: true });
		});
	}
	if (!seen.length) return null;
	// Cents decide: 1,49 € and 1,4900001 € are the same price on the shelf.
	const cents = (v: number) => Math.round(v * 100);
	const min = Math.min(...seen.map((s) => cents(s.value)));
	const stores = new Map<string, { storeId: string; day: string; sale: boolean }>();
	for (const s of seen.toSorted((a, b) => a.day.localeCompare(b.day))) {
		if (cents(s.value) === min && !stores.has(s.storeId)) {
			stores.set(s.storeId, { storeId: s.storeId, day: s.day, sale: s.sale });
		}
	}
	return { value: min / 100, unit: timeline.unit, stores: [...stores.values()] };
}

export interface DaySale {
	ingredientId: string;
	storeId: string;
	salePerKg: number;
	/** What it costs without the sale: the shop's own regular price, else the cheapest elsewhere. */
	regularPerKg: number;
}

/** The best sale on each ingredient on a given day in the given shops, with what it saves. */
export function salesOn(history: PriceHistory, day: string, storeIds: string[]): DaySale[] {
	const shops = new Set(storeIds);
	const anywhere = cheapestRegular(history, day, shops);
	const best = new Map<string, DaySale>();
	for (const s of history.series) {
		if (!s.sale || !shops.has(s.storeId)) continue;
		const price = priceOn(s, day);
		if (price === null) continue;
		const salePerKg = perKg(s, price);
		const own = cheapestRegular(history, day, new Set([s.storeId])).get(s.ingredientId);
		const regularPerKg = own ?? anywhere.get(s.ingredientId);
		if (regularPerKg === undefined || regularPerKg <= salePerKg) continue;
		const seen = best.get(s.ingredientId);
		if (!seen || regularPerKg - salePerKg > seen.regularPerKg - seen.salePerKg) {
			best.set(s.ingredientId, {
				ingredientId: s.ingredientId,
				storeId: s.storeId,
				salePerKg,
				regularPerKg
			});
		}
	}
	return [...best.values()];
}

/** Parses the history CSV (RFC 4180: quoted fields may hold commas and doubled quotes). */
export function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (quoted) {
			if (c === '"' && text[i + 1] === '"') {
				field += '"';
				i++;
			} else if (c === '"') quoted = false;
			else field += c;
		} else if (c === '"') quoted = true;
		else if (c === ',') {
			row.push(field);
			field = '';
		} else if (c === '\n' || c === '\r') {
			if (c === '\r' && text[i + 1] === '\n') i++;
			row.push(field);
			if (row.some((f) => f !== '')) rows.push(row);
			row = [];
			field = '';
		} else field += c;
	}
	row.push(field);
	if (row.some((f) => f !== '')) rows.push(row);
	return rows;
}

export const csvField = (value: string | number) => {
	const text = String(value);
	return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function toCsv(rows: (string | number)[][]): string {
	return rows.map((r) => r.map(csvField).join(',')).join('\n') + '\n';
}
