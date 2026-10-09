import { describe, expect, it } from 'vitest';
import { storeStandings } from './pricing';
import type { PriceEntry, Store } from './types';

const today = new Date('2026-10-09');
const entry = (
	ingredientId: string,
	storeId: string,
	price: number,
	extra: Partial<PriceEntry> = {}
) =>
	({
		ingredientId,
		storeId,
		product: ingredientId,
		pack: '1 kg',
		packGrams: 1000,
		price,
		date: '2026-10-08',
		...extra
	}) as PriceEntry;
const stores: Store[] = [
	{ id: 'a', name: 'A', color: '#000' },
	{ id: 'b', name: 'B', color: '#000' },
	{ id: 'c', name: 'C', color: '#000' },
	{ id: 'e', name: 'E-shop', color: '#000', online: true }
];

describe('storeStandings', () => {
	it('ranks shops by how far they are from the cheapest, on regular prices', () => {
		const standings = storeStandings(
			[
				entry('ryza', 'a', 1),
				entry('ryza', 'b', 2),
				entry('ryza', 'c', 1.5),
				entry('tofu', 'a', 10),
				entry('tofu', 'b', 8),
				entry('tofu', 'c', 8),
				// A sale, an e-shop and a two-shop item don't count.
				entry('tofu', 'a', 1, { saleUntil: '2026-10-12' }),
				entry('tofu', 'e', 1),
				entry('cicer', 'a', 1),
				entry('cicer', 'b', 5)
			],
			stores,
			today
		);
		expect(standings.map((s) => s.storeId)).toEqual(['a', 'c', 'b']);
		expect(standings[0]).toEqual({ storeId: 'a', compared: 2, cheapest: 1, ratio: 1.125 });
		expect(standings.find((s) => s.storeId === 'c')!.cheapest).toBe(1);
	});
});
