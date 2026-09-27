import { getContent } from '$lib/server/content';
import { SITE_ORIGIN } from '$lib/site';
import type { RequestHandler } from './$types';

export const prerender = true;

const STATIC_PAGES = [
	'/',
	'/recepty',
	'/kuchyne',
	'/spajza',
	'/plan',
	'/ceny',
	'/wiki',
	'/vybavenie',
	'/sezona',
	'/pestuj',
	'/zvysky',
	'/navrhni'
];

export const GET: RequestHandler = () => {
	const { recipeDetails, cuisines, wiki, ingredients, equipment } = getContent();
	const paths = [
		...STATIC_PAGES,
		...[...recipeDetails.keys()].map((id) => `/recepty/${id}`),
		...cuisines.map((c) => `/kuchyne/${c.id}`),
		...wiki.map((w) => `/wiki/${w.slug}`),
		'/suroviny',
		...ingredients.filter((i) => i.id !== 'voda').map((i) => `/suroviny/${i.id}`),
		...equipment.map((e) => `/vybavenie/${e.id}`)
	];
	const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((p) => `\t<url><loc>${SITE_ORIGIN}${p}</loc></url>`).join('\n')}
</urlset>
`;
	return new Response(body, { headers: { 'content-type': 'application/xml' } });
};
