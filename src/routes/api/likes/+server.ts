import { error, json } from '@sveltejs/kit';
import { cookedStats, type CookedStats } from '$lib/server/feedback';
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
		// Cards work without it (e.g. before the rating migration is applied).
		let cooked: Record<string, CookedStats> = {};
		try {
			cooked = await cookedStats(db);
		} catch (err) {
			console.error('likes: cooked stats failed', err);
		}
		return json({ counts, mine, cooked }, { headers: { 'cache-control': 'private, no-store' } });
	} catch (err) {
		console.error('likes: read failed', err);
		error(500, 'Nepodarilo sa načítať lajky');
	}
};
