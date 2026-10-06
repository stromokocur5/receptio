import { describe, expect, it } from 'vitest';
import { stepTerms } from './glossary';

describe('stepTerms', () => {
	it('finds the cooking words a step uses, whatever their form', () => {
		const terms = stepTerms(
			'Na oleji speň cibuľu, pridaj prelisovaný cesnak a var na miernom ohni.'
		);
		expect(terms.map((t) => t.term)).toEqual(['speniť', 'mierny oheň', 'prelisovať']);
	});

	it('leaves plain steps alone', () => {
		expect(stepTerms('Daj do misky a podávaj.')).toEqual([]);
		// "dus" inside another word isn't stewing.
		expect(stepTerms('Pridaj dusenú mrkvu do misky.')).toEqual([]);
	});
});
