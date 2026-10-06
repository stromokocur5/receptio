import { error, json } from '@sveltejs/kit';
import { communityStats } from '$lib/server/community';
import type { RequestHandler } from './$types';

export const prerender = false;

/** Public aggregate numbers, part of the open data (see /data/v1/openapi.json). */
export const GET: RequestHandler = async ({ platform, getClientAddress }) => {
	const env = platform?.env;
	if (!env?.DB) error(503, 'Nedostupné');
	const limit = await env.LIKE_LIMITER?.limit({ key: getClientAddress() });
	if (limit && !limit.success) error(429, 'Príliš veľa požiadaviek');
	try {
		return json(await communityStats(env.DB), {
			headers: {
				'access-control-allow-origin': '*',
				'cache-control': 'public, max-age=600'
			}
		});
	} catch (err) {
		console.error('community: stats failed', err);
		error(500, 'Štatistiky sa nepodarilo načítať');
	}
};
