/**
 * Water and supplement reminders sent as Web Push. Shared by the browser, the API and the cron
 * job. The push carries no payload: the service worker writes the text itself, so nothing needs
 * encrypting and the server never knows how much anyone drank or which vitamins they take.
 */

/** VAPID public key (P-256, uncompressed, base64url); the private half is the Worker secret VAPID_PRIVATE_JWK. */
export const VAPID_PUBLIC_KEY =
	'BEWXcDbh7uqVHT3POfYQF5N9AHV9UJ0ic8O5P8OUYn3eAxgzVq5xKBWKSHiBvOLRX8ItxJq1qn7X1HMqREXvpWk';

/** The cron runs every 15 minutes, so reminder times fall on quarter hours. */
export const CRON_STEP_MIN = 15;
export const REMINDER_EVERY_OPTIONS = [60, 90, 120, 180] as const;

export interface ReminderSchedule {
	/** Minutes after local midnight of the first and last reminder. */
	from: number;
	to: number;
	every: (typeof REMINDER_EVERY_OPTIONS)[number];
}

export const DEFAULT_SCHEDULE: ReminderSchedule = { from: 9 * 60, to: 21 * 60, every: 120 };

export function isValidSchedule(s: { from: unknown; to: unknown; every: unknown }): boolean {
	const ok = (v: unknown) =>
		typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 1440 && v % 30 === 0;
	return (
		ok(s.from) &&
		ok(s.to) &&
		(s.from as number) < (s.to as number) &&
		(REMINDER_EVERY_OPTIONS as readonly unknown[]).includes(s.every)
	);
}

/** Whether a reminder falls on this quarter hour (minutes after local midnight). */
export function isDue(s: ReminderSchedule, minute: number): boolean {
	const slot = minute - (minute % CRON_STEP_MIN);
	return slot >= s.from && slot <= s.to && (slot - s.from) % s.every === 0;
}

/** Supplement reminders: up to this many times a day, each on the half hour. */
export const MAX_SUPPLEMENT_TIMES = 4;

export function isValidSupplementTimes(times: unknown): times is number[] {
	return (
		Array.isArray(times) &&
		times.length >= 1 &&
		times.length <= MAX_SUPPLEMENT_TIMES &&
		new Set(times).size === times.length &&
		times.every(
			(t) => typeof t === 'number' && Number.isInteger(t) && t >= 0 && t < 1440 && t % 30 === 0
		)
	);
}

/**
 * Whether a supplement reminder falls on this quarter hour. `done` are the times already
 * ticked off on `doneDate`, so a vitamin taken early doesn't get a reminder.
 */
export function isSupplementDue(
	times: number[],
	minute: number,
	done: { date: string | null; times: number[] },
	today: string
): boolean {
	const slot = minute - (minute % CRON_STEP_MIN);
	if (!times.includes(slot)) return false;
	return !(done.date === today && done.times.includes(slot));
}

export function isValidTimeZone(tz: string): boolean {
	if (tz.length > 64) return false;
	try {
		new Intl.DateTimeFormat('en', { timeZone: tz });
		return true;
	} catch {
		return false;
	}
}

/** Local date (YYYY-MM-DD) and minutes after midnight in a time zone. */
export function localClock(at: Date, timeZone: string): { date: string; minute: number } {
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat('en-CA', {
			timeZone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			hourCycle: 'h23'
		})
			.formatToParts(at)
			.map((p) => [p.type, p.value])
	);
	return {
		date: `${parts.year}-${parts.month}-${parts.day}`,
		minute: Number(parts.hour) * 60 + Number(parts.minute)
	};
}

/**
 * Push services of the browsers we support. The server only ever posts to these, so a
 * subscription can't make it call an arbitrary URL.
 */
const PUSH_HOSTS = [
	/^fcm\.googleapis\.com$/,
	/^([a-z0-9-]+\.)*push\.services\.mozilla\.com$/,
	/^([a-z0-9-]+\.)*notify\.windows\.com$/,
	/^([a-z0-9-]+\.)*push\.apple\.com$/
];

export function isPushEndpoint(raw: string): boolean {
	if (raw.length > 1000) return false;
	try {
		const url = new URL(raw);
		return (
			url.protocol === 'https:' &&
			url.port === '' &&
			url.username === '' &&
			PUSH_HOSTS.some((re) => re.test(url.hostname))
		);
	} catch {
		return false;
	}
}

export const minutesToTime = (m: number) =>
	`${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;

// ── Weekly summary and morning overview ────────────────────────

/** Sunday 18:00 for the week in numbers, every day 7:00 for what's on today. */
export const DIGEST_TIMES = {
	weekly: { weekday: 0, minute: 18 * 60 },
	morning: { minute: 7 * 60 }
};
/** The cron runs every quarter hour; the service worker allows for a late push. */
const CRON_WINDOW = 15;

export type DigestKind = 'weekly' | 'morning';

/** Whether a digest falls on this local time: `window` minutes from its start. */
export function isDigestDue(
	kind: DigestKind,
	clock: { date: string; minute: number },
	window = CRON_WINDOW
): boolean {
	const time = DIGEST_TIMES[kind];
	const inWindow = clock.minute >= time.minute && clock.minute < time.minute + window;
	if (kind === 'morning') return inWindow;
	const weekday = new Date(`${clock.date}T12:00:00Z`).getUTCDay();
	return inWindow && weekday === DIGEST_TIMES.weekly.weekday;
}
