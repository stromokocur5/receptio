import { error } from '@sveltejs/kit';
import { getContent } from '$lib/server/content';
import type { EntryGenerator, PageServerLoad } from './$types';

export const entries: EntryGenerator = () =>
	[...getContent().recipeDetails.keys()].map((id) => ({ id }));

export const load: PageServerLoad = ({ params }) => {
	const recipe = getContent().recipeDetails.get(params.id);
	if (!recipe) error(404, 'Recept neexistuje');
	return { recipe };
};
