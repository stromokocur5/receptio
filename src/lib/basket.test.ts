import { describe, expect, it } from 'vitest';
import { basketIndex, typicalPerKg } from './basket';
import { compressHistory, type HistoryRow } from './price-history';

const row = (
	date: string,
	ingredientId: string,
	storeId: string,
	price: number,
	extra: Partial<HistoryRow> = {}
): HistoryRow => ({
	date,
	ingredientId,
	storeId,
	product: ingredientId,
	pack: '1 kg',
	packGrams: 1000,
	price,
	...extra
});

describe('basket index', () => {
	const history = compressHistory([
		row('2026-10-01', 'mrkva', 'lidl', 1),
		row('2026-10-01', 'mrkva', 'billa', 1.2),
		row('2026-10-01', 'mrkva', 'fresh', 2),
		row('2026-10-01', 'mrkva', 'fresh', 0.5, { saleUntil: '2026-10-09' }),
		row('2026-10-01', 'chlieb', 'lidl', 2),
		row('2026-10-02', 'mrkva', 'lidl', 1),
		row('2026-10-02', 'mrkva', 'billa', 1.5),
		row('2026-10-02', 'mrkva', 'fresh', 2),
		// No bread on the 2nd: the last price carries over.
		row('2026-10-03', 'zemiaky', 'eshop', 1)
	]);
	const shops = ['lidl', 'billa', 'fresh'];

	it('takes the median of each shop’s regular price, sales left out', () => {
		expect(typicalPerKg(history, 'mrkva', shops, '2026-10-01')).toBe(1.2);
		expect(typicalPerKg(history, 'mrkva', shops, '2026-10-02')).toBe(1.5);
	});

	it('indexes the basket to the first full day and carries a missing price for a while', () => {
		const days = basketIndex(
			history,
			{
				version: 1,
				items: [
					{ ingredientId: 'mrkva', grams: 2000 },
					{ ingredientId: 'chlieb', grams: 500 }
				]
			},
			shops
		);
		expect(days).toEqual([
			{ date: '2026-10-01', cost: 3.4, index: 100, carried: 0 },
			{ date: '2026-10-02', cost: 4, index: 117.6, carried: 1 }
		]);
	});
});
