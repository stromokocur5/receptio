import { describe, expect, it } from 'vitest';
import {
	foodCategories,
	packOf,
	prices,
	saleUntil,
	type KosikProduct
} from '../../scripts/sync-kosik';

const product = (over: Partial<KosikProduct> = {}): KosikProduct => ({
	id: 7832,
	name: 'Metro Chef Koriander',
	url: '/p7832-metro-chef-koriander',
	price: 2.59,
	recommendedPrice: 2.59,
	unit: 'ks',
	productQuantity: { value: 100, unit: 'g' },
	actionLabel: null,
	mainCategory: { name: 'Ovocie a zelenina' },
	...over
});

describe('foodCategories', () => {
	it('takes the second level under the food part of the menu', () => {
		const menu = [
			{
				name: 'Ovocie a zelenina',
				url: '/c2894-ovocie-a-zelenina',
				children: [
					{
						name: 'Zelenina',
						url: '/c2899-zelenina',
						children: [{ name: 'Koreňová', url: '/c2900-korenova' }]
					}
				]
			},
			{
				name: 'Drogéria a kozmetika',
				url: '/c5554-drogeria-a-kozmetika',
				children: [{ name: 'Pranie', url: '/c5555-pranie' }]
			}
		];
		expect(foodCategories(menu)).toEqual(['c2899-zelenina']);
	});
});

describe('packOf', () => {
	it('writes packs the way recipes do', () => {
		expect(packOf(product())).toBe('100 g');
		expect(packOf(product({ productQuantity: { value: 1000, unit: 'g' } }))).toBe('1 kg');
		expect(packOf(product({ productQuantity: { value: 1.04, unit: 'kg' } }))).toBe('1,04 kg');
		expect(packOf(product({ productQuantity: { value: 3, unit: 'ks' } }))).toBe('3 ks');
		expect(packOf(product({ unit: 'kg', productQuantity: null }))).toBe('1 kg');
	});

	it('gives up without a quantity', () => {
		expect(packOf(product({ productQuantity: null }))).toBeNull();
	});
});

describe('saleUntil', () => {
	it('reads the day and month and finds the year', () => {
		expect(saleUntil('Akcia platí do 20. 10.', '2026-10-17')).toBe('2026-10-20');
		expect(saleUntil('Akcia platí do 5. 1.', '2026-12-30')).toBe('2027-01-05');
		expect(saleUntil(null, '2026-10-17')).toBeUndefined();
	});
});

describe('prices', () => {
	it('counts a sale only with its end date', () => {
		const onSale = product({ price: 2.19, actionLabel: 'Akcia platí do 20. 10.' });
		expect(prices(onSale, '2026-10-17')).toEqual({
			regular: 2.59,
			promo: { price: 2.19, until: '2026-10-20' }
		});
		expect(prices(product({ price: 2.19 }), '2026-10-17')).toEqual({
			regular: 2.19,
			promo: undefined
		});
	});

	it('rounds prices of goods sold by weight to cents', () => {
		expect(prices(product({ price: 1.5225, recommendedPrice: 1.5225 }), '2026-10-17').regular).toBe(
			1.52
		);
	});
});
