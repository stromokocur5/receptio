import { error, json } from '@sveltejs/kit';
import { similarRecipeIds } from '$lib/server/semantic';
import type { RequestHandler } from './$types';

export const prerender = false;

const MAX_QUERY = 200;
const SHOWN = 8;

/** Recipes nearest in meaning to a typed wish, for /recepty when the words find nothing. */
export const GET: RequestHandler = async ({ platform, url, getClientAddress }) => {
	const env = platform?.env;
	if (!env?.AI || !env.RECIPE_INDEX) error(503, 'Nedostupné');
	const query = (url.searchParams.get('q') ?? '').trim().replace(/\s+/g, ' ');
	if (query.length < 3 || query.length > MAX_QUERY) error(400, 'Neplatná požiadavka');
	const limit = await env.SEMANTIC_LIMITER?.limit({ key: getClientAddress() });
	if (limit && !limit.success) error(429, 'Príliš veľa požiadaviek');
	try {
		const matches = await similarRecipeIds(env.AI, env.RECIPE_INDEX, query, SHOWN);
		return json(
			{ ids: matches.map((m) => m.id) },
			{ headers: { 'cache-control': 'private, max-age=3600' } }
		);
	} catch (err) {
		console.error('semantic: query failed', err);
		error(503, 'Nedostupné');
	}
};
