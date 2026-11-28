import { describe, expect, it } from 'vitest';
import {
	isDue,
	isPushEndpoint,
	isSupplementDue,
	isValidSchedule,
	isValidSupplementTimes,
	localClock
} from './push';

describe('isDue', () => {
	const s = { from: 9 * 60, to: 21 * 60, every: 120 as const };
	it('fires on the schedule, also when the cron runs a few minutes late', () => {
		expect(isDue(s, 9 * 60)).toBe(true);
		expect(isDue(s, 11 * 60 + 4)).toBe(true);
		expect(isDue(s, 21 * 60)).toBe(true);
	});
	it('stays quiet between reminders and outside the window', () => {
		expect(isDue(s, 10 * 60)).toBe(false);
		expect(isDue(s, 9 * 60 + 15)).toBe(false);
		expect(isDue(s, 7 * 60)).toBe(false);
		expect(isDue(s, 23 * 60)).toBe(false);
	});
	it('handles 90 minute steps', () => {
		const s90 = { from: 8 * 60, to: 20 * 60, every: 90 as const };
		expect(isDue(s90, 9 * 60 + 30)).toBe(true);
		expect(isDue(s90, 9 * 60)).toBe(false);
	});
});

describe('isValidSchedule', () => {
	it('wants half hours, from before to and a known step', () => {
		expect(isValidSchedule({ from: 540, to: 1260, every: 120 })).toBe(true);
		expect(isValidSchedule({ from: 545, to: 1260, every: 120 })).toBe(false);
		expect(isValidSchedule({ from: 1260, to: 540, every: 120 })).toBe(false);
		expect(isValidSchedule({ from: 540, to: 1260, every: 45 })).toBe(false);
	});
});

describe('isPushEndpoint', () => {
	it('accepts the browsers’ push services only', () => {
		expect(isPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
		expect(isPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x')).toBe(true);
		expect(isPushEndpoint('https://web.push.apple.com/QW')).toBe(true);
		expect(isPushEndpoint('https://wns2-db5p.notify.windows.com/w/?token=x')).toBe(true);
		expect(isPushEndpoint('http://fcm.googleapis.com/x')).toBe(false);
		expect(isPushEndpoint('https://fcm.googleapis.com.evil.com/x')).toBe(false);
		expect(isPushEndpoint('https://fcm.googleapis.com:8443/x')).toBe(false);
		expect(isPushEndpoint('https://169.254.169.254/latest')).toBe(false);
	});
});

describe('localClock', () => {
	it('reads date and time in the given zone', () => {
		const at = new Date('2026-10-04T22:30:00Z');
		expect(localClock(at, 'Europe/Bratislava')).toEqual({ date: '2026-10-05', minute: 30 });
		expect(localClock(at, 'UTC')).toEqual({ date: '2026-10-04', minute: 22 * 60 + 30 });
	});
});

describe('supplement reminders', () => {
	it('accepts up to four distinct half hours', () => {
		expect(isValidSupplementTimes([480, 1200])).toBe(true);
		expect(isValidSupplementTimes([])).toBe(false);
		expect(isValidSupplementTimes([480, 480])).toBe(false);
		expect(isValidSupplementTimes([485])).toBe(false);
		expect(isValidSupplementTimes([0, 30, 60, 90, 120])).toBe(false);
	});
	it('fires at the set times unless that time was ticked off today', () => {
		const none = { date: null, times: [] };
		expect(isSupplementDue([480, 1200], 480 + 7, none, '2026-10-06')).toBe(true);
		expect(isSupplementDue([480, 1200], 495, none, '2026-10-06')).toBe(false);
		const doneMorning = { date: '2026-10-06', times: [480] };
		expect(isSupplementDue([480, 1200], 480, doneMorning, '2026-10-06')).toBe(false);
		expect(isSupplementDue([480, 1200], 480, doneMorning, '2026-10-07')).toBe(true);
	});
});
