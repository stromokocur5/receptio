import { describe, expect, it } from 'vitest';
import { normalizeSearch, searchMatcher, termsFound } from './labels';

const dal = normalizeSearch(
	'Šošovicový dal s brokolicou a ryžou – indická kuchyňa, čierne korenie'
);
const hummus = normalizeSearch('Hummus z cíceru s tahini');
const texts = [dal, hummus];
const find = (query: string) => texts.filter(searchMatcher(texts, query));

describe('searchMatcher', () => {
	it('matches plain and diacritic-free words', () => {
		expect(find('šošovic')).toEqual([dal]);
		expect(find('ryza')).toEqual([dal]);
		expect(find('')).toEqual(texts);
	});

	it('tolerates typos and swapped letters', () => {
		expect(find('brokolca')).toEqual([dal]);
		expect(find('sosovcia')).toEqual([dal]);
		expect(find('idnicka')).toEqual([dal]);
	});

	it('keeps words that exist exact, so they never match look-alikes', () => {
		expect(find('cicer')).toEqual([hummus]);
		expect(find('cicer brokolca')).toEqual([]);
	});

	it('does not stretch a word into the start of another one', () => {
		expect(find('cicre')).toEqual([hummus]);
		expect(find('cicr')).toEqual([hummus]);
		expect(find('cier')).toEqual([dal]);
		expect(find('tofu')).toEqual([]);
		expect(find('rys')).toEqual([]);
	});

	it('knows other names and other endings', () => {
		const kari = normalizeSearch('Zelené kari s tofu');
		const soup = normalizeSearch('Hrachová polievka');
		const schnitzel = normalizeSearch('Rezeň z tofu');
		const all = [
			kari,
			soup,
			normalizeSearch('Dve polievky naraz'),
			normalizeSearch('Rezance'),
			schnitzel
		];
		expect(all.filter(searchMatcher(all, 'curry'))).toEqual([kari]);
		expect(all.filter(searchMatcher(all, 'polievky'))).toHaveLength(2);
		// Short words keep their ending: "rezen" is not "rezance".
		expect(all.filter(searchMatcher(all, 'rezen'))).toEqual([schnitzel]);
	});

	it('counts how many query words a text has', () => {
		expect(termsFound(dal, 'brokolica korenie mango')).toBe(2);
		expect(termsFound(hummus, 'curry')).toBe(0);
	});
});
