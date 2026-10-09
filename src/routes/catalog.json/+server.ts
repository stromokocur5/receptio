import { packLine, packNutrients, packVariantLines, type CatalogPayload } from '$lib/catalog';
import type { Nutrients, RecipeLine } from '$lib/types';
import { getContent } from '$lib/server/content';
import type { RequestHandler } from './$types';

export const prerender = true;

/**
 * Everything list pages need, as one static file. The layout loads it once, so page data
 * files stay small instead of each repeating the whole catalog.
 */
export const GET: RequestHandler = () => {
	const { ingredients, recipes, cuisines, stores, prices, wiki, equipment } = getContent();
	// Lines and nutrients go as lists instead of objects; indexCatalog unpacks them.
	const catalog: CatalogPayload = {
		ingredients: ingredients.map((i) => ({
			...i,
			per100g: packNutrients(i.per100g) as unknown as Nutrients
		})),
		// Warnings, line notes and variant descriptions are only shown on a recipe's own page,
		// which loads the full recipe itself – no need to ship them with every page.
		recipes: recipes.map((r) => ({
			...r,
			warnings: [],
			lines: r.lines.map(packLine) as unknown as RecipeLine[],
			perServing: packNutrients(r.perServing) as unknown as Nutrients,
			variants: r.variants.map((v) => ({
				...v,
				description: '',
				warnings: [],
				perServing: packNutrients(v.perServing) as unknown as Nutrients,
				lines: packVariantLines(r.lines, v.lines).map((l) =>
					typeof l === 'number' ? l : packLine(l)
				) as unknown as RecipeLine[]
			}))
		})),
		cuisines,
		stores,
		prices,
		wiki: wiki.map(({ html: _html, ...entry }) => entry),
		equipment: equipment.map(({ id, name, level }) => ({ id, name, level })),
		builtAt: new Date().toISOString().slice(0, 10)
	};
	// Two decimals are plenty for grams, nutrients and prices, and much shorter.
	const body = JSON.stringify(catalog, (_key, value) =>
		typeof value === 'number' && !Number.isInteger(value) ? Math.round(value * 100) / 100 : value
	);
	return new Response(body, { headers: { 'content-type': 'application/json' } });
};
