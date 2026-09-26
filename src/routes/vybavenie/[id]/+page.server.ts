import { error } from '@sveltejs/kit';
import { getContent } from '$lib/server/content';
import type { EntryGenerator, PageServerLoad } from './$types';

export const entries: EntryGenerator = () => getContent().equipment.map(({ id }) => ({ id }));

export const load: PageServerLoad = ({ params }) => {
	const tool = getContent().equipment.find((e) => e.id === params.id);
	if (!tool) error(404, 'Takéto vybavenie nepoznáme');
	return { tool };
};
