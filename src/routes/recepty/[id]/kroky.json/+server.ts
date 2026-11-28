import { error, json } from '@sveltejs/kit';
import { getContent } from '$lib/server/content';
import type { EntryGenerator, RequestHandler } from './$types';

export const prerender = true;

export const entries: EntryGenerator = () =>
	[...getContent().recipeDetails.keys()].map((id) => ({ id }));

/** Steps for cooking several recipes at once, where only the catalog summary is loaded. */
export const GET: RequestHandler = ({ params }) => {
	const recipe = getContent().recipeDetails.get(params.id);
	if (!recipe) error(404, 'Recept neexistuje');
	const variants = Object.fromEntries(
		recipe.variants.flatMap((v) => (v.steps ? [[v.name, v.steps]] : []))
	);
	return json({ steps: recipe.steps, variants });
};
