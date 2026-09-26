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
	domace: 'Urob si sám'
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
 * Whether every word of the query appears in the (normalized) text, tolerating typos:
 * "sosovcia" finds "šošovica", "brokolca" finds "brokolica". A query word may also be the
 * start of a longer word ("sosov" → "šošovicová").
 */
export function matchesSearch(text: string, query: string): boolean {
	const terms = normalizeSearch(query).split(/\s+/).filter(Boolean);
	if (!terms.length) return true;
	let words: string[] | undefined;
	return terms.every((term) => {
		if (text.includes(term)) return true;
		const max = allowedTypos(term);
		if (!max) return false;
		words ??= text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
		return words.some((word) => {
			for (let len = term.length - max; len <= term.length + max; len++) {
				if (len < 1 || len > word.length) continue;
				if (editDistance(term, word.slice(0, len), max) <= max) return true;
			}
			return false;
		});
	});
}
