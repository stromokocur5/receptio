import type { CatalogPayload } from '$lib/catalog';
import { getContent } from '$lib/server/content';
import type { RequestHandler } from './$types';

export const prerender = true;

/**
 * Everything list pages need, as one static file. The layout loads it once, so page data
 * files stay small instead of each repeating the whole catalog.
 */
export const GET: RequestHandler = () => {
	const { ingredients, recipes, cuisines, stores, prices, wiki } = getContent();
	const catalog: CatalogPayload = {
		ingredients,
		// Warnings, line notes and variant descriptions are only shown on a recipe's own page,
		// which loads the full recipe itself – no need to ship them with every page.
		recipes: recipes.map((r) => ({
			...r,
			warnings: [],
			lines: r.lines.map(({ note: _note, ...line }) => line),
			variants: r.variants.map((v) => ({
				...v,
				description: '',
				warnings: [],
				lines: v.lines.map(({ note: _note, ...line }) => line)
			}))
		})),
		cuisines,
		stores,
		prices,
		wiki: wiki.map(({ html: _html, ...entry }) => entry),
		builtAt: new Date().toISOString().slice(0, 10)
	};
	// Two decimals are plenty for grams, nutrients and prices, and much shorter.
	const body = JSON.stringify(catalog, (_key, value) =>
		typeof value === 'number' && !Number.isInteger(value) ? Math.round(value * 100) / 100 : value
	);
	return new Response(body, { headers: { 'content-type': 'application/json' } });
};
