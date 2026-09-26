import { json } from '@sveltejs/kit';
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
		recipes,
		cuisines,
		stores,
		prices,
		wiki: wiki.map(({ html: _html, ...entry }) => entry),
		builtAt: new Date().toISOString().slice(0, 10)
	};
	return json(catalog);
};
