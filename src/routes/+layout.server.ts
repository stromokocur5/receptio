import { getContent } from '$lib/server/content';
import type { LayoutServerLoad } from './$types';

export const prerender = true;

export const load: LayoutServerLoad = () => {
	const { ingredients, recipes, cuisines, stores, prices, wiki } = getContent();
	return {
		catalog: {
			ingredients,
			recipes,
			cuisines,
			stores,
			prices,
			wiki: wiki.map(({ html: _html, ...entry }) => entry),
			builtAt: new Date().toISOString().slice(0, 10)
		}
	};
};
