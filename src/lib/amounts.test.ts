import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount, toGrams } from './amounts';
import type { Ingredient } from './types';

const ingredient = (overrides: Partial<Ingredient> = {}): Ingredient => ({
	id: 'test',
	name: 'Test',
	category: 'ine',
	group: 'test',
	gluten: 'free',
	allergens: [],
	staple: false,
	per100g: {
		kcal: 100,
		protein: 10,
		carbs: 0,
		fat: 0,
		fiber: 0,
		salt: 0,
		iron: 0,
		calcium: 0,
		zinc: 0,
		ala: 0,
		b12: 0
	},
	units: {},
	density: 1,
	priceEstimate: 1,
	color: '#000000',
	howto: [],
	byproduct: false,
	...overrides
});

describe('parseAmount', () => {
	it('parses integers, decimals with comma and fractions', () => {
		expect(parseAmount('200 g')).toEqual({ amount: 200, unit: 'g', note: undefined });
		expect(parseAmount('1,5 čl')).toEqual({ amount: 1.5, unit: 'čl', note: undefined });
		expect(parseAmount('1/2 hrnček')).toEqual({ amount: 0.5, unit: 'hrnček', note: undefined });
	});

	it('extracts a note after the pipe', () => {
		expect(parseAmount('2 ks | nadrobno')).toEqual({ amount: 2, unit: 'ks', note: 'nadrobno' });
	});

	it('marks amounts prefixed with ~ as not eaten', () => {
		expect(parseAmount('~6 hrnček | na dusenie')).toEqual({
			amount: 6,
			unit: 'hrnček',
			note: 'na dusenie',
			notEaten: true
		});
	});

	it('handles to-taste amounts', () => {
		expect(parseAmount('podľa chuti')).toEqual({ amount: null, unit: null, note: undefined });
	});

	it('rejects unknown units and zero', () => {
		expect(() => parseAmount('2 hrste')).toThrow();
		expect(() => parseAmount('0 g')).toThrow();
	});
});

describe('toGrams', () => {
	it('uses explicit unit weights before defaults', () => {
		expect(toGrams(2, 'ks', ingredient({ units: { ks: 110 } }))).toBe(220);
		expect(toGrams(1, 'pl', ingredient({ units: { pl: 10 } }))).toBe(10);
	});

	it('falls back to volume × density', () => {
		expect(toGrams(2, 'pl', ingredient({ density: 0.92 }))).toBeCloseTo(27.6);
		expect(toGrams(1, 'l', ingredient())).toBe(1000);
	});

	it('refuses pieces without a known weight', () => {
		expect(() => toGrams(1, 'ks', ingredient())).toThrow();
	});

	it('treats to-taste as zero', () => {
		expect(toGrams(null, null, ingredient())).toBe(0);
	});
});

describe('formatAmount', () => {
	it('renders kitchen fractions', () => {
		expect(formatAmount(0.5, 'čl')).toBe('½ čl');
		expect(formatAmount(1.5, 'ks')).toBe('1½ ks');
		expect(formatAmount(2, 'ks')).toBe('2 ks');
	});

	it('rounds larger gram amounts to 5 g', () => {
		expect(formatAmount(247, 'g')).toBe('245 g');
	});
});
