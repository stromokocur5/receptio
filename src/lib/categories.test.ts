import { describe, expect, it } from 'vitest';
import { guessTaste } from './categories';

const line = (id: string, gramsPerServing = 20, category = 'ine') => ({
	id,
	group: id,
	category,
	gramsPerServing
});

describe('guessTaste', () => {
	it('takes the first category that decides', () => {
		expect(guessTaste(['dezerty/pecene'], [line('cesnak')], 0)).toBe('sladke');
		expect(guessTaste(['ranajky/palacinky', 'hlavne/cesto'], [line('cukor')], 0)).toBe('slane');
	});

	it('leaves plant milks undecided', () => {
		expect(guessTaste(['domace/mlieka', 'napoje/mlieka'], [line('datle')], 0)).toBeUndefined();
	});

	it("doesn't give a drink the taste of its DIY category", () => {
		expect(guessTaste(['napoje/fermentovane', 'domace/kvasene'], [line('cukor')], 0)).toBe(
			'sladke'
		);
	});

	it('decides the rest by ingredients', () => {
		expect(guessTaste(['prilohy/chlieb'], [line('cukor', 1)], 0.8)).toBe('slane');
		expect(guessTaste(['prilohy/chlieb'], [line('cukor', 10)], 0.4)).toBe('sladke');
		expect(guessTaste(['snacky/party'], [line('limetka', 30, 'ovocie')], 0.2)).toBeUndefined();
		expect(guessTaste(['snacky/party'], [line('cibula', 5)], 0)).toBe('slane');
	});
});
