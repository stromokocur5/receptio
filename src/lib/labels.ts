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
