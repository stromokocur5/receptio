import { describe, expect, it } from 'vitest';
import { dueDigests, dueReminders, dueSupplements, vapidAuthorization } from './push';
import { VAPID_PUBLIC_KEY } from '../push';

const row = {
	id: 'a',
	endpoint: 'https://fcm.googleapis.com/fcm/send/x',
	from_min: 540,
	to_min: 1260,
	every_min: 120,
	tz: 'Europe/Bratislava',
	skip_date: null as string | null
};

describe('dueReminders', () => {
	// 09:00 in Bratislava (UTC+2 in October).
	const at = new Date('2026-10-04T07:00:00Z');
	it('picks rows due in their own time zone', () => {
		expect(dueReminders([row, { ...row, id: 'b', tz: 'UTC' }], at).map((r) => r.id)).toEqual(['a']);
	});
	it('skips the day the goal was met', () => {
		expect(dueReminders([{ ...row, skip_date: '2026-10-04' }], at)).toEqual([]);
	});
});

describe('dueSupplements', () => {
	const supplement = {
		id: 's',
		endpoint: 'https://fcm.googleapis.com/fcm/send/y',
		times: '480,1200',
		tz: 'Europe/Bratislava',
		done_date: null as string | null,
		done_times: ''
	};
	// 08:00 in Bratislava.
	const at = new Date('2026-10-04T06:00:00Z');
	it('reminds at the set local time', () => {
		expect(dueSupplements([supplement], at)).toHaveLength(1);
		expect(dueSupplements([{ ...supplement, times: '1200' }], at)).toEqual([]);
	});
	it('stays quiet for a time already ticked off today', () => {
		const done = { ...supplement, done_date: '2026-10-04', done_times: '480' };
		expect(dueSupplements([done], at)).toEqual([]);
		expect(dueSupplements([{ ...done, done_date: '2026-10-03' }], at)).toHaveLength(1);
	});
});

const fromB64url = (s: string) => {
	const base64 = s.replace(/-/g, '+').replace(/_/g, '/');
	const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
	return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
};

describe('vapidAuthorization', () => {
	it('signs an ES256 token for the push service origin that the public key verifies', async () => {
		const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
			'sign',
			'verify'
		]);
		const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
		const header = await vapidAuthorization(row.endpoint, jwk, Date.UTC(2026, 9, 4));
		const match = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header);
		expect(match?.[4]).toBe(VAPID_PUBLIC_KEY);
		const [, h, c, sig] = match!;
		const claims = JSON.parse(new TextDecoder().decode(fromB64url(c)));
		expect(claims.aud).toBe('https://fcm.googleapis.com');
		expect(claims.exp).toBe(Date.UTC(2026, 9, 4) / 1000 + 12 * 3600);
		const ok = await crypto.subtle.verify(
			{ name: 'ECDSA', hash: 'SHA-256' },
			pair.publicKey,
			fromB64url(sig),
			new TextEncoder().encode(`${h}.${c}`)
		);
		expect(ok).toBe(true);
	});
});

describe('dueDigests', () => {
	const row = (weekly: number, morning: number) => ({
		id: `${weekly}${morning}`,
		endpoint: 'https://push.example/x',
		tz: 'Europe/Bratislava',
		weekly,
		morning
	});
	const rows = [row(1, 0), row(0, 1), row(1, 1)];

	it('sends the weekly summary on Sunday at 18:00 local time and the overview every morning at 7', () => {
		// Sunday 2026-10-11 18:05 in Bratislava is 16:05 UTC.
		expect(dueDigests(rows, new Date('2026-10-11T16:05:00Z')).map((r) => r.id)).toEqual([
			'10',
			'11'
		]);
		// Saturday evening: nothing.
		expect(dueDigests(rows, new Date('2026-10-10T16:05:00Z'))).toEqual([]);
		// Any morning 7:00 local = 5:00 UTC in summer time.
		expect(dueDigests(rows, new Date('2026-10-07T05:00:00Z')).map((r) => r.id)).toEqual([
			'01',
			'11'
		]);
		expect(dueDigests(rows, new Date('2026-10-07T05:20:00Z'))).toEqual([]);
	});
});
