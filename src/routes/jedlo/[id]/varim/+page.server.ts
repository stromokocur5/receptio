import { error } from '@sveltejs/kit';
import { FREE_DISH_ID } from '$lib/builder';
import { getContent } from '$lib/server/content';
import type { EntryGenerator, PageServerLoad } from './$types';

export const entries: EntryGenerator = () => [
	...getContent().dishes.map((d) => ({ id: d.id })),
	{ id: FREE_DISH_ID }
];

export const load: PageServerLoad = ({ params }) => {
	if (params.id !== FREE_DISH_ID && !getContent().dishes.some((d) => d.id === params.id))
		error(404, 'Také jedlo tu nie je');
};
