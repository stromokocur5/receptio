import { error } from '@sveltejs/kit';
import { getContent } from '$lib/server/content';
import type { EntryGenerator, PageServerLoad } from './$types';

export const entries: EntryGenerator = () => getContent().wiki.map(({ slug }) => ({ slug }));

export const load: PageServerLoad = ({ params }) => {
	const page = getContent().wiki.find((w) => w.slug === params.slug);
	if (!page) error(404, 'Stránka neexistuje');
	return { page };
};
