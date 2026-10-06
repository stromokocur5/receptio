import { NUTRIENT_META } from '$lib/nutrition';
import { unitPrice } from '$lib/pricing';
import { SITE_ORIGIN } from '$lib/site';
import { NUTRIENT_KEYS, type NutrientKey } from '$lib/types';
import { getContent } from './content';
import { historyCsvRows } from './price-history';

/**
 * Receptio's open data: every resource is published as JSON and CSV under /data/v1/, described
 * by a Frictionless Data Package (datapackage.json) and an OpenAPI document (openapi.json).
 * The definitions below are the single source for all of them, so they can't drift apart.
 */

export const API_VERSION = 'v1';
export const API_BASE = `/data/${API_VERSION}`;
export const LICENSE = {
	name: 'CC-BY-4.0',
	title: 'Creative Commons Attribution 4.0',
	path: 'https://creativecommons.org/licenses/by/4.0/'
};

type FieldType = 'string' | 'number' | 'integer' | 'boolean' | 'date';

export interface Field {
	name: string;
	type: FieldType;
	description: string;
	/** Fields that may be empty; the rest are always filled. */
	optional?: boolean;
	enum?: string[];
}

export interface Resource {
	name: string;
	title: string;
	description: string;
	/** Where the data comes from, when it isn't Receptio's own. */
	sources?: { title: string; path: string }[];
	primaryKey?: string[];
	foreignKeys?: { fields: string; resource: string; field: string }[];
	fields: Field[];
	rows: () => Record<string, string | number | boolean | null>[];
}

const NUTRIENT_FIELD: Record<NutrientKey, string> = {
	kcal: 'kcal',
	protein: 'protein_g',
	carbs: 'carbs_g',
	fat: 'fat_g',
	fiber: 'fiber_g',
	salt: 'salt_g',
	iron: 'iron_mg',
	calcium: 'calcium_mg',
	zinc: 'zinc_mg',
	ala: 'ala_g',
	b12: 'b12_ug'
};

const nutrientFields = (per: string): Field[] =>
	NUTRIENT_KEYS.map((key) => ({
		name: NUTRIENT_FIELD[key],
		type: 'number',
		description: `${NUTRIENT_META[key].label} (${NUTRIENT_META[key].unit}) ${per}`
	}));

const round = (n: number, digits = 2) => Math.round(n * 10 ** digits) / 10 ** digits;
const nutrientValues = (n: Record<NutrientKey, number>) =>
	Object.fromEntries(NUTRIENT_KEYS.map((key) => [NUTRIENT_FIELD[key], round(n[key])]));

const PRICE_SOURCES = [
	{
		title: 'cenyslovensko.sk – ceny potravín, ktoré reťazce posielajú Ministerstvu financií SR',
		path: 'https://www.cenyslovensko.sk/'
	},
	{ title: 'Verejné stránky produktov v e-shopoch (odkaz pri každej cene)', path: SITE_ORIGIN }
];

export const RESOURCES: Resource[] = [
	{
		name: 'obchody',
		title: 'Obchody',
		description: 'Obchody a e-shopy, z ktorých sú ceny.',
		primaryKey: ['id'],
		fields: [
			{ name: 'id', type: 'string', description: 'Identifikátor obchodu' },
			{ name: 'name', type: 'string', description: 'Názov' },
			{
				name: 'online',
				type: 'boolean',
				description: 'E-shop s doručením (veľké balenia), nie kamenný obchod'
			}
		],
		rows: () =>
			getContent().stores.map((s) => ({ id: s.id, name: s.name, online: s.online ?? false }))
	},
	{
		name: 'suroviny',
		title: 'Suroviny',
		description:
			'Rastlinné suroviny s nutričnými hodnotami na 100 g a orientačnou cenou, keď reálnu nepoznáme.',
		primaryKey: ['id'],
		fields: [
			{ name: 'id', type: 'string', description: 'Identifikátor suroviny' },
			{ name: 'name', type: 'string', description: 'Názov po slovensky' },
			{ name: 'category', type: 'string', description: 'Kategória' },
			{
				name: 'gluten',
				type: 'string',
				enum: ['free', 'risk', 'contains'],
				description: 'Lepok: bez, riziko kontaminácie, obsahuje'
			},
			{ name: 'allergens', type: 'string', description: 'Alergény oddelené čiarkou' },
			{
				name: 'price_estimate_eur_kg',
				type: 'number',
				description: 'Hrubý odhad ceny za kg, keď z obchodov reálnu cenu nemáme'
			},
			{ name: 'url', type: 'string', description: 'Stránka suroviny' },
			...nutrientFields('na 100 g')
		],
		rows: () =>
			getContent().ingredients.map((i) => ({
				id: i.id,
				name: i.name,
				category: i.category,
				gluten: i.gluten,
				allergens: i.allergens.join(','),
				price_estimate_eur_kg: i.priceEstimate,
				url: `${SITE_ORIGIN}/suroviny/${i.id}`,
				...nutrientValues(i.per100g)
			}))
	},
	{
		name: 'ceny',
		title: 'Aktuálne ceny',
		description:
			'Ceny konkrétnych produktov v obchodoch ku dňu zverejnenia, vrátane akcií. Jednotková cena je za liter pri tekutinách, inak za kilogram.',
		sources: PRICE_SOURCES,
		foreignKeys: [
			{ fields: 'ingredient_id', resource: 'suroviny', field: 'id' },
			{ fields: 'store_id', resource: 'obchody', field: 'id' }
		],
		fields: [
			{ name: 'ingredient_id', type: 'string', description: 'Surovina' },
			{ name: 'store_id', type: 'string', description: 'Obchod' },
			{ name: 'product', type: 'string', description: 'Názov produktu v obchode' },
			{ name: 'pack', type: 'string', description: 'Balenie, napr. „500 g“ alebo „1 l“' },
			{ name: 'pack_grams', type: 'number', description: 'Hmotnosť balenia v gramoch' },
			{ name: 'price_eur', type: 'number', description: 'Cena balenia v eurách' },
			{ name: 'unit_price_eur', type: 'number', description: 'Cena za jednotku (kg alebo l)' },
			{ name: 'unit', type: 'string', enum: ['kg', 'l'], description: 'Jednotka jednotkovej ceny' },
			{ name: 'date', type: 'date', description: 'Deň, keď bola cena zistená' },
			{
				name: 'sale_until',
				type: 'date',
				optional: true,
				description: 'Pri akcii posledný deň platnosti'
			},
			{ name: 'online', type: 'boolean', description: 'Cena z e-shopu' },
			{ name: 'url', type: 'string', optional: true, description: 'Odkaz na produkt' }
		],
		rows: () =>
			getContent().prices.map((p) => {
				const unit = unitPrice(p);
				return {
					ingredient_id: p.ingredientId,
					store_id: p.storeId,
					product: p.product,
					pack: p.pack,
					pack_grams: round(p.packGrams, 1),
					price_eur: p.price,
					unit_price_eur: round(unit.value),
					unit: unit.unit,
					date: p.date,
					sale_until: p.saleUntil ?? null,
					online: p.online ?? false,
					url: p.url ?? null
				};
			})
	},
	{
		name: 'historia-cien',
		title: 'História cien',
		description:
			'Každá cena tak, ako bola v daný deň zaznamenaná: z obchodov denne, z e-shopov raz týždenne. Dni, keď sa synchronizácia nepodarila, chýbajú.',
		sources: PRICE_SOURCES,
		foreignKeys: [
			{ fields: 'ingredient_id', resource: 'suroviny', field: 'id' },
			{ fields: 'store_id', resource: 'obchody', field: 'id' }
		],
		fields: [
			{ name: 'date', type: 'date', description: 'Deň' },
			{ name: 'ingredient_id', type: 'string', description: 'Surovina' },
			{ name: 'store_id', type: 'string', description: 'Obchod' },
			{ name: 'price_eur', type: 'number', description: 'Cena balenia v eurách' },
			{ name: 'pack', type: 'string', description: 'Balenie' },
			{
				name: 'sale_until',
				type: 'date',
				optional: true,
				description: 'Pri akcii posledný deň platnosti'
			},
			{ name: 'product', type: 'string', description: 'Názov produktu v obchode' }
		],
		rows: () =>
			historyCsvRows()
				.slice(1)
				.map(([date, ingredient, store, price, pack, saleUntil, product]) => ({
					date,
					ingredient_id: ingredient,
					store_id: store,
					price_eur: Number(price),
					pack,
					sale_until: saleUntil || null,
					product
				}))
	},
	{
		name: 'recepty',
		title: 'Recepty',
		description:
			'Vegánske recepty s cenou a živinami na porciu. Cena je podľa aktuálnych cien, časť z nej je odhad (pozri cost_known_share).',
		primaryKey: ['id'],
		fields: [
			{ name: 'id', type: 'string', description: 'Identifikátor receptu' },
			{ name: 'title', type: 'string', description: 'Názov' },
			{ name: 'url', type: 'string', description: 'Stránka receptu' },
			{ name: 'cuisine', type: 'string', description: 'Kuchyňa' },
			{ name: 'categories', type: 'string', description: 'Kategórie oddelené čiarkou' },
			{ name: 'servings', type: 'integer', description: 'Počet porcií' },
			{ name: 'time_min', type: 'integer', description: 'Celkový čas v minútach' },
			{ name: 'difficulty', type: 'integer', description: 'Náročnosť 1–3' },
			{
				name: 'gluten',
				type: 'string',
				enum: ['free', 'risk', 'contains'],
				description: 'Lepok'
			},
			{ name: 'cost_per_serving_eur', type: 'number', description: 'Cena porcie' },
			{
				name: 'cost_known_share',
				type: 'number',
				description: 'Podiel ceny (0–1) z reálnych cien v obchodoch, zvyšok je odhad'
			},
			...nutrientFields('na porciu')
		],
		rows: () =>
			getContent().recipes.map((r) => ({
				id: r.id,
				title: r.title,
				url: `${SITE_ORIGIN}/recepty/${r.id}`,
				cuisine: r.cuisine,
				categories: r.categories.join(','),
				servings: r.servings,
				time_min: r.time,
				difficulty: r.difficulty,
				gluten: r.gluten,
				cost_per_serving_eur: round(r.costPerServing),
				cost_known_share: round(r.costKnownShare),
				...nutrientValues(r.perServing)
			}))
	},
	{
		name: 'recepty-suroviny',
		title: 'Suroviny v receptoch',
		description: 'Koľko ktorej suroviny recept potrebuje na celú dávku.',
		foreignKeys: [
			{ fields: 'recipe_id', resource: 'recepty', field: 'id' },
			{ fields: 'ingredient_id', resource: 'suroviny', field: 'id' }
		],
		fields: [
			{ name: 'recipe_id', type: 'string', description: 'Recept' },
			{ name: 'ingredient_id', type: 'string', description: 'Surovina' },
			{ name: 'grams', type: 'number', description: 'Gramy na celý recept (0 = podľa chuti)' },
			{ name: 'amount', type: 'number', optional: true, description: 'Množstvo v recepte' },
			{ name: 'unit', type: 'string', optional: true, description: 'Jednotka v recepte' },
			{ name: 'eaten', type: 'boolean', description: 'Zje sa (false: olej na vyprážanie, vývar…)' }
		],
		rows: () =>
			getContent().recipes.flatMap((r) =>
				r.lines.map((l) => ({
					recipe_id: r.id,
					ingredient_id: l.ingredientId,
					grams: round(l.grams, 1),
					amount: l.amount,
					unit: l.unit,
					eaten: !l.notEaten
				}))
			)
	}
];

export const resourceByName = new Map(RESOURCES.map((r) => [r.name, r]));
