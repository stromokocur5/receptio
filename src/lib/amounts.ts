import { UNITS, type Ingredient, type Unit } from './types';

export interface ParsedAmount {
	amount: number | null;
	unit: Unit | null;
	note?: string;
	notEaten?: boolean;
}

const TO_TASTE = 'podľa chuti';
const AMOUNT_RE = new RegExp(`^(\\d+(?:[.,]\\d+)?|\\d+/\\d+)\\s*(${UNITS.join('|')})$`, 'u');

/** Default grams per spoon/cup unit of water-like ingredients; scaled by density. */
const VOLUME_ML: Partial<Record<Unit, number>> = { ml: 1, l: 1000, pl: 15, čl: 5, hrnček: 240 };

/**
 * Parses an authored amount like `200 g`, `1,5 ks`, `1/2 hrnček`, `podľa chuti`,
 * optionally followed by `| note`. A leading `~` marks something used but not eaten
 * (`~6 hrnček` of simmering broth).
 */
export function parseAmount(raw: string): ParsedAmount {
	const [amountPart, ...noteParts] = raw.split('|');
	const note = noteParts.join('|').trim() || undefined;
	const trimmed = amountPart.trim();
	const notEaten = trimmed.startsWith('~') || undefined;
	const text = notEaten ? trimmed.slice(1).trim() : trimmed;

	if (text === TO_TASTE) return { amount: null, unit: null, note };

	const match = AMOUNT_RE.exec(text);
	if (!match) throw new Error(`Neznámy formát množstva: "${raw}"`);

	const [, value, unit] = match;
	const amount = value.includes('/')
		? Number(value.split('/')[0]) / Number(value.split('/')[1])
		: Number(value.replace(',', '.'));
	if (!Number.isFinite(amount) || amount <= 0) throw new Error(`Neplatné množstvo: "${raw}"`);

	return notEaten
		? { amount, unit: unit as Unit, note, notEaten }
		: { amount, unit: unit as Unit, note };
}

export function toGrams(amount: number | null, unit: Unit | null, ingredient: Ingredient): number {
	if (amount === null || unit === null) return 0;

	const explicit = ingredient.units[unit];
	if (explicit !== undefined) return amount * explicit;

	switch (unit) {
		case 'g':
			return amount;
		case 'kg':
			return amount * 1000;
		case 'štipka':
			return amount * 0.5;
		case 'ks':
			throw new Error(`Surovina "${ingredient.id}" nemá definovanú hmotnosť pre "ks"`);
		default:
			return amount * (VOLUME_ML[unit] ?? 1) * ingredient.density;
	}
}

const numberFormat = new Intl.NumberFormat('sk-SK', { maximumFractionDigits: 1 });

export function formatNumber(value: number, maxFractionDigits = 1): string {
	if (maxFractionDigits === 1) return numberFormat.format(value);
	return new Intl.NumberFormat('sk-SK', { maximumFractionDigits: maxFractionDigits }).format(value);
}

const FRACTIONS: [number, string][] = [
	[0.25, '¼'],
	[1 / 3, '⅓'],
	[0.5, '½'],
	[2 / 3, '⅔'],
	[0.75, '¾']
];

/** Kitchen-friendly amount: fractions for small counted units, rounded grams otherwise. */
export function formatAmount(amount: number | null, unit: Unit | null): string {
	if (amount === null || unit === null) return 'podľa chuti';

	if (unit === 'g' || unit === 'ml') {
		const rounded = amount >= 100 ? Math.round(amount / 5) * 5 : Math.round(amount);
		return `${formatNumber(Math.max(rounded, 1))} ${unit}`;
	}

	const whole = Math.floor(amount);
	const fraction = amount - whole;
	const nearest = FRACTIONS.find(([f]) => Math.abs(f - fraction) < 0.06);
	if (fraction < 0.06) return `${whole} ${unit}`;
	if (fraction > 0.94) return `${whole + 1} ${unit}`;
	if (nearest) return `${whole > 0 ? whole : ''}${nearest[1]} ${unit}`;
	return `${formatNumber(amount)} ${unit}`;
}

export function formatGrams(grams: number): string {
	if (grams >= 1000) return `${formatNumber(grams / 1000, 2)} kg`;
	return `${formatNumber(grams >= 100 ? Math.round(grams / 5) * 5 : Math.round(grams), 0)} g`;
}

export function formatEur(value: number): string {
	return new Intl.NumberFormat('sk-SK', { style: 'currency', currency: 'EUR' }).format(value);
}
