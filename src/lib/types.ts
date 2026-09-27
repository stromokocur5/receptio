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
	/** kg CO₂e per kg, from Our World in Data (category average when unknown). */
	co2: number;
	/** Leftover of another recipe (okara, aquafaba) – effectively free, never "bought". */
	byproduct: boolean;
	color: string;
	note?: string;
	warn?: string;
	gfAlternative?: string;
	/** Slugs of beginner technique pages (wiki section `zaklady`). */
	howto: string[];
	/** Ingredients that can stand in for this one (from its substitutes). */
	swapsTo: string[];
	/** Can be made at home instead of bought (details in IngredientInfo). */
	homemade: boolean;
	/** Months (1–12) when it's grown locally and cheapest; empty = no season. */
	season: number[];
}

export interface Substitute {
	/** Another ingredient from the database, when the swap is one. */
	to?: { id: string; name: string };
	note?: string;
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
	/** Rough kg CO₂e of the ingredients per serving. */
	co2PerServing: number;
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
	/** 0 mild (fine for kids) … 3 hot. */
	spicy: 0 | 1 | 2 | 3;
	/** Days in the fridge (0 = eat fresh) and months in the freezer (0 = don't freeze). */
	keeps?: { fridge: number; freezer: number };
	/** ISO date the recipe was actually cooked and checked. */
	tested?: string;
	/** Raw weight of everything eaten, per serving – a rough portion size. */
	servingGrams: number;
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

/** The encyclopedia part of an equipment entry, only on its own page. */
export interface EquipmentFull extends Equipment {
	uses: string[];
	kinds: string[];
	choose?: string;
	care?: string;
}

/** Encyclopedia text of an ingredient, only on its own page. */
export interface IngredientInfo {
	about?: string;
	kinds: string[];
	choose?: string;
	storage?: string;
	uses: string[];
	homemade?: Homemade;
}

/** How to make an ingredient yourself instead of buying it. */
export interface Homemade {
	/** A full recipe on the site, when there is one. */
	recipe?: { id: string; title: string };
	/** Short steps, for things too simple (or too long-winded) for a recipe. */
	steps: string[];
	/** Whether it pays off, how long it keeps. */
	note?: string;
}

export interface RecipeDetail extends RecipeSummary {
	/** Tools the recipe needs, basic ones first. */
	equipmentDetail: Equipment[];
	/** What to use instead of an ingredient, for every ingredient of the recipe and its variants. */
	swaps: Record<string, Substitute[]>;
	/** What to make of leftovers. */
	leftovers?: string;
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
	/** Pack size as sold, e.g. "1 l" or "500 g". */
	pack: string;
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

export const GROW_PLACES = ['parapet', 'balkon', 'zahrada'] as const;
export type GrowPlace = (typeof GROW_PLACES)[number];
export const GROW_SUN = ['slnko', 'polotien', 'tien'] as const;
export type GrowSun = (typeof GROW_SUN)[number];

/** How to grow an ingredient yourself (content/pestovanie.yaml). */
export interface GrowGuide {
	ingredientId: string;
	name: string;
	where: GrowPlace[];
	/** Light it copes with, best first. */
	sun: GrowSun[];
	/** 1 easy … 3 needs care. */
	level: 1 | 2 | 3;
	/** Distance between plants in cm (0 = sown densely, e.g. sprouts). */
	spacing: number;
	/** Plant family, for rotating beds year to year. */
	family: string;
	/** Rough harvest per plant in kg (a jar of sprouts a week counts as one plant). */
	yieldKg: number;
	/** Common troubles and what to do about them. */
	problems: string[];
	/** How to keep your own seed. */
	seeds: string;
	/** What to do with a glut: storing, freezing, drying, preserving. */
	preserve: string;
	/** Months (1–12) to start seedlings indoors. */
	indoor: number[];
	/** Months to sow or plant outside (or into the pot). */
	sow: number[];
	harvest: number[];
	/** Perennials stay in place for years. */
	perennial: boolean;
	how: string;
	tip?: string;
	/** Why it's one of the crops worth growing here; featured on /pestuj. */
	recommend?: string;
	/** Good neighbours and plants to keep away (ingredient ids). */
	friends: string[];
	avoid: string[];
}

/** Why an ingredient isn't grown here and where it comes from. */
export interface NotGrown {
	ingredientId: string;
	name: string;
	/** `nie` = not in our climate, `tazko` = only with luck, a greenhouse or as a pot curiosity. */
	status: 'nie' | 'tazko';
	origin: string;
	note?: string;
}

/** A polyculture: plants that help each other, planted together as one module of `area` m². */
export interface GrowCombo {
	id: string;
	name: string;
	where: GrowPlace[];
	sun: GrowSun[];
	level: 1 | 2 | 3;
	area: number;
	/** `rows`: crops in bands, tall ones north; `mix`: interplanted (three sisters). */
	layout: 'rows' | 'mix';
	/** Most modules worth planting (perennial borders, herb spirals); unlimited when absent. */
	max?: number;
	/** Plants per module, by ingredient id. */
	members: { ingredientId: string; name: string; count: number }[];
	how: string;
	why: string;
	/** Containers, supports and covers this combination needs beyond basic tools. */
	gear: string[];
}

export const WIKI_SECTIONS = ['zaklady', 'suplementy', 'navody', 'pohyb'] as const;
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
