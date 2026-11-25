import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { parseAmount, toGrams } from '$lib/amounts';
import type { Dish, Part } from '$lib/dish';
import {
	ALLERGENS,
	EQUIPMENT_LEVELS,
	INGREDIENT_CATEGORIES,
	SHELF_KINDS,
	UNITS,
	type EquipmentFull,
	type Ingredient,
	type IngredientCategory,
	type PriceEntry,
	type Store,
	type Substitute
} from '$lib/types';
import { compileDishes, compileParts } from './dishes';

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'id musí byť kebab-case bez diakritiky');
const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i);
const isoDate = z.union([z.string(), z.date()]).transform((v, ctx) => {
	const iso = v instanceof Date ? v.toISOString().slice(0, 10) : v;
	if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
		ctx.addIssue({ code: 'custom', message: `Dátum musí byť YYYY-MM-DD: ${iso}` });
	}
	return iso;
});

const CATEGORY_COLORS: Record<IngredientCategory, string> = {
	zelenina: '#6fa35a',
	ovocie: '#e0643c',
	strukoviny: '#c9a063',
	bielkoviny: '#efe3c8',
	obilniny: '#f1e6cf',
	'orechy-semienka': '#a4724a',
	'rastlinne-mlieka': '#f7f1e3',
	'omacky-pasty': '#b8452c',
	koreniny: '#d99a2b',
	oleje: '#e8c65a',
	nahrady: '#f3ecdc',
	ine: '#cfc6b4'
};

const nutrientsSchema = z
	.object({
		kcal: z.number().min(0).max(900),
		p: z.number().min(0).max(100),
		c: z.number().min(0).max(100),
		f: z.number().min(0).max(100),
		fib: z.number().min(0).max(100),
		salt: z.number().min(0).max(100),
		fe: z.number().min(0).max(150),
		ca: z.number().min(0).max(2500),
		zn: z.number().min(0).max(20),
		ala: z.number().min(0).max(60).default(0),
		b12: z.number().min(0).max(100).default(0)
	})
	.strict();

const ingredientSchema = z
	.object({
		id: slug,
		name: z.string().min(1),
		/** Other words people search by: "huby" for šampiňóny. */
		aliases: z.array(z.string().min(1)).optional(),
		category: z.enum(INGREDIENT_CATEGORIES),
		group: slug.optional(),
		group_factor: z.number().positive().default(1),
		gluten: z.enum(['free', 'risk', 'contains']).default('free'),
		allergens: z.array(z.enum(ALLERGENS)).default([]),
		/** fodmap: grams per serving still low FODMAP, 0 = high in any amount. */
		diet: z
			.object({
				fodmap: z.number().min(0).optional(),
				fodmap_swap: slug.optional(),
				fodmap_ratio: z.number().positive().optional(),
				histamine: z.union([z.literal(true), z.number().min(0)]).optional(),
				oxalate: z.literal(true).optional(),
				nightshade: z.literal(true).optional()
			})
			.strict()
			.default({}),
		staple: z.boolean().default(false),
		/** How long it keeps once bought, see SHELF_KINDS. */
		shelf: z.enum(SHELF_KINDS).optional(),
		n: nutrientsSchema,
		units: z.partialRecord(z.enum(UNITS), z.number().positive()).default({}),
		density: z.number().positive().default(1),
		price: z.number().positive(),
		/** kg CO₂e per kg (Our World in Data). Kept in the data; the app no longer shows it. */
		co2: z.number().min(0).max(100).optional(),
		byproduct: z.boolean().default(false),
		color: hexColor.optional(),
		note: z.string().optional(),
		warn: z.string().optional(),
		gf_alternative: slug.optional(),
		free_sugar: z.number().min(0).max(1).default(0),
		/** How big a piece the amount is, for things measured by eye (ginger root in cm). */
		piece: z
			.object({ label: z.string().min(1), grams: z.number().positive() })
			.strict()
			.optional(),
		howto: z.array(slug).default([]),
		season: z.array(z.number().int().min(1).max(12)).default([]),
		about: z.string().min(1).optional(),
		kinds: z.array(z.string().min(1)).default([]),
		choose: z.string().min(1).optional(),
		storage: z.string().min(1).optional(),
		uses: z.array(z.string().min(1)).default([]),
		homemade: z
			.object({
				recipe: slug.optional(),
				steps: z.array(z.string().min(1)).default([]),
				note: z.string().min(1).optional()
			})
			.strict()
			.refine((h) => h.recipe || h.steps.length, 'homemade potrebuje `recipe` alebo `steps`')
			.optional(),
		substitutes: z
			.array(
				z
					.object({ to: slug.optional(), note: z.string().min(1).optional() })
					.strict()
					.refine((s) => s.to || s.note, 'náhrada potrebuje `to` alebo `note`')
			)
			.default([])
	})
	.strict();

const pricesSchema = z
	.object({
		stores: z.array(
			z
				.object({ id: slug, name: z.string(), color: hexColor, online: z.boolean().optional() })
				.strict()
		),
		entries: z
			.array(
				z
					.object({
						ingredient: slug,
						store: slug,
						product: z.string(),
						pack: z.string(),
						price: z.number().positive(),
						date: isoDate,
						sale_until: isoDate.optional(),
						url: z.url({ protocol: /^https$/ }).optional()
					})
					.strict()
			)
			.nullable()
			.transform((v) => v ?? [])
	})
	.strict();

const syncedPricesSchema = pricesSchema.pick({ entries: true });

const equipmentSchema = z
	.object({
		id: slug,
		name: z.string().min(1),
		level: z.enum(EQUIPMENT_LEVELS),
		icon: z.string().min(1),
		about: z.string().min(1),
		alternatives: z.array(z.string().min(1)).min(1),
		uses: z.array(z.string().min(1)).default([]),
		kinds: z.array(z.string().min(1)).default([]),
		choose: z.string().min(1).optional(),
		care: z.string().min(1).optional(),
		// Clues for detecting tools in free-text recipes; parts say what they need instead.
		match: z.array(z.string()).default([]),
		weak: z.array(z.string()).default([]),
		unless: z.array(slug).default([])
	})
	.strict();

function parseWith<T>(schema: z.ZodType<T>, data: unknown, where: string): T {
	const result = schema.safeParse(data);
	if (!result.success) throw new Error(`${where}: ${z.prettifyError(result.error)}`);
	return result.data;
}

export interface Content {
	ingredients: Ingredient[];
	/** What to use instead of an ingredient. */
	substitutes: Map<string, Substitute[]>;
	stores: Store[];
	prices: PriceEntry[];
	equipment: EquipmentFull[];
	parts: Part[];
	dishes: Dish[];
}

export interface RawContent {
	ingredients: string;
	equipment: string;
	prices: string;
	/** Generated by the price sync scripts; same entries format as prices.yaml, no stores. */
	pricesSynced: string;
	pricesEshops: string;
	pricesBilla: string;
	pricesKaufland: string;
	pricesKosik: string;
	parts: Record<string, string>;
	dishes: Record<string, string>;
}

export function compileContent(raw: RawContent, today: Date): Content {
	const rawIngredients = parseWith(
		z.array(ingredientSchema),
		parseYaml(raw.ingredients),
		'content/ingredients.yaml'
	);
	const ingredients: Ingredient[] = rawIngredients.map((i) => ({
		id: i.id,
		name: i.name,
		aliases: i.aliases,
		category: i.category,
		group: i.group ?? i.id,
		groupFactor: i.group_factor,
		gluten: i.gluten,
		allergens: i.allergens,
		...(i.diet.fodmap !== undefined && { fodmapLimit: i.diet.fodmap }),
		...(i.diet.fodmap_swap && {
			fodmapSwap: { to: i.diet.fodmap_swap, ratio: i.diet.fodmap_ratio ?? 1 }
		}),
		...(i.diet.histamine !== undefined && {
			histamineLimit: i.diet.histamine === true ? 0 : i.diet.histamine
		}),
		oxalate: i.diet.oxalate ?? false,
		nightshade: i.diet.nightshade ?? false,
		staple: i.staple,
		...(i.shelf && { shelf: i.shelf }),
		per100g: {
			kcal: i.n.kcal,
			protein: i.n.p,
			carbs: i.n.c,
			fat: i.n.f,
			fiber: i.n.fib,
			salt: i.n.salt,
			iron: i.n.fe,
			calcium: i.n.ca,
			zinc: i.n.zn,
			ala: i.n.ala,
			b12: i.n.b12
		},
		units: i.units,
		density: i.density,
		priceEstimate: i.price,
		byproduct: i.byproduct,
		color: i.color ?? CATEGORY_COLORS[i.category],
		note: i.note,
		warn: i.warn,
		gfAlternative: i.gf_alternative,
		freeSugar: i.free_sugar,
		piece: i.piece,
		howto: i.howto,
		swapsTo: i.substitutes.flatMap((sub) => (sub.to ? [sub.to] : [])),
		homemade: i.homemade !== undefined,
		season: [...new Set(i.season)].sort((a, b) => a - b)
	}));

	const byId = new Map(ingredients.map((i) => [i.id, i]));
	if (byId.size !== ingredients.length) throw new Error('ingredients.yaml: duplicitné id');
	for (const i of ingredients) {
		if (i.gfAlternative && byId.get(i.gfAlternative)?.gluten !== 'free') {
			throw new Error(
				`${i.id}: gf_alternative "${i.gfAlternative}" neexistuje alebo nie je bezlepková`
			);
		}
		const swap = i.fodmapSwap && byId.get(i.fodmapSwap.to);
		if (i.fodmapSwap && (!swap || swap.fodmapLimit === 0)) {
			throw new Error(
				`${i.id}: fodmap_swap "${i.fodmapSwap.to}" neexistuje alebo nie je low FODMAP`
			);
		}
	}
	// Kept out of Ingredient: only recipe pages need them, and the catalog ships with every page.
	const substitutesById = new Map<string, Substitute[]>(
		rawIngredients.map((i) => [
			i.id,
			i.substitutes.map(({ to, note }) => {
				const target = to ? byId.get(to) : undefined;
				if (to && !target) throw new Error(`${i.id}: neznáma náhrada "${to}"`);
				return {
					...(target && { to: { id: target.id, name: target.name } }),
					...(note && { note })
				};
			})
		])
	);

	const pricesRaw = parseWith(pricesSchema, parseYaml(raw.prices), 'content/prices.yaml');
	const pricesSynced = parseWith(
		syncedPricesSchema,
		parseYaml(raw.pricesSynced),
		'content/prices-cenyslovensko.yaml'
	);
	const pricesEshops = parseWith(
		syncedPricesSchema,
		parseYaml(raw.pricesEshops),
		'content/prices-eshops.yaml'
	);
	const pricesBilla = parseWith(
		syncedPricesSchema,
		parseYaml(raw.pricesBilla),
		'content/prices-billa.yaml'
	);
	const pricesKaufland = parseWith(
		syncedPricesSchema,
		parseYaml(raw.pricesKaufland),
		'content/prices-kaufland.yaml'
	);
	const pricesKosik = parseWith(
		syncedPricesSchema,
		parseYaml(raw.pricesKosik),
		'content/prices-kosik-sk.yaml'
	);
	const stores: Store[] = pricesRaw.stores;
	const storeIds = new Set(stores.map((s) => s.id));
	const onlineStores = new Set(stores.filter((s) => s.online).map((s) => s.id));
	const priceEntries = [
		...pricesRaw.entries.map((e, index) => ({ e, where: `content/prices.yaml entries[${index}]` })),
		...pricesSynced.entries.map((e, index) => ({
			e,
			where: `content/prices-cenyslovensko.yaml entries[${index}]`
		})),
		...pricesEshops.entries.map((e, index) => ({
			e,
			where: `content/prices-eshops.yaml entries[${index}]`
		})),
		...pricesBilla.entries.map((e, index) => ({
			e,
			where: `content/prices-billa.yaml entries[${index}]`
		})),
		...pricesKaufland.entries.map((e, index) => ({
			e,
			where: `content/prices-kaufland.yaml entries[${index}]`
		})),
		...pricesKosik.entries.map((e, index) => ({
			e,
			where: `content/prices-kosik-sk.yaml entries[${index}]`
		}))
	];
	const prices: PriceEntry[] = priceEntries.map(({ e, where }) => {
		const ingredient = byId.get(e.ingredient);
		if (!ingredient) throw new Error(`${where}: neznáma surovina "${e.ingredient}"`);
		if (!storeIds.has(e.store)) throw new Error(`${where}: neznámy obchod "${e.store}"`);
		const pack = parseAmount(e.pack);
		return {
			ingredientId: e.ingredient,
			storeId: e.store,
			product: e.product,
			pack: e.pack,
			packGrams: toGrams(pack.amount, pack.unit, ingredient),
			price: e.price,
			date: e.date,
			saleUntil: e.sale_until,
			url: e.url,
			...(onlineStores.has(e.store) && { online: true })
		};
	});

	const equipment: EquipmentFull[] = parseWith(
		z.array(equipmentSchema),
		parseYaml(raw.equipment),
		'content/equipment.yaml'
	).map(({ match: _match, weak: _weak, unless: _unless, ...e }) => e);
	if (new Set(equipment.map((e) => e.id)).size !== equipment.length) {
		throw new Error('equipment.yaml: duplicitné id');
	}

	const parts = compileParts(raw.parts, byId, { prices, today });
	const dishes = compileDishes(raw.dishes, new Set(parts.map((p) => p.id)));

	return {
		ingredients,
		substitutes: substitutesById,
		stores,
		prices,
		equipment,
		parts,
		dishes
	};
}

const rawFile = (files: Record<string, string>) => Object.values(files)[0];

let cached: Content | undefined;

export function getContent(): Content {
	cached ??= compileContent(
		{
			ingredients: rawFile(
				import.meta.glob('/content/ingredients.yaml', {
					query: '?raw',
					import: 'default',
					eager: true
				})
			),
			equipment: rawFile(
				import.meta.glob('/content/equipment.yaml', {
					query: '?raw',
					import: 'default',
					eager: true
				})
			),
			prices: rawFile(
				import.meta.glob('/content/prices.yaml', { query: '?raw', import: 'default', eager: true })
			),
			pricesSynced: rawFile(
				import.meta.glob('/content/prices-cenyslovensko.yaml', {
					query: '?raw',
					import: 'default',
					eager: true
				})
			),
			pricesEshops: rawFile(
				import.meta.glob('/content/prices-eshops.yaml', {
					query: '?raw',
					import: 'default',
					eager: true
				})
			),
			pricesBilla: rawFile(
				import.meta.glob('/content/prices-billa.yaml', {
					query: '?raw',
					import: 'default',
					eager: true
				})
			),
			pricesKaufland: rawFile(
				import.meta.glob('/content/prices-kaufland.yaml', {
					query: '?raw',
					import: 'default',
					eager: true
				})
			),
			pricesKosik: rawFile(
				import.meta.glob('/content/prices-kosik-sk.yaml', {
					query: '?raw',
					import: 'default',
					eager: true
				})
			),
			parts: import.meta.glob('/content/casti/*.yaml', {
				query: '?raw',
				import: 'default',
				eager: true
			}),
			dishes: import.meta.glob('/content/jedla/*.yaml', {
				query: '?raw',
				import: 'default',
				eager: true
			})
		},
		new Date()
	);
	return cached;
}
