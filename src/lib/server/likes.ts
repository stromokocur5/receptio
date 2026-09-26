import type { Cookies } from '@sveltejs/kit';

const DEVICE_COOKIE = 'rid';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TWO_YEARS = 60 * 60 * 24 * 730;

export function readDeviceId(cookies: Cookies): string | null {
	const id = cookies.get(DEVICE_COOKIE);
	return id && UUID_RE.test(id) ? id : null;
}

export function ensureDeviceId(cookies: Cookies, secure: boolean): string {
	const existing = readDeviceId(cookies);
	if (existing) return existing;
	const id = crypto.randomUUID();
	cookies.set(DEVICE_COOKIE, id, {
		path: '/api',
		httpOnly: true,
		sameSite: 'lax',
		secure,
		maxAge: TWO_YEARS
	});
	return id;
}

export async function likeCounts(db: D1Database): Promise<Record<string, number>> {
	const { results } = await db
		.prepare('SELECT recipe_id, COUNT(*) AS n FROM likes GROUP BY recipe_id')
		.all<{ recipe_id: string; n: number }>();
	return Object.fromEntries(results.map((r) => [r.recipe_id, r.n]));
}

export async function likedBy(db: D1Database, deviceId: string): Promise<string[]> {
	const { results } = await db
		.prepare('SELECT recipe_id FROM likes WHERE device_id = ?')
		.bind(deviceId)
		.all<{ recipe_id: string }>();
	return results.map((r) => r.recipe_id);
}

/** Toggles the like and returns the new state with the recipe's total. */
export async function toggleLike(
	db: D1Database,
	recipeId: string,
	deviceId: string
): Promise<{ liked: boolean; count: number }> {
	const removed = await db
		.prepare('DELETE FROM likes WHERE recipe_id = ? AND device_id = ?')
		.bind(recipeId, deviceId)
		.run();
	const liked = removed.meta.changes === 0;
	if (liked) {
		await db
			.prepare('INSERT OR IGNORE INTO likes (recipe_id, device_id) VALUES (?, ?)')
			.bind(recipeId, deviceId)
			.run();
	}
	const row = await db
		.prepare('SELECT COUNT(*) AS n FROM likes WHERE recipe_id = ?')
		.bind(recipeId)
		.first<{ n: number }>();
	return { liked, count: row?.n ?? 0 };
}
