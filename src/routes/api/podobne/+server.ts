import { error, json } from '@sveltejs/kit';
import { similarRecipeIds, similarToRecipes } from '$lib/server/semantic';
import { MAX_SIMILAR_SEEDS, SIMILAR_SHOWN } from '$lib/similar';
import type { RequestHandler } from './$types';

export const prerender = false;

const MAX_QUERY = 200;
const RECIPE_ID = /^[a-z0-9-]{1,80}$/;

/**
 * Recipes nearest in meaning: to a typed wish (?q=) or to a few recipes (?ids=a,b) – the
 * search, "Podobné recepty", "Pre teba" and the leftovers page all ask here.
 */
export const GET: RequestHandler = async ({ platform, url, getClientAddress }) => {
	const env = platform?.env;
	if (!env?.AI || !env.RECIPE_INDEX) error(503, 'Nedostupné');
	const query = (url.searchParams.get('q') ?? '').trim().replace(/\s+/g, ' ');
	const ids = (url.searchParams.get('ids') ?? '').split(',').filter(Boolean);
	if (query && (query.length < 3 || query.length > MAX_QUERY)) error(400, 'Neplatná požiadavka');
	if (
		!query &&
		(!ids.length || ids.length > MAX_SIMILAR_SEEDS || !ids.every((id) => RECIPE_ID.test(id)))
	) {
		error(400, 'Neplatná požiadavka');
	}
	const limit = await env.SEMANTIC_LIMITER?.limit({ key: getClientAddress() });
	if (limit && !limit.success) error(429, 'Príliš veľa požiadaviek');
	// `wrangler types` declares the binding as the legacy VectorizeIndex; the index is V2.
	const index = env.RECIPE_INDEX as unknown as Vectorize;
	try {
		const found = query
			? (await similarRecipeIds(env.AI, index, query, SIMILAR_SHOWN)).map((m) => m.id)
			: await similarToRecipes(index, ids, SIMILAR_SHOWN);
		return json({ ids: found }, { headers: { 'cache-control': 'private, max-age=3600' } });
	} catch (err) {
		console.error('semantic: query failed', err);
		error(503, 'Nedostupné');
	}
};
