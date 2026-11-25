import type { CatalogPayload } from '$lib/catalog';
import type { LayoutLoad } from './$types';

export const prerender = true;

const EMPTY: CatalogPayload = { ingredients: [], parts: [], dishes: [], builtAt: '' };

export const load: LayoutLoad = async ({ fetch }) => {
	try {
		const res = await fetch('/catalog.json');
		if (!res.ok) throw new Error(`catalog.json: ${res.status}`);
		// Read through a clone: SvelteKit would otherwise inline the whole catalog into every page.
		return { catalog: (await res.clone().json()) as CatalogPayload };
	} catch (err) {
		// Only runtime-rendered pages (a 404) get here; they don't need the catalog.
		console.error('layout: catalog unavailable', err);
		return { catalog: EMPTY };
	}
};
