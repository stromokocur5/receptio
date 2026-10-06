import { SEARCH_MISS_DAYS } from '$lib/retention';

/** Distinct terms kept at most; past it only terms already known are counted. */
export const MAX_SEARCH_MISSES = 2000;

/** Counts a search that found nothing; the term is already cleaned by cleanSearchTerm. */
export async function recordSearchMiss(db: D1Database, term: string, now = Date.now()) {
	const at = Math.floor(now / 1000);
	await db
		.prepare('DELETE FROM search_misses WHERE last_at < ?')
		.bind(at - SEARCH_MISS_DAYS * 86400)
		.run();
	const updated = await db
		.prepare('UPDATE search_misses SET count = count + 1, last_at = ? WHERE term = ?')
		.bind(at, term)
		.run();
	if (updated.meta.changes > 0) return;
	const rows = await db.prepare('SELECT COUNT(*) AS n FROM search_misses').first<{ n: number }>();
	if ((rows?.n ?? 0) >= MAX_SEARCH_MISSES) return;
	await db
		.prepare('INSERT OR IGNORE INTO search_misses (term, last_at) VALUES (?, ?)')
		.bind(term, at)
		.run();
}
