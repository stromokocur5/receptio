import { error } from '@sveltejs/kit';
import { FREE_DISH_IDS } from '$lib/builder';
import { getContent } from '$lib/server/content';
import type { EntryGenerator, PageServerLoad } from './$types';

export const entries: EntryGenerator = () => [
	...getContent().dishes.map((d) => ({ id: d.id })),
	...Object.values(FREE_DISH_IDS).map((id) => ({ id }))
];

export const load: PageServerLoad = ({ params }) => {
	if (
		!Object.values(FREE_DISH_IDS).includes(params.id) &&
		!getContent().dishes.some((d) => d.id === params.id)
	)
		error(404, 'Také jedlo tu nie je');
};
