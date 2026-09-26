import { error, json } from '@sveltejs/kit';
import { getContent } from '$lib/server/content';
import { ensureDeviceId, readDeviceId, toggleLike, withinLikeLimits } from '$lib/server/likes';
import type { RequestHandler } from './$types';

export const prerender = false;

export const POST: RequestHandler = async ({
	request,
	params,
	platform,
	cookies,
	url,
	getClientAddress
}) => {
	// A like is a body-less POST, which browsers send cross-site without a preflight – so only
	// accept requests from our own pages.
	if (request.headers.get('origin') !== url.origin) error(403, 'Neplatná požiadavka');
	if (!getContent().recipeDetails.has(params.id)) error(404, 'Recept neexistuje');

	const env = platform?.env;
	if (!env?.DB) error(503, 'Lajky nie sú dostupné');

	const isNewDevice = readDeviceId(cookies) === null;
	if (!(await withinLikeLimits(env, getClientAddress(), isNewDevice))) {
		error(429, 'Príliš veľa lajkov naraz, skús to o chvíľu');
	}

	const deviceId = ensureDeviceId(cookies, url.protocol === 'https:');
	try {
		return json(await toggleLike(env.DB, params.id, deviceId), {
			headers: { 'cache-control': 'private, no-store' }
		});
	} catch (err) {
		console.error('likes: toggle failed', err);
		error(500, 'Nepodarilo sa uložiť lajk');
	}
};
