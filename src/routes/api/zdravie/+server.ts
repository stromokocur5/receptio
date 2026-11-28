import { error, json } from '@sveltejs/kit';
import { readHealth } from '$lib/server/health';
import type { RequestHandler } from './$types';

export const prerender = false;

/** Whether the last cron check found the API answering; the admin's service worker asks it. */
export const GET: RequestHandler = async ({ platform }) => {
	const db = platform?.env.DB;
	if (!db) error(503, 'Nedostupné');
	try {
		return json(await readHealth(db), { headers: { 'cache-control': 'no-store' } });
	} catch (err) {
		console.error('health: read failed', err);
		error(500, 'Nedostupné');
	}
};
