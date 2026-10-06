import { describe, expect, it } from 'vitest';
import {
	compressHistory,
	ingredientTimeline,
	lowestPrice,
	parseCsv,
	priceChanges,
	priceOn,
	salesOn,
	toCsv,
	type HistoryRow
} from './price-history';

const row = (
	date: string,
	storeId: string,
	price: number,
	extra: Partial<HistoryRow> = {}
): HistoryRow => ({
	date,
	ingredientId: 'mrkva',
	storeId,
	product: 'Mrkva',
	pack: '1 kg',
	packGrams: 1000,
	price,
	...extra
});

describe('compressHistory', () => {
	it('keeps only the days a price changed, sales as their own series', () => {
		const history = compressHistory([
			row('2026-09-27', 'fresh', 1.15),
			row('2026-09-26', 'fresh', 1.15),
			row('2026-09-30', 'fresh', 1.19),
			row('2026-09-30', 'fresh', 0.69, { saleUntil: '2026-10-07' })
		]);
		expect(history.days).toEqual(['2026-09-26', '2026-09-27', '2026-09-30']);
		const [regular, sale] = history.series;
		expect(regular.changes).toEqual([
			['2026-09-26', 1.15, ''],
			['2026-09-30', 1.19, '']
		]);
		expect(regular.lastSeen).toBe('2026-09-30');
		expect(sale.sale).toBe(true);
		expect(priceOn(regular, '2026-09-28')).toBe(1.15);
		expect(priceOn(regular, '2026-10-01')).toBeNull();
		expect(priceOn(sale, '2026-09-30')).toBe(0.69);
	});
});

describe('ingredientTimeline', () => {
	it('gives the cheapest regular and sale price per shop and day, per litre for liquids', () => {
		const history = compressHistory([
			row('2026-09-26', 'billa', 1.59, { pack: '1 l', packGrams: 1030 }),
			row('2026-09-27', 'billa', 1.59, { pack: '1 l', packGrams: 1030 }),
			row('2026-09-27', 'billa', 1.39, { pack: '1 l', packGrams: 1030, saleUntil: '2026-10-06' })
		]);
		const timeline = ingredientTimeline(history, 'mrkva');
		expect(timeline.unit).toBe('l');
		expect(timeline.stores[0].regular).toEqual([1.59, 1.59]);
		expect(timeline.stores[0].sale).toEqual([null, 1.39]);
	});
});

describe('priceChanges and lowestPrice', () => {
	const history = compressHistory([
		row('2026-09-01', 'lidl', 1),
		row('2026-09-01', 'fresh', 1.2),
		row('2026-09-30', 'lidl', 1.1),
		row('2026-09-30', 'fresh', 1.2),
		row('2026-09-15', 'fresh', 0.6, { saleUntil: '2026-09-16' })
	]);

	it('compares each product with itself at both ends of the window', () => {
		const changes = priceChanges(history, ['lidl', 'fresh'], null);
		// Fresh didn't change, so only Lidl is listed.
		expect(changes).toHaveLength(1);
		expect(changes[0]).toMatchObject({ storeId: 'lidl', from: 1, to: 1.1 });
		expect(changes[0].change).toBeCloseTo(0.1);
		expect(priceChanges(history, ['lidl', 'fresh'], 7)).toEqual([]);
	});

	it('finds the lowest price including sales, with every shop tied at it', () => {
		expect(lowestPrice(history, 'mrkva', ['lidl', 'fresh'], 90)).toEqual({
			value: 0.6,
			unit: 'kg',
			stores: [{ storeId: 'fresh', day: '2026-09-15', sale: true }]
		});
		const tied = compressHistory([
			row('2026-09-01', 'lidl', 1.49),
			row('2026-09-02', 'billa', 1.49)
		]);
		expect(lowestPrice(tied, 'mrkva', ['lidl', 'billa'], 90)?.stores.map((s) => s.storeId)).toEqual(
			['lidl', 'billa']
		);
	});

	it('lists sales of a day with what they save against the shop’s own price', () => {
		expect(salesOn(history, '2026-09-15', ['fresh'])).toEqual([
			{ ingredientId: 'mrkva', storeId: 'fresh', salePerKg: 0.6, regularPerKg: 1.2 }
		]);
		expect(salesOn(history, '2026-09-17', ['fresh'])).toEqual([]);
	});
});

describe('CSV', () => {
	it('round-trips quoted fields', () => {
		const rows = [
			['date', 'product'],
			['2026-09-30', 'Šošovica, červená "bio"']
		];
		expect(parseCsv(toCsv(rows))).toEqual(rows);
		expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
			['a', 'b'],
			['1', '2']
		]);
	});
});
