import type { IngredientCategory, Meal } from './types';

export const CATEGORY_LABELS: Record<IngredientCategory, string> = {
	zelenina: 'Zelenina a bylinky',
	ovocie: 'Ovocie',
	strukoviny: 'Strukoviny',
	bielkoviny: 'Tofu a bielkoviny',
	obilniny: 'Obilniny a prílohy',
	'orechy-semienka': 'Orechy a semienka',
	'rastlinne-mlieka': 'Rastlinné mlieka',
	'omacky-pasty': 'Omáčky a pasty',
	koreniny: 'Koreniny',
	oleje: 'Oleje',
	nahrady: 'Vegánske náhrady',
	ine: 'Ostatné'
};

/** Categories almost everything is in; matching them would find far too much. */
const UNSEARCHED_INGREDIENT_CATEGORIES = new Set<IngredientCategory>(['koreniny', 'oleje', 'ine']);

/** What an ingredient is found by: name, synonyms and its category ("orechy", "huby"). */
export function ingredientSearchText(ingredient: {
	name: string;
	aliases?: string[];
	category: IngredientCategory;
}): string {
	return normalizeSearch(
		[
			ingredient.name,
			...(ingredient.aliases ?? []),
			UNSEARCHED_INGREDIENT_CATEGORIES.has(ingredient.category)
				? ''
				: CATEGORY_LABELS[ingredient.category]
		].join(' ')
	);
}

export function pluralRecipes(n: number): string {
	if (n === 1) return 'recept';
	if (n >= 2 && n <= 4) return 'recepty';
	return 'receptov';
}

export const MEAL_LABELS: Record<Meal, string> = {
	ranajky: 'Raňajky',
	obed: 'Obed',
	vecera: 'Večera',
	snack: 'Snack',
	dezert: 'Dezert',
	domace: 'Urob si doma'
};

/** Lowercase without diacritics, so "cicer" finds "Cícer". */
export function normalizeSearch(text: string): string {
	return text
		.toLowerCase()
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '');
}

/** Edits (insert, delete, substitute, swap neighbours) to turn a into b, or max + 1 if more. */
function editDistance(a: string, b: string, max: number): number {
	if (Math.abs(a.length - b.length) > max) return max + 1;
	let prev2: number[] = [];
	let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
	for (let i = 1; i <= a.length; i++) {
		const row = [i];
		let rowMin = i;
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			let d = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
				d = Math.min(d, prev2[j - 2] + 1);
			}
			row.push(d);
			rowMin = Math.min(rowMin, d);
		}
		if (rowMin > max) return max + 1;
		prev2 = prev;
		prev = row;
	}
	return prev[b.length];
}

/** One typo allowed from 4 letters, two from 8 – shorter words must match exactly. */
function allowedTypos(term: string): number {
	return term.length >= 8 ? 2 : term.length >= 4 ? 1 : 0;
}

/**
 * Whether one of the words is `term` with a few typos or another ending: the whole word
 * ("cicre" → "cicer"), the start of a longer word for 5+ letters ("brokolca" → "brokolicou"),
 * or the same stem ("ryza" → "ryzou"). A typo never shortens a word into the start of another
 * one, so "cicr" doesn't find "cier|ne".
 */
function nearWord(words: string[], term: string): boolean {
	const max = allowedTypos(term);
	if (!max) return false;
	const stem = term.slice(0, -1);
	return words.some((word) => {
		if (word.startsWith(stem)) return true;
		for (let len = term.length - max; len <= term.length + max; len++) {
			if (len < 1 || len > word.length) continue;
			const wholeWord = len === word.length;
			if (!wholeWord && (len < term.length || term.length < 5)) continue;
			if (editDistance(term, word.slice(0, len), max) <= max) return true;
		}
		return false;
	});
}

/**
 * Words people type that the recipes spell differently: English, Czech and dialect names.
 * Keys and values are normalized (lowercase, no diacritics).
 */
const SEARCH_SYNONYMS: Record<string, string[]> = {
	curry: ['kari'],
	karri: ['kari'],
	noodles: ['rezance'],
	nudle: ['rezance'],
	risotto: ['rizoto'],
	lazane: ['lasagne'],
	lasagna: ['lasagne'],
	spaghetti: ['spagety'],
	krumple: ['zemiaky'],
	zemaky: ['zemiaky'],
	brambory: ['zemiaky'],
	pomfri: ['hranolky'],
	fries: ['hranolky'],
	pomazanka: ['natierka'],
	cocka: ['sosovica'],
	lentils: ['sosovica'],
	chickpeas: ['cicer'],
	beans: ['fazula'],
	rice: ['ryza'],
	rajciny: ['paradajky'],
	rajcina: ['paradajky'],
	perogi: ['pirohy'],
	pierogi: ['pirohy'],
	houmous: ['hummus'],
	porridge: ['kasa'],
	pancakes: ['palacinky', 'lievance'],
	soup: ['polievka'],
	salad: ['salat'],
	bread: ['chlieb'],
	cake: ['kolac'],
	cookies: ['susienky'],
	keksy: ['susienky'],
	omeleta: ['prazenica']
};

/** From this length a word also matches its other endings ("polievky" finds "polievka"). */
const STEM_FROM = 6;

/** Whether a text has the term as typed, or a word with the same stem and another ending. */
function hasTerm(text: string, term: string): boolean {
	if (text.includes(term)) return true;
	if (term.length < STEM_FROM) return false;
	const stem = term.slice(0, -1);
	let at = text.indexOf(stem);
	while (at !== -1) {
		if (at === 0 || !/[\p{L}\p{N}]/u.test(text[at - 1])) return true;
		at = text.indexOf(stem, at + 1);
	}
	return false;
}

/** The query as words, each with the other names it goes by. */
function queryTerms(query: string): string[][] {
	return normalizeSearch(query)
		.split(/\s+/)
		.filter(Boolean)
		.map((term) => [term, ...(SEARCH_SYNONYMS[term] ?? [])]);
}

/**
 * Search over a list of (normalized) texts. Every word of the query must appear – as typed,
 * under another name ("curry" finds "kari") or with another ending; a word that appears nowhere
 * is matched with typos instead ("sosovcia" finds "šošovica"), and a query word may be the start
 * of a longer word ("sosov" → "šošovicová"). Words that do appear somewhere stay exact, so
 * "cicer" never turns into "čierne".
 */
export function searchMatcher(texts: string[], query: string): (text: string) => boolean {
	const terms = queryTerms(query);
	if (!terms.length) return () => true;
	const typoTerms = new Set(
		terms
			.filter((names) => !texts.some((text) => names.some((name) => hasTerm(text, name))))
			.map(([term]) => term)
	);
	return (text) => {
		let words: string[] | undefined;
		return terms.every((names) => {
			if (names.some((name) => hasTerm(text, name))) return true;
			if (!typoTerms.has(names[0])) return false;
			words ??= text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
			return nearWord(words, names[0]);
		});
	};
}

/**
 * How many of the query's words a (normalized) text has – for putting title matches first and
 * for offering the nearest recipes when nothing has all of them.
 */
export function termsFound(text: string, query: string): number {
	return queryTerms(query).filter((names) => names.some((name) => hasTerm(text, name))).length;
}

export function countTerms(query: string): number {
	return queryTerms(query).length;
}
