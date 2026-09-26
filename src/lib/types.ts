export const NUTRIENT_KEYS = [
	'kcal',
	'protein',
	'carbs',
	'fat',
	'fiber',
	'salt',
	'iron',
	'calcium',
	'zinc',
	'ala',
	'b12'
] as const;
export type NutrientKey = (typeof NUTRIENT_KEYS)[number];
export type Nutrients = Record<NutrientKey, number>;

export const UNITS = ['g', 'kg', 'ml', 'l', 'ks', 'pl', 'čl', 'hrnček', 'štipka'] as const;
export type Unit = (typeof UNITS)[number];

export type GlutenStatus = 'free' | 'risk' | 'contains';

export const ALLERGENS = [
	'soy',
	'peanuts',
	'nuts',
	'sesame',
	'mustard',
	'celery',
	'lupin',
	'sulphites'
] as const;
export type Allergen = (typeof ALLERGENS)[number];

export const INGREDIENT_CATEGORIES = [
	'zelenina',
	'ovocie',
	'strukoviny',
	'bielkoviny',
	'obilniny',
	'orechy-semienka',
	'rastlinne-mlieka',
	'omacky-pasty',
	'koreniny',
	'oleje',
	'ine'
] as const;
export type IngredientCategory = (typeof INGREDIENT_CATEGORIES)[number];

export const MEALS = ['ranajky', 'obed', 'vecera', 'snack', 'dezert'] as const;
export type Meal = (typeof MEALS)[number];

export interface Ingredient {
	id: string;
	name: string;
	category: IngredientCategory;
	/** Ingredients sharing a group are interchangeable for pantry matching (dry vs canned chickpeas). */
	group: string;
	gluten: GlutenStatus;
	allergens: Allergen[];
	/** Assumed to be at home (salt, oil, water) – never blocks a pantry match. */
	staple: boolean;
	per100g: Nutrients;
	/** Grams per unit; `ml` uses density. */
	units: Partial<Record<Unit, number>>;
	density: number;
	/** Rough €/kg used when no store price is known. Always labeled as an estimate. */
	priceEstimate: number;
	color: string;
	note?: string;
	warn?: string;
	gfAlternative?: string;
	/** Slugs of beginner technique pages (wiki section `zaklady`). */
	howto: string[];
}

export interface RecipeLine {
	ingredientId: string;
	/** Grams for the whole recipe (all servings). 0 for "to taste". */
	grams: number;
	amount: number | null;
	unit: Unit | null;
	note?: string;
}

export interface Warning {
	level: 'danger' | 'warn' | 'info';
	text: string;
}

export interface RecipeSummary {
	id: string;
	title: string;
	description: string;
	cuisine: string;
	meals: Meal[];
	time: number;
	activeTime: number;
	servings: number;
	difficulty: 1 | 2 | 3;
	tags: string[];
	gluten: GlutenStatus;
	/** True when every ingredient that contains gluten has a GF alternative (risky ones only need a label check). */
	gfSwappable: boolean;
	allergens: Allergen[];
	perServing: Nutrients;
	costPerServing: number;
	costIsEstimate: boolean;
	lines: RecipeLine[];
}

export interface RecipeDetail extends RecipeSummary {
	steps: string[];
	tips: string[];
	warnings: Warning[];
	howto: { slug: string; title: string }[];
}

export interface Store {
	id: string;
	name: string;
	color: string;
}

export interface PriceEntry {
	ingredientId: string;
	storeId: string;
	product: string;
	packGrams: number;
	price: number;
	/** ISO date the price was seen. */
	date: string;
	saleUntil?: string;
	url?: string;
}

export interface Cuisine {
	id: string;
	name: string;
	region: string;
	tagline: string;
	color: string;
	staples: string[];
	dishes: string[];
	pitfalls: string[];
}

export const WIKI_SECTIONS = ['zaklady', 'suplementy', 'navody'] as const;
export type WikiSection = (typeof WIKI_SECTIONS)[number];

export interface WikiPage {
	slug: string;
	title: string;
	summary: string;
	section: WikiSection;
	icon: string;
	order: number;
	html: string;
}

export interface Catalog {
	ingredients: Ingredient[];
	recipes: RecipeSummary[];
	cuisines: Cuisine[];
	stores: Store[];
	prices: PriceEntry[];
}
