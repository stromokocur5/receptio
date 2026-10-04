import { localToday } from './journal';
import { kvSet, WATER_TODAY_KEY, type WaterToday } from './kv';
import { VAPID_PUBLIC_KEY, type ReminderSchedule } from './push';
import { waterReminder } from './state.svelte';

/** Browser side of water reminders: push subscription and the /api/push calls. */

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

async function subscription(): Promise<PushSubscription> {
	const registration = await navigator.serviceWorker.ready;
	return (
		(await registration.pushManager.getSubscription()) ??
		(await registration.pushManager.subscribe({
			userVisibleOnly: true,
			applicationServerKey: keyBytes(VAPID_PUBLIC_KEY)
		}))
	);
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

/** Asks for permission, subscribes and registers the schedule. Throws with a message to show. */
export async function enableReminders(schedule: ReminderSchedule): Promise<void> {
	const permission = await Notification.requestPermission();
	if (permission !== 'granted') {
		throw new Error(
			'Prehliadač upozornenia nepovolil. Povoľ ich pre túto stránku v nastaveniach prehliadača.'
		);
	}
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

export async function disableReminders(): Promise<void> {
	const current = waterReminder.current;
	if (!current) return;
	const res = await send('DELETE', `/api/push/${current.id}`, { token: current.token });
	if (!res.ok) throw await failure(res);
	waterReminder.current = null;
	const registration = await navigator.serviceWorker.getRegistration();
	await (await registration?.pushManager.getSubscription())?.unsubscribe();
}

/** What the service worker shows in the next reminder. */
export function rememberWaterToday(water: WaterToday): void {
	void kvSet(WATER_TODAY_KEY, water).catch(() => {
		// IndexedDB blocked (private mode): reminders just show the generic text.
	});
}
