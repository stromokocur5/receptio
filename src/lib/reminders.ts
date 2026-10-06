import { localToday } from './journal';
import {
	ADMIN_ALERTS_KEY,
	kvGet,
	kvSet,
	REMINDER_TEST_KEY,
	SUPPLEMENTS_TODAY_KEY,
	WATER_TODAY_KEY,
	type ReminderTest,
	type SupplementsToday,
	type WaterToday
} from './kv';
import { VAPID_PUBLIC_KEY, type ReminderSchedule } from './push';
import { supplementReminder, waterReminder } from './state.svelte';

/** Browser side of reminders: push subscription and the /api/push and /api/vitaminy calls. */

export function remindersSupported(): boolean {
	return (
		typeof window !== 'undefined' &&
		'serviceWorker' in navigator &&
		'PushManager' in window &&
		'Notification' in window
	);
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
	const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
	const raw = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
	return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** A phone that can't reach its push service never answers subscribe(); don't spin forever. */
const SUBSCRIBE_TIMEOUT_MS = 30_000;

async function subscription(): Promise<PushSubscription> {
	const registration = await navigator.serviceWorker.ready;
	const existing = await registration.pushManager.getSubscription();
	if (existing) return existing;
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: keyBytes(VAPID_PUBLIC_KEY)
			}),
			new Promise<never>((_, reject) => {
				timer = setTimeout(
					() =>
						reject(
							new Error(
								'Prehliadač sa nevie prihlásiť na doručovanie upozornení. Skontroluj pripojenie a skús znova.'
							)
						),
					SUBSCRIBE_TIMEOUT_MS
				);
			})
		]);
	} finally {
		clearTimeout(timer);
	}
}

const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

async function send(method: string, url: string, body: unknown): Promise<Response> {
	return fetch(url, {
		method,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
}

async function failure(res: Response): Promise<Error> {
	const data = (await res.json().catch(() => null)) as { message?: string } | null;
	return new Error(data?.message ?? 'Pripomienky teraz nefungujú, skús to neskôr.');
}

async function askPermission(): Promise<void> {
	const permission = await Notification.requestPermission();
	if (permission !== 'granted') {
		throw new Error(
			'Prehliadač upozornenia nepovolil. Povoľ ich pre túto stránku v nastaveniach prehliadača.'
		);
	}
}

/** Asks for permission, subscribes and registers the schedule. Throws with a message to show. */
export async function enableReminders(schedule: ReminderSchedule): Promise<void> {
	await askPermission();
	const sub = await subscription();
	const res = await send('POST', '/api/push', {
		...schedule,
		tz: timeZone(),
		endpoint: sub.endpoint
	});
	if (!res.ok) throw await failure(res);
	const { id, token } = (await res.json()) as { id: string; token: string };
	waterReminder.current = { id, token, schedule, skipDate: null, touched: localToday() };
}

/**
 * Saves a new schedule or pause day; also tells the server this device is still in use.
 * When the server no longer knows the device, reminders are off here too.
 */
export async function updateReminders(
	change: Partial<{ schedule: ReminderSchedule; skipDate: string | null }>
): Promise<void> {
	const current = waterReminder.current;
	if (!current) return;
	const next = { ...current, ...change, touched: localToday() };
	const sub = await subscription();
	const res = await send('PUT', `/api/push/${current.id}`, {
		token: current.token,
		...next.schedule,
		tz: timeZone(),
		endpoint: sub.endpoint,
		skipDate: next.skipDate
	});
	if (res.status === 404) {
		waterReminder.current = null;
		return;
	}
	if (!res.ok) throw await failure(res);
	waterReminder.current = next;
}

/** Asks the server to push a reminder now. False when the server no longer knows this device. */
export async function testReminder(): Promise<boolean> {
	const current = waterReminder.current;
	if (!current) return false;
	await markTest('water');
	const res = await send('POST', `/api/push/${current.id}`, { token: current.token });
	if (res.status === 404) {
		waterReminder.current = null;
		return false;
	}
	if (!res.ok) throw await failure(res);
	return true;
}

export async function disableReminders(): Promise<void> {
	const current = waterReminder.current;
	if (!current) return;
	const res = await send('DELETE', `/api/push/${current.id}`, { token: current.token });
	if (!res.ok) throw await failure(res);
	waterReminder.current = null;
	await unsubscribeIfUnused();
}

/** The push subscription is shared by water and supplement reminders; drop it with the last. */
async function unsubscribeIfUnused(): Promise<void> {
	if (waterReminder.current || supplementReminder.current) return;
	if (await kvGet<boolean>(ADMIN_ALERTS_KEY).catch(() => false)) return;
	const registration = await navigator.serviceWorker.getRegistration();
	await (await registration?.pushManager.getSubscription())?.unsubscribe();
}

/** This browser's push address, asking for permission first; for the admin's outage alerts. */
export async function pushEndpoint(): Promise<string> {
	await askPermission();
	return (await subscription()).endpoint;
}

export async function setAdminAlertsHere(on: boolean): Promise<void> {
	await kvSet(ADMIN_ALERTS_KEY, on);
}

// ── Supplements ────────────────────────────────────────────────

export interface SupplementState {
	times: number[];
	doneDate: string | null;
	doneTimes: number[];
}

export async function enableSupplementReminders(state: SupplementState): Promise<void> {
	await askPermission();
	const sub = await subscription();
	const res = await send('POST', '/api/vitaminy', {
		times: state.times,
		tz: timeZone(),
		endpoint: sub.endpoint
	});
	if (!res.ok) throw await failure(res);
	const { id, token } = (await res.json()) as { id: string; token: string };
	supplementReminder.current = { id, token, sent: '', touched: localToday() };
	await updateSupplementReminders(state);
}

/**
 * Sends the times and today's ticked-off ones when they changed (or once a day, so the server
 * knows the device is in use). With no times left the reminders switch off.
 */
export async function updateSupplementReminders(state: SupplementState): Promise<void> {
	const current = supplementReminder.current;
	if (!current) return;
	if (!state.times.length) return disableSupplementReminders();
	const sent = JSON.stringify(state);
	if (sent === current.sent && current.touched === localToday()) return;
	const sub = await subscription();
	const res = await send('PUT', `/api/vitaminy/${current.id}`, {
		token: current.token,
		...state,
		tz: timeZone(),
		endpoint: sub.endpoint
	});
	if (res.status === 404) {
		supplementReminder.current = null;
		return;
	}
	if (!res.ok) throw await failure(res);
	supplementReminder.current = { ...current, sent, touched: localToday() };
}

export async function testSupplementReminder(): Promise<boolean> {
	const current = supplementReminder.current;
	if (!current) return false;
	await markTest('supplements');
	const res = await send('POST', `/api/vitaminy/${current.id}`, { token: current.token });
	if (res.status === 404) {
		supplementReminder.current = null;
		return false;
	}
	if (!res.ok) throw await failure(res);
	return true;
}

export async function disableSupplementReminders(): Promise<void> {
	const current = supplementReminder.current;
	if (!current) return;
	const res = await send('DELETE', `/api/vitaminy/${current.id}`, { token: current.token });
	if (!res.ok) throw await failure(res);
	supplementReminder.current = null;
	await unsubscribeIfUnused();
}

/** Both kinds of push look the same; this tells the service worker which test is coming. */
async function markTest(kind: ReminderTest['kind']): Promise<void> {
	await kvSet(REMINDER_TEST_KEY, { kind, at: Date.now() } satisfies ReminderTest).catch(() => {});
}

/** What the service worker names in the next supplement reminder. */
export function rememberSupplementsToday(today: SupplementsToday): void {
	void kvSet(SUPPLEMENTS_TODAY_KEY, today).catch(() => {
		// IndexedDB blocked: the reminder shows a generic text.
	});
}

/** What the service worker shows in the next reminder. */
export function rememberWaterToday(water: WaterToday): void {
	void kvSet(WATER_TODAY_KEY, water).catch(() => {
		// IndexedDB blocked (private mode): reminders just show the generic text.
	});
}
