import { describe, expect, it } from 'vitest';
import { readProduct } from '../../scripts/sync-eshops';

const jsonLd = (offers: object) =>
	`<script type="application/ld+json">${JSON.stringify({
		'@context': 'https://schema.org',
		'@graph': [{ '@type': 'Product', name: 'Cícer 1000 g', brand: { name: 'GRIZLY' }, offers }]
	})}</script>`;

describe('readProduct', () => {
	it('reads the price from schema.org JSON-LD', () => {
		const html = jsonLd({
			price: 3.49,
			priceCurrency: 'EUR',
			availability: 'https://schema.org/InStock'
		});
		expect(readProduct(html)).toEqual({ name: 'GRIZLY Cícer 1000 g', price: 3.49 });
	});

	it('refuses sold-out products and other currencies', () => {
		expect(
			readProduct(
				jsonLd({ price: 3, priceCurrency: 'EUR', availability: 'https://schema.org/OutOfStock' })
			)
		).toBe('not in stock');
		expect(readProduct(jsonLd({ price: 80, priceCurrency: 'CZK' }))).toBe('price is in CZK');
	});

	it('reads microdata only when the page has a single price', () => {
		const one =
			'<h1 itemprop="name"> Kala namak 100 g </h1><meta itemprop="priceCurrency" content="EUR">' +
			'<meta itemprop="price" content="1.62"><link itemprop="availability" href="http://schema.org/InStock">';
		expect(readProduct(one)).toEqual({ name: 'Kala namak 100 g', price: 1.62 });
		expect(readProduct(one + '<meta itemprop="price" content="9.37">')).toBe(
			'several prices on the page (variants)'
		);
	});

	it('falls back to the price element and the page title', () => {
		const html =
			'<title>Miso pasta 500 g | Obchod</title>' +
			'<span id="product-detail-price-value" class="akcia-cena">5,95 €</span>';
		expect(readProduct(html)).toEqual({ name: 'Miso pasta 500 g', price: 5.95 });
		expect(readProduct('<p>nič</p>')).toBe('no price data on the page');
	});
});
