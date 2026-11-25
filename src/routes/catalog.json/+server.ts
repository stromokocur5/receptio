import { json } from '@sveltejs/kit';
import type { CatalogPayload } from '$lib/catalog';
import { getContent } from '$lib/server/content';

export const prerender = true;

export function GET() {
	const { ingredients, parts, dishes } = getContent();
	const payload: CatalogPayload = {
		ingredients: ingredients.map(
			({ id, name, aliases, category, group, groupFactor, staple, color, units, piece }) => ({
				id,
				name,
				...(aliases && { aliases }),
				category,
				group,
				groupFactor,
				staple,
				color,
				units,
				...(piece && { piece })
			})
		),
		parts,
		dishes,
		builtAt: new Date().toISOString().slice(0, 10)
	};
	return json(payload);
}
