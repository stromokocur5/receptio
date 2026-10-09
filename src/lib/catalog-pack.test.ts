import { describe, expect, it } from 'vitest';
import {
	indexCatalog,
	packLine,
	packNutrients,
	packVariantLines,
	type CatalogPayload
} from './catalog';
import type { RecipeLine } from './types';

describe('catalog.json packing', () => {
	it('unpacks lines and nutrients to what they were, packed or not', () => {
		const n = {
			kcal: 100,
			protein: 5,
			carbs: 10,
			fat: 2,
			fiber: 1,
			salt: 0,
			iron: 1,
			calcium: 3,
			zinc: 0,
			ala: 0,
			b12: 0
		};
		const lines: RecipeLine[] = [
			{ ingredientId: 'ryza', grams: 200, amount: 1, unit: 'hrnček' },
			{ ingredientId: 'olej', grams: 30, amount: 2, unit: 'pl', notEaten: true },
			{ ingredientId: 'sol', grams: 0, amount: null, unit: null }
		];
		const variant = [lines[0], { ...lines[1], grams: 15 }];
		const recipe = {
			id: 'r',
			lines,
			perServing: n,
			variants: [{ name: 'V', lines: variant, perServing: n }]
		};
		const packed = {
			ingredients: [{ id: 'ryza', per100g: packNutrients(n) }],
			recipes: [
				{
					...recipe,
					lines: lines.map(packLine),
					perServing: packNutrients(n),
					variants: [
						{
							name: 'V',
							perServing: packNutrients(n),
							lines: packVariantLines(lines, variant).map((l) =>
								typeof l === 'number' ? l : packLine(l)
							)
						}
					]
				}
			],
			cuisines: [],
			stores: []
		} as unknown as CatalogPayload;
		const catalog = indexCatalog(packed);
		expect(catalog.recipes[0]).toEqual(recipe);
		expect(catalog.ingredients[0].per100g).toEqual(n);
		// Unpacking again (an already unpacked catalog) changes nothing.
		expect(indexCatalog(catalog as unknown as CatalogPayload).recipes[0]).toEqual(recipe);
	});
});
