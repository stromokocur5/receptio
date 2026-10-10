import { describe, expect, it } from 'vitest';
import {
	budgetForDays,
	budgetStatus,
	parsePaid,
	spentThisWeek,
	validatePurchases,
	weekStart
} from './budget';

describe('weekly budget', () => {
	it('starts weeks on Monday', () => {
		expect(weekStart('2026-10-06')).toBe('2026-10-05');
		expect(weekStart('2026-10-05')).toBe('2026-10-05');
		expect(weekStart('2026-10-11')).toBe('2026-10-05');
	});

	it('sums only this week’s shopping and says what is left', () => {
		const spent = spentThisWeek(
			[
				{ date: '2026-10-04', amount: 30 },
				{ date: '2026-10-05', amount: 12.5 },
				{ date: '2026-10-06', amount: 7.5 }
			],
			'2026-10-06'
		);
		expect(spent).toBe(20);
		expect(budgetStatus(50, spent, 18)).toEqual({ budget: 50, spent: 20, toBuy: 18, left: 12 });
		expect(budgetForDays(35, 4)).toBe(20);
	});

	it('drops broken purchases', () => {
		expect(
			validatePurchases([
				{ date: '2026-10-05', amount: 10 },
				{ date: 'zajtra', amount: 10 },
				{ date: '2026-10-05', amount: -1 }
			])
		).toEqual([{ date: '2026-10-05', amount: 10 }]);
	});
});

describe('parsePaid', () => {
	it('reads the receipt total as people type it', () => {
		expect(parsePaid('23,40')).toBe(23.4);
		expect(parsePaid('23.4 €')).toBe(23.4);
		expect(parsePaid('')).toBeNull();
		expect(parsePaid('0')).toBeNull();
		expect(parsePaid('abc')).toBeNull();
		expect(parsePaid('5000')).toBeNull();
	});
});
