import { describe, expect, it } from 'vitest';
import { tipParts } from './tip-links';

describe('tipParts', () => {
	it('splits internal links out of the text', () => {
		expect(tipParts('Viac v [kvások](/wiki/kvasok), aj [krekry](/recepty/krekry).')).toEqual([
			{ text: 'Viac v ' },
			{ text: 'kvások', href: '/wiki/kvasok' },
			{ text: ', aj ' },
			{ text: 'krekry', href: '/recepty/krekry' },
			{ text: '.' }
		]);
	});

	it('leaves external and protocol-relative links as plain text', () => {
		const tip = 'Pozri [tu](https://example.com) alebo [tam](//example.com).';
		expect(tipParts(tip)).toEqual([{ text: tip }]);
	});

	it('keeps a tip without links whole', () => {
		expect(tipParts('Podávaj teplé.')).toEqual([{ text: 'Podávaj teplé.' }]);
	});
});
