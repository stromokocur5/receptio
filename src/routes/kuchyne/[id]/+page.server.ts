import { error } from '@sveltejs/kit';
import { getContent } from '$lib/server/content';
import type { EntryGenerator, PageServerLoad } from './$types';

export const entries: EntryGenerator = () => getContent().cuisines.map(({ id }) => ({ id }));

export const load: PageServerLoad = ({ params }) => {
	const cuisine = getContent().cuisines.find((c) => c.id === params.id);
	if (!cuisine) error(404, 'Kuchyňa neexistuje');
	return { cuisine };
};
