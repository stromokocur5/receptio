import { z } from 'zod';
import {
	isDue,
	isPushEndpoint,
	isValidSchedule,
	isValidTimeZone,
	localClock,
	VAPID_PUBLIC_KEY,
	type ReminderSchedule
} from '../push';
import { PUSH_IDLE_DAYS } from '../retention';

/**
 * Server side of water reminders. Relative imports only: the cron handler in /worker.js is
 * bundled by wrangler, which doesn't know SvelteKit's `$lib` alias.
 */

/** Reminder devices across everyone – a flood guard far above real use. */
export const MAX_REMINDERS = 5000;
/** Workers on the free plan may make 50 outgoing requests per run. */
const MAX_SENDS_PER_RUN = 45;
const CONTACT = 'mailto:gabriel@kohut.xyz';

export const reminderIdSchema = z.string().regex(/^[0-9a-f]{32}$/);

const scheduleShape = {
	from: z.number().int(),
	to: z.number().int(),
	every: z.number().int(),
	tz: z.string().max(64).refine(isValidTimeZone),
	endpoint: z.string().max(1000).refine(isPushEndpoint)
};

export const reminderCreateSchema = z
	.object(scheduleShape)
	.strict()
	.refine(isValidSchedule, 'Neplatný čas');

export const reminderUpdateSchema = z
	.object({
		token: z.string().regex(/^[0-9a-f]{64}$/),
		...scheduleShape,
		/** Local date on which the water goal was met – no more reminders that day. */
		skipDate: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/)
			.nullable()
	})
	.strict()
	.refine(isValidSchedule, 'Neplatný čas');

/** Body of a delete or a test push: only the device's token. */
export const reminderTokenSchema = z.object({ token: z.string().regex(/^[0-9a-f]{64}$/) }).strict();

interface ReminderRow {
	id: string;
	endpoint: string;
	from_min: number;
	to_min: number;
	every_min: number;
	tz: string;
	skip_date: string | null;
}

const b64url = (bytes: Uint8Array) =>
	btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
const utf8 = (text: string) => new TextEncoder().encode(text);

/** RFC 8292 `Authorization` header for one push service, signed with the VAPID private key. */
export async function vapidAuthorization(
	endpoint: string,
	privateJwk: JsonWebKey,
	now: number
): Promise<string> {
	const { kty, crv, d, x, y } = privateJwk;
	const key = await crypto.subtle.importKey(
		'jwk',
		{ kty, crv, d, x, y },
		{ name: 'ECDSA', namedCurve: 'P-256' },
		false,
		['sign']
	);
	const header = b64url(utf8(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
	const claims = b64url(
		utf8(
			JSON.stringify({
				aud: new URL(endpoint).origin,
				exp: Math.floor(now / 1000) + 12 * 3600,
				sub: CONTACT
			})
		)
	);
	// WebCrypto signs ECDSA as raw r‖s, which is exactly what JWS ES256 wants.
	const signature = new Uint8Array(
		await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8(`${header}.${claims}`))
	);
	return `vapid t=${header}.${claims}.${b64url(signature)}, k=${VAPID_PUBLIC_KEY}`;
}

/** Rows whose reminder falls on this quarter hour in their own time zone. */
export function dueReminders(rows: ReminderRow[], at: Date): ReminderRow[] {
	return rows.filter((row) => {
		const schedule = {
			from: row.from_min,
			to: row.to_min,
			every: row.every_min
		} as ReminderSchedule;
		const clock = localClock(at, row.tz);
		return clock.date !== row.skip_date && isDue(schedule, clock.minute);
	});
}

/**
 * One empty push; returns the push service's status, 0 when it couldn't be reached.
 * 404/410 mean the browser dropped the subscription.
 */
async function sendPush(endpoint: string, privateJwk: JsonWebKey, now: number): Promise<number> {
	try {
		const res = await fetch(endpoint, {
			method: 'POST',
			headers: {
				authorization: await vapidAuthorization(endpoint, privateJwk, now),
				// A reminder that waited over an hour on an offline phone is worthless.
				ttl: '3600',
				// Android holds normal-urgency pushes in Doze until its next maintenance window.
				urgency: 'high',
				'content-length': '0'
			}
		});
		if (!res.ok && res.status !== 404 && res.status !== 410) {
			console.error(
				`push: ${res.status} from ${new URL(endpoint).host}: ${(await res.text()).slice(0, 200)}`
			);
		}
		return res.status;
	} catch (err) {
		console.error('push: send failed', err);
		return 0;
	}
}

/** Cron job: sends the reminders due now and forgets devices that unsubscribed or went quiet. */
export async function sendWaterReminders(
	db: D1Database,
	privateJwkJson: string | undefined,
	now = Date.now()
): Promise<void> {
	await db
		.prepare('DELETE FROM push_reminders WHERE updated_at < ?')
		.bind(Math.floor(now / 1000) - PUSH_IDLE_DAYS * 86400)
		.run();
	if (!privateJwkJson) {
		console.error('push: VAPID_PRIVATE_JWK is not set');
		return;
	}
	const privateJwk = JSON.parse(privateJwkJson) as JsonWebKey;
	const { results } = await db
		.prepare('SELECT id, endpoint, from_min, to_min, every_min, tz, skip_date FROM push_reminders')
		.all<ReminderRow>();
	const due = dueReminders(results, new Date(now));
	if (due.length > MAX_SENDS_PER_RUN) {
		console.warn(`push: ${due.length} due, sending ${MAX_SENDS_PER_RUN}`);
	}
	const gone: string[] = [];
	const statuses: number[] = [];
	await Promise.all(
		due.slice(0, MAX_SENDS_PER_RUN).map(async (row) => {
			const status = await sendPush(row.endpoint, privateJwk, now);
			statuses.push(status);
			if (status === 404 || status === 410) gone.push(row.id);
		})
	);
	if (due.length) console.log(`push: sent ${statuses.length}, statuses ${statuses.join(' ')}`);
	if (gone.length) {
		await db.batch(
			gone.map((id) => db.prepare('DELETE FROM push_reminders WHERE id = ?').bind(id))
		);
	}
}

const randomHex = (bytes: number) =>
	[...crypto.getRandomValues(new Uint8Array(bytes))]
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');

async function sha256Hex(text: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', utf8(text));
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

type ScheduleInput = z.infer<typeof reminderCreateSchema>;

/** A new reminder device; the token is returned once and only its hash is kept. */
export async function createReminder(
	db: D1Database,
	input: ScheduleInput,
	now = Date.now()
): Promise<{ id: string; token: string } | 'full'> {
	const count = await db.prepare('SELECT COUNT(*) AS n FROM push_reminders').first<{ n: number }>();
	if ((count?.n ?? 0) >= MAX_REMINDERS) return 'full';
	const id = randomHex(16);
	const token = randomHex(32);
	await db
		.prepare(
			'INSERT INTO push_reminders (id, token_hash, endpoint, from_min, to_min, every_min, tz, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
		)
		.bind(
			id,
			await sha256Hex(token),
			input.endpoint,
			input.from,
			input.to,
			input.every,
			input.tz,
			Math.floor(now / 1000)
		)
		.run();
	return { id, token };
}

/** False when no reminder with this id and token exists (deleted, or never this device's). */
export async function updateReminder(
	db: D1Database,
	id: string,
	input: z.infer<typeof reminderUpdateSchema>,
	now = Date.now()
): Promise<boolean> {
	const result = await db
		.prepare(
			'UPDATE push_reminders SET endpoint = ?, from_min = ?, to_min = ?, every_min = ?, tz = ?, skip_date = ?, updated_at = ? WHERE id = ? AND token_hash = ?'
		)
		.bind(
			input.endpoint,
			input.from,
			input.to,
			input.every,
			input.tz,
			input.skipDate,
			Math.floor(now / 1000),
			id,
			await sha256Hex(input.token)
		)
		.run();
	return result.meta.changes > 0;
}

/**
 * Sends this device a reminder right away, so its owner can see whether notifications get through.
 * 'gone' when the row doesn't exist or the push service forgot the subscription (the row goes too).
 */
export async function sendTestReminder(
	db: D1Database,
	id: string,
	token: string,
	privateJwkJson: string | undefined,
	now = Date.now()
): Promise<'sent' | 'gone' | 'failed'> {
	if (!privateJwkJson) {
		console.error('push: VAPID_PRIVATE_JWK is not set');
		return 'failed';
	}
	const row = await db
		.prepare('SELECT endpoint FROM push_reminders WHERE id = ? AND token_hash = ?')
		.bind(id, await sha256Hex(token))
		.first<{ endpoint: string }>();
	if (!row) return 'gone';
	const status = await sendPush(row.endpoint, JSON.parse(privateJwkJson) as JsonWebKey, now);
	console.log(`push: test to ${new URL(row.endpoint).host}, status ${status}`);
	if (status === 404 || status === 410) {
		await db.prepare('DELETE FROM push_reminders WHERE id = ?').bind(id).run();
		return 'gone';
	}
	return status >= 200 && status < 300 ? 'sent' : 'failed';
}

export async function deleteReminder(db: D1Database, id: string, token: string): Promise<void> {
	await db
		.prepare('DELETE FROM push_reminders WHERE id = ? AND token_hash = ?')
		.bind(id, await sha256Hex(token))
		.run();
}
