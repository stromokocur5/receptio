import type { CatalogPayload } from '$lib/catalog';
import type { LayoutLoad } from './$types';

export const prerender = true;

const EMPTY: CatalogPayload = {
	ingredients: [],
	recipes: [],
	cuisines: [],
	stores: [],
	prices: [],
	wiki: [],
	builtAt: new Date().toISOString().slice(0, 10)
};

export const load: LayoutLoad = async ({ fetch }) => {
	try {
		const res = await fetch('/catalog.json');
		if (!res.ok) throw new Error(`catalog.json: ${res.status}`);
		return { catalog: (await res.json()) as CatalogPayload };
	} catch (err) {
		// Only runtime-rendered pages (a 404) can get here; they don't need the catalog.
		console.error('layout: catalog unavailable', err);
		return { catalog: EMPTY };
	}
};
