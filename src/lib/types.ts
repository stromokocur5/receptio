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
	'nahrady',
	'ine'
] as const;
export type IngredientCategory = (typeof INGREDIENT_CATEGORIES)[number];

export const MEALS = ['ranajky', 'obed', 'vecera', 'snack', 'dezert', 'domace'] as const;
export type Meal = (typeof MEALS)[number];

export interface Ingredient {
	id: string;
	name: string;
	category: IngredientCategory;
	/** Ingredients sharing a group are interchangeable for pantry matching (dry vs canned chickpeas). */
	group: string;
	/**
	 * Grams of the group's reference form one gram of this makes, so pantry amounts compare
	 * fairly (1 g dry chickpeas ≈ 2.4 g drained canned ones). 1 for most ingredients.
	 */
	groupFactor: number;
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
	/** Leftover of another recipe (okara, aquafaba) – effectively free, never "bought". */
	byproduct: boolean;
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
	/** Used for cooking but not eaten (simmering broth, frying oil) – bought, not counted in nutrition. */
	notEaten?: boolean;
}

export interface Warning {
	level: 'danger' | 'warn' | 'info';
	text: string;
}

/** Everything that depends on the ingredient list, so a variant can recompute it. */
export interface RecipeComputed {
	lines: RecipeLine[];
	gluten: GlutenStatus;
	/** True when every ingredient that contains gluten has a GF alternative (risky ones only need a label check). */
	gfSwappable: boolean;
	allergens: Allergen[];
	perServing: Nutrients;
	costPerServing: number;
	costIsEstimate: boolean;
	/** Uses vegan convenience substitutes (plant cream, butter, cheese, mayo…). */
	usesSubstitutes: boolean;
	warnings: Warning[];
}

export interface RecipeVariant extends RecipeComputed {
	name: string;
	description: string;
}

export interface RecipeSummary extends RecipeComputed {
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
	/** Preparation that has to start earlier (soaking, overnight rest), not counted in `time`. */
	ahead?: string;
	/** What a batch makes (DIY staples), e.g. "cca 400 g tofu". */
	yields?: string;
	/** False when summing ingredients misstates the result (strained soy milk, tofu). */
	showNutrition: boolean;
	/** none = no substitutes; optional = a variant avoids them; required = every version uses them. */
	substitutes: 'none' | 'optional' | 'required';
	variants: RecipeVariant[];
	/** Equipment ids, so lists can filter out recipes needing an oven or blender. */
	equipment: string[];
}

export const EQUIPMENT_LEVELS = ['zaklad', 'uzitocne', 'specialne'] as const;
export type EquipmentLevel = (typeof EQUIPMENT_LEVELS)[number];

export interface Equipment {
	id: string;
	name: string;
	level: EquipmentLevel;
	icon: string;
	about: string;
	/** What to use when you don't have it. */
	alternatives: string[];
}

export interface RecipeDetail extends RecipeSummary {
	/** Tools the recipe needs, basic ones first. */
	equipmentDetail: Equipment[];
	steps: string[];
	tips: string[];
	howto: { slug: string; title: string }[];
	related: { id: string; title: string }[];
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
