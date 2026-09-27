import { describe, expect, it } from 'vitest';
import { suggestionProblem } from './suggestion';

const ok = { title: 'Kimchi', ingredients: '1 čínska kapusta', steps: 'Kapustu nasoľ a nechaj.' };

describe('suggestionProblem', () => {
	it('accepts a complete form without optional fields', () => {
		expect(suggestionProblem(ok)).toBeNull();
	});

	it('names the field that is too short, ignoring surrounding spaces', () => {
		expect(suggestionProblem({ ...ok, steps: '  varit   ' })).toBe(
			'Postup: napíš aspoň 10 znakov (teraz 5).'
		);
		expect(suggestionProblem({ ...ok, title: '' })).toBe('Názov: toto pole je povinné.');
	});

	it('rejects overlong text and non-string values', () => {
		expect(suggestionProblem({ ...ok, author: 'x'.repeat(121) })).toMatch(/^Meno: najviac 120/);
		expect(suggestionProblem({ ...ok, ingredients: 42 })).toBe('Suroviny: toto pole je povinné.');
	});
});
