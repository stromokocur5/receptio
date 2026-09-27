import { error, json } from '@sveltejs/kit';
import { getContent } from '$lib/server/content';
import type { EntryGenerator, RequestHandler } from './$types';

export const prerender = true;

export const entries: EntryGenerator = () => getContent().wiki.map(({ slug }) => ({ slug }));

/** A guide's body for the cooking screen, which shows it without leaving the recipe. */
export const GET: RequestHandler = ({ params }) => {
	const page = getContent().wiki.find((w) => w.slug === params.slug);
	if (!page) error(404, 'Návod neexistuje');
	return json({ title: page.title, html: page.html });
};
