import type { DishCatalogPayload } from '$lib/dish-catalog';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ fetch }) => {
	const res = await fetch('/dishes.json');
	if (!res.ok) throw new Error(`dishes.json: ${res.status}`);
	// Read through a clone: SvelteKit would otherwise inline all parts and dishes into every page.
	return { dishes: (await res.clone().json()) as DishCatalogPayload };
};
