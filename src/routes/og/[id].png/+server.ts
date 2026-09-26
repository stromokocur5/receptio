import { error } from '@sveltejs/kit';
import { Resvg } from '@resvg/resvg-js';
import { recipeOgSvg, siteOgSvg, type OgPlate } from '$lib/og';
import { getContent } from '$lib/server/content';
import type { EntryGenerator, RequestHandler } from './$types';

// Rendered once at build time; the native renderer never ships in the Worker.
export const prerender = true;

const SITE_ID = 'receptio';
const SITE_PLATES = ['pad-thai', 'chana-masala', 'buddha-bowl'];

export const entries: EntryGenerator = () => [
	{ id: SITE_ID },
	...[...getContent().recipeDetails.keys()].map((id) => ({ id }))
];

export const GET: RequestHandler = ({ params }) => {
	const content = getContent();
	const byId = new Map(content.ingredients.map((i) => [i.id, i]));

	let svg: string;
	if (params.id === SITE_ID) {
		const plates = SITE_PLATES.map(
			(id, i) => content.recipeDetails.get(id) ?? content.recipes[i]
		).map((r): OgPlate => ({ seed: r.id, lines: r.lines })) as [OgPlate, OgPlate, OgPlate];
		svg = siteOgSvg(plates, byId);
	} else {
		const recipe = content.recipeDetails.get(params.id);
		if (!recipe) error(404, 'Recept neexistuje');
		const accent = content.cuisines.find((c) => c.id === recipe.cuisine)?.color ?? '#6fa35a';
		svg = recipeOgSvg({ seed: recipe.id, lines: recipe.lines }, byId, accent);
	}

	const png = new Resvg(svg, { font: { loadSystemFonts: false } }).render().asPng();
	return new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png' } });
};
