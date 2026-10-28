/** Seeds at most in one "recipes like these" request. */
export const MAX_SIMILAR_SEEDS = 6;
/** Recipes one request returns. */
export const SIMILAR_SHOWN = 12;

const answered = new Map<string, Promise<string[]>>();

/**
 * Recipe ids nearest in meaning (search by meaning, /api/podobne), to a typed wish or to a few
 * recipes. Answers are kept for the visit; on any failure the list is empty and the page keeps
 * what it shows without it.
 */
export function fetchSimilar(by: { q: string } | { ids: string[] }): Promise<string[]> {
	const params =
		'q' in by
			? new URLSearchParams({ q: by.q.trim() })
			: new URLSearchParams({ ids: by.ids.slice(0, MAX_SIMILAR_SEEDS).join(',') });
	const url = `/api/podobne?${params}`;
	let answer = answered.get(url);
	if (!answer) {
		answer = fetch(url)
			.then((r) => (r.ok ? (r.json() as Promise<{ ids: string[] }>) : { ids: [] }))
			.then((r) => (Array.isArray(r.ids) ? r.ids.filter((id) => typeof id === 'string') : []))
			.catch(() => []);
		answered.set(url, answer);
		// A failure isn't kept, so the next look asks again.
		void answer.then((ids) => ids.length || answered.delete(url));
	}
	return answer;
}
