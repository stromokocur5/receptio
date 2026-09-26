import { error, json } from '@sveltejs/kit';
import { likeCounts, likedBy, readDeviceId } from '$lib/server/likes';
import type { RequestHandler } from './$types';

export const prerender = false;

export const GET: RequestHandler = async ({ platform, cookies }) => {
	const db = platform?.env.DB;
	if (!db) error(503, 'Lajky nie sú dostupné');

	const deviceId = readDeviceId(cookies);
	try {
		const [counts, mine] = await Promise.all([
			likeCounts(db),
			deviceId ? likedBy(db, deviceId) : Promise.resolve([])
		]);
		return json({ counts, mine }, { headers: { 'cache-control': 'private, no-store' } });
	} catch (err) {
		console.error('likes: read failed', err);
		error(500, 'Nepodarilo sa načítať lajky');
	}
};
