import { describe, expect, it } from 'vitest';
import { legacyTarget } from './legacy';

const dishes = new Set(['chana-masala']);

describe('legacyTarget', () => {
	it('sends an old recipe to the dish of the same name, or home', () => {
		expect(legacyTarget('/recepty/chana-masala', dishes)).toBe('/jedlo/chana-masala');
		expect(legacyTarget('/recepty/kapustnica', dishes)).toBe('/');
		expect(legacyTarget('/recepty', dishes)).toBe('/');
	});

	it('maps old sections and leaves new pages alone', () => {
		expect(legacyTarget('/plan', dishes)).toBe('/tyzden');
		expect(legacyTarget('/spajza', dishes)).toBe('/kuchyna');
		expect(legacyTarget('/wiki/tofu', dishes)).toBe('/');
		expect(legacyTarget('/jedlo/chana-masala', dishes)).toBeNull();
		expect(legacyTarget('/planeta', dishes)).toBeNull();
	});
});
