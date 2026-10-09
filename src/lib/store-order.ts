/**
 * The shopping list learns the way you walk your shop: the order you tick things off in the
 * store becomes the list's order next time. It learns whole aisles (categories) and the items
 * within each, separately per shop.
 *
 * Every trip adds one vote "a before b" for each pair ticked in that order; older votes fade,
 * so a rearranged shop is learned again within a few trips. Before the first trip, the usual
 * aisle order counts as half a vote, so the list never starts in a random order.
 */

export interface Trip {
	store: string;
	/** Ingredient id, its category and when it was ticked (ms). */
	ticks: [string, string, number][];
}

export interface StoreOrder {
	/** Per shop ('' when not told which): "a>b" → weight of "a was ticked before b". */
	pairs: Record<string, Record<string, number>>;
	/** Trips learned per shop, shown so the list can say it is learning. */
	trips: Record<string, number>;
	/** The trip in progress. */
	trip: Trip | null;
	/** The shop the list was last shopped in, when you shop in more than one. */
	store: string;
}

export const NO_STORE_ORDER: StoreOrder = { pairs: {}, trips: {}, trip: null, store: '' };

/** Ticks this far apart are two trips. */
export const TRIP_GAP_MS = 45 * 60_000;
/** Ticking a few things at home in a few seconds isn't a walk through the shop. */
const MIN_TICKS = 4;
const MIN_TRIP_MS = 3 * 60_000;
const FADE = 0.85;
const FORGET_BELOW = 0.05;
const MAX_PAIRS = 800;
const MAX_TICKS = 200;
/** The usual order's weight: one real trip outweighs it. */
const USUAL = 0.5;

/** A tick (or untick) on the list. Starts a new trip when the last tick was long ago. */
export function noteTick(
	order: StoreOrder,
	store: string,
	id: string,
	category: string,
	done: boolean,
	now: number
): StoreOrder {
	let next = order;
	const trip = order.trip;
	const last = trip?.ticks.at(-1)?.[2] ?? 0;
	if (trip && (trip.store !== store || now - last > TRIP_GAP_MS)) next = finishTrip(next);
	const current = next.trip ?? { store, ticks: [] };
	const ticks = current.ticks.filter(([tid]) => tid !== id);
	if (done && ticks.length < MAX_TICKS) ticks.push([id, category, now]);
	return { ...next, trip: { store, ticks } };
}

/** Learns from the trip in progress if it is over (or `force`d, e.g. the basket was cleared). */
export function settleTrip(order: StoreOrder, now: number, force = false): StoreOrder {
	const last = order.trip?.ticks.at(-1)?.[2];
	if (last === undefined) return order.trip ? { ...order, trip: null } : order;
	return force || now - last > TRIP_GAP_MS ? finishTrip(order) : order;
}

function finishTrip(order: StoreOrder): StoreOrder {
	const trip = order.trip;
	if (!trip) return order;
	const ticks = trip.ticks;
	const long = ticks.length >= MIN_TICKS && ticks.at(-1)![2] - ticks[0][2] >= MIN_TRIP_MS;
	if (!long) return { ...order, trip: null };

	const pairs: Record<string, number> = {};
	for (const [key, w] of Object.entries(order.pairs[trip.store] ?? {})) {
		if (w * FADE >= FORGET_BELOW) pairs[key] = w * FADE;
	}
	const vote = (a: string, b: string) => (pairs[`${a}>${b}`] = (pairs[`${a}>${b}`] ?? 0) + 1);

	// Aisles in the order first reached; items in the order ticked, within their aisle.
	const aisles: string[] = [];
	const items = new Map<string, string[]>();
	for (const [id, category] of ticks) {
		if (!items.has(category)) {
			aisles.push(category);
			items.set(category, []);
		}
		items.get(category)!.push(id);
	}
	for (let i = 0; i < aisles.length; i++) {
		for (let j = i + 1; j < aisles.length; j++) vote(`c:${aisles[i]}`, `c:${aisles[j]}`);
	}
	for (const list of items.values()) {
		for (let i = 0; i < list.length; i++) {
			for (let j = i + 1; j < list.length; j++) vote(list[i], list[j]);
		}
	}
	const kept = Object.entries(pairs)
		.sort(([, a], [, b]) => b - a)
		.slice(0, MAX_PAIRS);
	return {
		...order,
		trip: null,
		pairs: { ...order.pairs, [trip.store]: Object.fromEntries(kept) },
		trips: { ...order.trips, [trip.store]: (order.trips[trip.store] ?? 0) + 1 }
	};
}

/**
 * `items` in the learned order. Their given order is the usual one and counts as half a vote, so
 * what was never ticked together stays as it was.
 */
export function inLearnedOrder<T>(
	items: T[],
	key: (item: T) => string,
	pairs: Record<string, number> | undefined
): T[] {
	if (!pairs || items.length < 2) return items;
	const keys = items.map(key);
	const score = keys.map((a, i) => {
		let s = 0;
		keys.forEach((b, j) => {
			if (i === j) return;
			const ab = pairs[`${a}>${b}`] ?? 0;
			const ba = pairs[`${b}>${a}`] ?? 0;
			s += (ab + (i < j ? USUAL : 0)) / (ab + ba + USUAL);
		});
		return s;
	});
	return items
		.map((item, i) => ({ item, i }))
		.sort((x, y) => score[y.i] - score[x.i] || x.i - y.i)
		.map(({ item }) => item);
}

/** Aisles and the items in each, in the learned order of `store`. */
export function orderAisles<C extends string, I extends { ingredient: { id: string } }>(
	aisles: [C, I[]][],
	order: StoreOrder,
	store: string
): [C, I[]][] {
	const pairs = order.pairs[store];
	if (!pairs) return aisles;
	return inLearnedOrder(aisles, ([c]) => `c:${c}`, pairs).map(([c, list]) => [
		c,
		inLearnedOrder(list, (i) => i.ingredient.id, pairs)
	]);
}

export function validateStoreOrder(raw: unknown): StoreOrder | undefined {
	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
	const r = raw as Record<string, unknown>;
	const isRecord = (v: unknown): v is Record<string, unknown> =>
		typeof v === 'object' && v !== null && !Array.isArray(v);
	const pairs: StoreOrder['pairs'] = {};
	if (isRecord(r.pairs)) {
		for (const [store, map] of Object.entries(r.pairs)) {
			if (!isRecord(map)) continue;
			pairs[store] = Object.fromEntries(
				Object.entries(map)
					.filter((e): e is [string, number] => typeof e[1] === 'number' && e[1] > 0)
					.slice(0, MAX_PAIRS)
			);
		}
	}
	const trips: StoreOrder['trips'] = {};
	if (isRecord(r.trips)) {
		for (const [store, n] of Object.entries(r.trips)) {
			if (typeof n === 'number' && n >= 0) trips[store] = Math.floor(n);
		}
	}
	let trip: Trip | null = null;
	if (isRecord(r.trip) && typeof r.trip.store === 'string' && Array.isArray(r.trip.ticks)) {
		trip = {
			store: r.trip.store,
			ticks: r.trip.ticks
				.filter(
					(t): t is [string, string, number] =>
						Array.isArray(t) &&
						typeof t[0] === 'string' &&
						typeof t[1] === 'string' &&
						typeof t[2] === 'number'
				)
				.slice(0, MAX_TICKS)
		};
	}
	return { pairs, trips, trip, store: typeof r.store === 'string' ? r.store : '' };
}
