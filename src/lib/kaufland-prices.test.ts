import { describe, expect, it } from 'vitest';
import {
	packOf,
	prices,
	productName,
	readOffers,
	type KauflandOffer
} from '../../scripts/sync-kaufland';

const offer = (over: Partial<KauflandOffer> = {}): KauflandOffer => ({
	offerId: '1',
	dateFrom: '2026-10-15',
	dateTo: '2026-10-21',
	title: 'Pomaranče',
	subtitle: '',
	price: 1.19,
	unit: '1 kg',
	label: 'reducedPrice',
	formattedOldPrice: '1,99',
	...over
});

describe('readOffers', () => {
	it('reads the offers out of the page script', () => {
		const data = {
			component: 'OfferTemplate',
			props: {
				offerData: {
					cycles: [{ categories: [{ displayName: 'Ovocie', offers: [offer()] }] }]
				}
			}
		};
		const html = `<script>window.SSR = window.SSR || {}; window.SSR['x'] = ${JSON.stringify(data)};</script>`;
		expect(readOffers(html)).toEqual([{ category: 'Ovocie', offer: offer() }]);
	});
});

describe('productName', () => {
	it('joins brand and product and drops the extra lines', () => {
		expect(productName(offer({ title: 'Z lásky k tradícii', subtitle: 'Cibuľa žltá\nSK' }))).toBe(
			'Z lásky k tradícii Cibuľa žltá'
		);
	});
});

describe('packOf', () => {
	it('writes packs the way recipes do', () => {
		expect(packOf('5 kg balenie')).toBe('5 kg');
		expect(packOf('125 g balenie')).toBe('125 g');
		expect(packOf('cena za 1 kg')).toBe('1 kg');
		expect(packOf('1 kus')).toBe('1 ks');
		expect(packOf('4 x 100 g')).toBe('400 g');
		expect(packOf('3 x 200 ml')).toBe('600 ml');
		expect(packOf('1000 g')).toBe('1 kg');
		expect(packOf('0,33 l')).toBe('0,33 l');
	});

	it('gives up on ranges and bunches', () => {
		expect(packOf('82 - 97 g')).toBeNull();
		expect(packOf('1 zväzok')).toBeNull();
		expect(packOf(undefined)).toBeNull();
	});
});

describe('prices', () => {
	it('counts the offer price only between its dates', () => {
		expect(prices(offer(), '2026-10-17')).toEqual({
			regular: 1.99,
			promo: { price: 1.19, until: '2026-10-21' }
		});
		expect(prices(offer({ dateFrom: '2026-10-18' }), '2026-10-17')).toEqual({
			regular: 1.99,
			promo: undefined
		});
	});

	it('takes an offer without a crossed-out price as the regular price while it runs', () => {
		expect(prices(offer({ formattedOldPrice: undefined }), '2026-10-17')).toEqual({
			regular: 1.19,
			promo: undefined
		});
		expect(prices(offer({ formattedOldPrice: undefined }), '2026-10-22')).toBeNull();
	});

	it('leaves out buy-two-for-one', () => {
		expect(prices(offer({ label: 'halfPrice' }), '2026-10-17')).toBeNull();
	});
});
