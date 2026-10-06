import { error } from '@sveltejs/kit';
import { cleanSearchTerm } from '$lib/search-miss';
import { recordSearchMiss } from '$lib/server/searches';
import type { RequestHandler } from './$types';

export const prerender = false;

/** A search on /recepty that found nothing; see $lib/search-miss. */
export const POST: RequestHandler = async ({ platform, request, getClientAddress }) => {
	const env = platform?.env;
	if (!env?.DB) error(503, 'Nedostupné');
	const limit = await env.LIKE_LIMITER?.limit({ key: getClientAddress() });
	if (limit && !limit.success) error(429, 'Príliš veľa požiadaviek');
	if (!request.headers.get('content-type')?.startsWith('application/json')) {
		error(415, 'Neplatná požiadavka');
	}
	const text = await request.text();
	if (text.length > 300) error(413, 'Neplatná požiadavka');
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		error(400, 'Neplatná požiadavka');
	}
	const term =
		typeof raw === 'object' && raw !== null && 'term' in raw && typeof raw.term === 'string'
			? cleanSearchTerm(raw.term)
			: null;
	if (!term) error(400, 'Neplatná požiadavka');
	try {
		await recordSearchMiss(env.DB, term);
	} catch (err) {
		console.error('search: record failed', err);
		error(500, 'Nepodarilo sa uložiť');
	}
	return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
};
