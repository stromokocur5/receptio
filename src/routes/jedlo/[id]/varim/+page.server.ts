import { error } from '@sveltejs/kit';
import { getContent } from '$lib/server/content';
import type { EntryGenerator, PageServerLoad } from './$types';

export const entries: EntryGenerator = () => getContent().dishes.map((d) => ({ id: d.id }));

export const load: PageServerLoad = ({ params }) => {
	if (!getContent().dishes.some((d) => d.id === params.id)) error(404, 'Také jedlo tu nie je');
};
