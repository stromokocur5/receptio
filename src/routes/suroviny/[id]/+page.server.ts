import { error } from '@sveltejs/kit';
import { getContent } from '$lib/server/content';
import type { EntryGenerator, PageServerLoad } from './$types';

export const entries: EntryGenerator = () => getContent().ingredients.map(({ id }) => ({ id }));

export const load: PageServerLoad = ({ params }) => {
	const content = getContent();
	const info = content.ingredientInfo.get(params.id);
	if (!info) error(404, 'Surovina neexistuje');
	return {
		info,
		swaps: content.ingredientSwaps.get(params.id) ?? [],
		grow: content.grow.find((g) => g.ingredientId === params.id) ?? null,
		notGrown: content.notGrown.find((n) => n.ingredientId === params.id) ?? null
	};
};
