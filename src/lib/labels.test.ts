import { describe, expect, it } from 'vitest';
import { matchesSearch, normalizeSearch } from './labels';

const text = normalizeSearch('Šošovicový dal s brokolicou a ryžou – indická kuchyňa');

describe('matchesSearch', () => {
	it('matches plain and diacritic-free words', () => {
		expect(matchesSearch(text, 'šošovic')).toBe(true);
		expect(matchesSearch(text, 'ryza')).toBe(true);
		expect(matchesSearch(text, '')).toBe(true);
	});

	it('tolerates typos and swapped letters', () => {
		expect(matchesSearch(text, 'brokolca')).toBe(true);
		expect(matchesSearch(text, 'sosovcia')).toBe(true);
		expect(matchesSearch(text, 'idnicka')).toBe(true);
	});

	it('needs every word and stays strict for short or unrelated words', () => {
		expect(matchesSearch(text, 'brokolica tofu')).toBe(false);
		expect(matchesSearch(text, 'rys')).toBe(false);
		expect(matchesSearch(text, 'cicer')).toBe(false);
	});
});
