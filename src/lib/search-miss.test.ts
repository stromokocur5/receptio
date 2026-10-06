import { describe, expect, it } from 'vitest';
import { cleanSearchTerm } from './search-miss';

describe('cleanSearchTerm', () => {
	it('keeps plain words, tidied', () => {
		expect(cleanSearchTerm('  Pad   Thai ')).toBe('pad thai');
		expect(cleanSearchTerm('kari s 2 druhmi')).toBe('kari s 2 druhmi');
	});
	it('drops anything that could identify someone', () => {
		expect(cleanSearchTerm('jan@example.com')).toBeNull();
		expect(cleanSearchTerm('0905 123 456')).toBeNull();
		expect(cleanSearchTerm('<script>')).toBeNull();
		expect(cleanSearchTerm('a')).toBeNull();
		expect(cleanSearchTerm('x'.repeat(61))).toBeNull();
	});
});
