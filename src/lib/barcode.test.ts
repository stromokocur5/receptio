import { describe, expect, it } from 'vitest';
import { isBarcode, lookupProduct, matchIngredients, parseQuantity } from './barcode';

describe('barcode to pantry', () => {
	it('reads pack sizes from labels', () => {
		expect(parseQuantity('400 g')).toBe(400);
		expect(parseQuantity('0,5 kg')).toBe(500);
		expect(parseQuantity('1 l')).toBe(1000);
		expect(parseQuantity('2 x 125 g')).toBe(250);
		expect(parseQuantity('6 ks')).toBeNull();
		expect(isBarcode('8586000123456')).toBe(true);
		expect(isBarcode('12345')).toBe(false);
	});

	it('finds the ingredient a product most likely is', () => {
		const ingredients = [
			{
				id: 'cicer-sterilizovany',
				name: 'Cícer sterilizovaný (scedený)',
				aliases: ['cícer z konzervy']
			},
			{ id: 'cicer-suchy', name: 'Cícer suchý' },
			{ id: 'ryza-basmati', name: 'Ryža basmati (suchá)' },
			{ id: 'sojove-mlieko', name: 'Sójové mlieko', aliases: ['sójový nápoj'] }
		];
		expect(
			matchIngredients(
				{ name: 'Cícer sterilizovaný 400 g', categories: ['chickpeas'] },
				ingredients
			)[0]
		).toBe('cicer-sterilizovany');
		expect(matchIngredients({ name: 'Alpro sójový nápoj', categories: [] }, ingredients)[0]).toBe(
			'sojove-mlieko'
		);
		expect(matchIngredients({ name: 'Čokoláda', categories: [] }, ingredients)).toEqual([]);
	});

	it('reads a product from Open Food Facts', async () => {
		const fetcher = async () =>
			new Response(
				JSON.stringify({
					status: 1,
					product: {
						product_name: 'Basmati Rice',
						product_name_sk: 'Ryža basmati',
						quantity: '1 kg',
						categories_tags: ['en:rices']
					}
				})
			);
		expect(await lookupProduct('8586000123456', fetcher as typeof fetch)).toEqual({
			code: '8586000123456',
			name: 'Ryža basmati',
			grams: 1000,
			categories: ['rices']
		});
		const missing = async () => new Response('{}', { status: 404 });
		expect(await lookupProduct('00000000', missing as typeof fetch)).toBeNull();
	});
});
