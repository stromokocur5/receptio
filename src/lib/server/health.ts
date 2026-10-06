import { sendPush } from './push';

/**
 * Health check run by the cron: asks the app's own API whether it answers, remembers since when
 * it fails and pushes the admin once per outage. Relative imports only – bundled by wrangler.
 */

/** API routes that must answer; GET only, so the check never writes anything. */
export const HEALTH_PATHS = ['/api/likes'];
const ORIGIN = 'https://receptio.kohut.xyz';

export interface HealthState {
	ok: boolean;
	/** Unix seconds the current outage started. */
	since: number | null;
	error: string | null;
	checkedAt: number | null;
}

interface HealthRow {
	failing_since: number | null;
	last_error: string | null;
	checked_at: number;
	alerted_at: number | null;
}

export async function readHealth(db: D1Database): Promise<HealthState> {
	const row = await db
		.prepare('SELECT failing_since, last_error, checked_at FROM health WHERE id = 1')
		.first<HealthRow>();
	return {
		ok: !row?.failing_since,
		since: row?.failing_since ?? null,
		error: row?.last_error ?? null,
		checkedAt: row?.checked_at ?? null
	};
}

/** Runs the requests through the app in-process; returns what failed, or null when all is fine. */
export async function probe(
	handle: (request: Request) => Promise<Response>
): Promise<string | null> {
	for (const path of HEALTH_PATHS) {
		try {
			const res = await handle(new Request(`${ORIGIN}${path}`));
			if (res.status >= 500) return `${path}: ${res.status}`;
		} catch (err) {
			return `${path}: ${err instanceof Error ? err.message : 'výnimka'}`.slice(0, 200);
		}
	}
	return null;
}

export async function checkHealth(
	db: D1Database,
	handle: (request: Request) => Promise<Response>,
	privateJwkJson: string | undefined,
	now = Date.now()
): Promise<void> {
	const at = Math.floor(now / 1000);
	const failure = await probe(handle);
	const row = await db
		.prepare('SELECT failing_since, last_error, checked_at, alerted_at FROM health WHERE id = 1')
		.first<HealthRow>();
	if (!failure) {
		await db
			.prepare(
				'INSERT INTO health (id, failing_since, last_error, checked_at, alerted_at) VALUES (1, NULL, NULL, ?, NULL) ON CONFLICT (id) DO UPDATE SET failing_since = NULL, last_error = NULL, checked_at = excluded.checked_at, alerted_at = NULL'
			)
			.bind(at)
			.run();
		if (row?.failing_since) console.log('health: back to normal');
		return;
	}
	console.error(`health: ${failure}`);
	const since = row?.failing_since ?? at;
	const alert = !row?.alerted_at && privateJwkJson;
	await db
		.prepare(
			'INSERT INTO health (id, failing_since, last_error, checked_at, alerted_at) VALUES (1, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET failing_since = excluded.failing_since, last_error = excluded.last_error, checked_at = excluded.checked_at, alerted_at = excluded.alerted_at'
		)
		.bind(since, failure, at, alert ? at : (row?.alerted_at ?? null))
		.run();
	if (!alert) return;
	const { results } = await db
		.prepare('SELECT endpoint FROM admin_alerts LIMIT 3')
		.all<{ endpoint: string }>();
	const jwk = JSON.parse(privateJwkJson) as JsonWebKey;
	await Promise.all(results.map((r) => sendPush(r.endpoint, jwk, now)));
}
