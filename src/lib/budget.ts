import { shiftDate } from './journal';

/** One shopping trip: the day and what the bought items cost (whole packs, known prices). */
export interface Purchase {
	date: string;
	amount: number;
}

export const MAX_PURCHASES = 200;

/** Monday of the week `iso` falls in – weeks in Slovakia start on Monday. */
export function weekStart(iso: string): string {
	const day = new Date(`${iso}T00:00:00Z`).getUTCDay();
	return shiftDate(iso, -((day + 6) % 7));
}

/** What was spent on shopping since Monday. */
export function spentThisWeek(purchases: Purchase[], today: string): number {
	const from = weekStart(today);
	return purchases
		.filter((p) => p.date >= from && p.date <= today)
		.reduce((sum, p) => sum + p.amount, 0);
}

export interface BudgetStatus {
	budget: number;
	spent: number;
	/** Still to buy for the plan (the shopping list as it stands). */
	toBuy: number;
	/** Budget minus spent minus what's still to buy; negative = over. */
	left: number;
}

export function budgetStatus(budget: number, spent: number, toBuy: number): BudgetStatus {
	return { budget, spent, toBuy, left: budget - spent - toBuy };
}

/** "23,40" or "23.4 €" from the receipt, in euros; null when it isn't a sum someone paid. */
export function parsePaid(raw: string): number | null {
	const value = Number(raw.replace(/\s|€/g, '').replace(',', '.'));
	if (!raw.trim() || !Number.isFinite(value) || value <= 0 || value > 2000) return null;
	return Math.round(value * 100) / 100;
}

/** The part of a weekly budget a plan of `days` days may use. */
export function budgetForDays(weekly: number, days: number): number {
	return (weekly * days) / 7;
}

export function validatePurchases(raw: unknown): Purchase[] | undefined {
	if (!Array.isArray(raw)) return undefined;
	return raw
		.filter(
			(p): p is Purchase =>
				typeof p === 'object' &&
				p !== null &&
				typeof p.date === 'string' &&
				/^\d{4}-\d{2}-\d{2}$/.test(p.date) &&
				typeof p.amount === 'number' &&
				Number.isFinite(p.amount) &&
				p.amount >= 0 &&
				p.amount <= 2000
		)
		.slice(-MAX_PURCHASES)
		.map(({ date, amount }) => ({ date, amount }));
}
