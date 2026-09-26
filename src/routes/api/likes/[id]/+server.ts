import { error, json } from '@sveltejs/kit';
import { getContent } from '$lib/server/content';
import { ensureDeviceId, toggleLike } from '$lib/server/likes';
import type { RequestHandler } from './$types';

export const prerender = false;

export const POST: RequestHandler = async ({ params, platform, cookies, url }) => {
	if (!getContent().recipeDetails.has(params.id)) error(404, 'Recept neexistuje');

	const db = platform?.env.DB;
	if (!db) error(503, 'Lajky nie sú dostupné');

	const deviceId = ensureDeviceId(cookies, url.protocol === 'https:');
	try {
		return json(await toggleLike(db, params.id, deviceId), {
			headers: { 'cache-control': 'private, no-store' }
		});
	} catch (err) {
		console.error('likes: toggle failed', err);
		error(500, 'Nepodarilo sa uložiť lajk');
	}
};
