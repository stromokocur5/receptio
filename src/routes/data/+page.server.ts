import { API_BASE, LICENSE, RESOURCES } from '$lib/server/open-data';
import { getBasket, getBasketIndex } from '$lib/server/price-history';
import type { PageServerLoad } from './$types';

export const prerender = true;

/** What the open-data section documents: each resource with its columns and size. */
export const load: PageServerLoad = () => ({
	apiBase: API_BASE,
	license: LICENSE,
	resources: RESOURCES.map(({ rows, ...meta }) => ({ ...meta, count: rows().length })),
	basket: getBasket(),
	basketIndex: getBasketIndex()
});
