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
	equipment: [],
	builtAt: new Date().toISOString().slice(0, 10)
};

export const load: LayoutLoad = async ({ fetch }) => {
	try {
		const res = await fetch('/catalog.json');
		if (!res.ok) throw new Error(`catalog.json: ${res.status}`);
		// SvelteKit inlines every response read through load's fetch into the HTML – the whole
		// catalog on every prerendered page. A clone isn't tracked, so pages stay small and the
		// browser fetches /catalog.json once (then from cache) while hydrating.
		return { catalog: (await res.clone().json()) as CatalogPayload };
	} catch (err) {
		// Only runtime-rendered pages (a 404) can get here; they don't need the catalog.
		console.error('layout: catalog unavailable', err);
		return { catalog: EMPTY };
	}
};
