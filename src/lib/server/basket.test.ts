import { describe, expect, it } from 'vitest';
import { getBasket, getPriceHistory } from './price-history';

describe('content/kosik.yaml', () => {
	it('names known ingredients that shops report daily', () => {
		const basket = getBasket();
		const daily = new Set(
			getPriceHistory()
				.series.filter((s) => !s.sale)
				.map((s) => s.ingredientId)
		);
		expect(basket.items.length).toBeGreaterThan(5);
		expect(basket.items.filter((i) => !daily.has(i.ingredientId))).toEqual([]);
	});
});
