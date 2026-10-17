import { describe, expect, it } from 'vitest';
import { leafletWeek, packOf, prices } from '../../scripts/sync-billa';

type Product = Parameters<typeof prices>[0];

const product = (over: Partial<Product> = {}): Product => ({
	sku: '1',
	name: 'CVIKLA PRANÁ VOĽNÁ',
	amount: '1',
	volumeLabelShort: 'kg',
	weightArticle: true,
	slug: 'cvikla',
	parentCategories: [[{ slug: 'vegetables-2603', name: 'Vegetables' }]],
	price: { regular: { value: 149 } },
	...over
});

const inLeaflet = (...weeks: string[]) =>
	weeks.map((week) => [
		{ slug: 'leaflet-99000000', name: 'LEAFLET' },
		{ slug: week, name: week }
	]);

describe('leafletWeek', () => {
	it('runs from Wednesday to the next Tuesday', () => {
		// Billa's leaflet KW 42/2026 ran 14.–20. 10. 2026.
		expect(leafletWeek('kw-422026')).toEqual({ from: '2026-10-14', to: '2026-10-20' });
		expect(leafletWeek('kw-12027')).toEqual({ from: '2027-01-06', to: '2027-01-12' });
	});

	it('ignores other leaflet categories', () => {
		expect(leafletWeek('kw-422026-inside')).toBeNull();
	});
});

describe('prices', () => {
	const onSale = { crossed: 149, regular: { value: 69 } };

	it('counts a promo only while its leaflet runs', () => {
		const p = product({ price: onSale, parentCategories: inLeaflet('kw-422026') });
		expect(prices(p, '2026-10-17')).toEqual({
			regular: 1.49,
			promo: { price: 0.69, until: '2026-10-20' }
		});
		expect(prices(p, '2026-10-21')).toEqual({ regular: 1.49, promo: undefined });
	});

	it('follows back-to-back leaflets to the last day', () => {
		const p = product({ price: onSale, parentCategories: inLeaflet('kw-432026', 'kw-422026') });
		expect(prices(p, '2026-10-17').promo?.until).toBe('2026-10-27');
	});

	it('shows the crossed-out price before the leaflet starts', () => {
		const p = product({ price: onSale, parentCategories: inLeaflet('kw-432026') });
		expect(prices(p, '2026-10-17')).toEqual({ regular: 1.49, promo: undefined });
	});

	it('leaves out buy-two deals', () => {
		const p = product({
			price: { crossed: 149, regular: { value: 69, tags: ['pt-multi'] } },
			parentCategories: inLeaflet('kw-422026')
		});
		expect(prices(p, '2026-10-17').promo).toBeUndefined();
	});
});

describe('packOf', () => {
	it('writes packs the way recipes do', () => {
		expect(packOf(product({ amount: '1000', volumeLabelShort: 'g' }))).toBe('1 kg');
		expect(packOf(product({ amount: '1.5', volumeLabelShort: 'kg' }))).toBe('1,5 kg');
		expect(packOf(product({ amount: '240', volumeLabelShort: 'g' }))).toBe('240 g');
		expect(packOf(product({ amount: '1', volumeLabelShort: 'ks' }))).toBe('1 ks');
		expect(packOf(product({ amount: '48', volumeLabelShort: '' }))).toBeNull();
	});
});
