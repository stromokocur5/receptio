import { describe, expect, it } from 'vitest';
import { weatherAlerts, type Forecast } from './weather';

const forecast = (min: number[], max: number[], rain: number[]): Forecast => ({
	dates: min.map((_, i) => `2026-05-${String(10 + i).padStart(2, '0')}`),
	min,
	max,
	rain,
	today: 3,
	fetchedAt: 0
});

describe('weatherAlerts', () => {
	it('warns about frost when tender plants are out', () => {
		const f = forecast(
			[5, 5, 5, 4, -2, 6, 8, 9, 9, 9],
			[15, 15, 15, 14, 12, 18, 20, 21, 22, 22],
			Array(10).fill(1)
		);
		const alerts = weatherAlerts(f, { month: 5, tender: true, plantingTender: true });
		expect(alerts[0]).toMatchObject({
			kind: 'frost',
			level: 'danger',
			title: expect.stringContaining('zajtra')
		});
		expect(alerts.some((a) => a.kind === 'plant')).toBe(false);
	});

	it('says when to water, when not to and when it is safe to plant out', () => {
		const dry = forecast(Array(10).fill(10), Array(10).fill(26), Array(10).fill(0));
		const kinds = weatherAlerts(dry, { month: 5, tender: false, plantingTender: true }).map(
			(a) => a.kind
		);
		expect(kinds).toEqual(['dry', 'plant']);
		const wet = forecast(Array(10).fill(10), Array(10).fill(22), [0, 0, 0, 0, 25, 0, 0, 0, 0, 0]);
		expect(
			weatherAlerts(wet, { month: 7, tender: false, plantingTender: false }).map((a) => a.kind)
		).toEqual(['rain']);
	});
});
