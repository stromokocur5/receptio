import { marked } from 'marked';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { parseAmount, toGrams } from '$lib/amounts';
import {
	SALT_HIGH_G,
	recipeAllergens,
	recipeGluten,
	recipeNutrients,
	recipeWarnings
} from '$lib/nutrition';
import { CATEGORY_PATHS, guessTaste } from '$lib/categories';
import { ART_NAMES, artFigure } from '$lib/wiki-art';
import { normalizeSearch } from '$lib/labels';
import { bestPrice } from '$lib/pricing';
import {
	ALLERGENS,
	EQUIPMENT_LEVELS,
	GROW_FORMS,
	GROW_PLACES,
	GROW_SUN,
	INGREDIENT_CATEGORIES,
	MEALS,
	TASTES,
	UNITS,
	WIKI_GROUPS,
	WIKI_SECTIONS,
	type Catalog,
	type Cuisine,
	type Equipment,
	type GrowCombo,
	type GrowGuide,
	type NotGrown,
	type EquipmentFull,
	type Ingredient,
	type Homemade,
	type IngredientInfo,
	type IngredientCategory,
	type PriceEntry,
	type RecipeComputed,
	type RecipeDetail,
	type RecipeLine,
	type RecipeVariant,
	type Store,
	type Substitute,
	type WikiPage
} from '$lib/types';

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'id musí byť kebab-case bez diakritiky');
const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i);
const isoDate = z.union([z.string(), z.date()]).transform((v, ctx) => {
	const iso = v instanceof Date ? v.toISOString().slice(0, 10) : v;
	if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
		ctx.addIssue({ code: 'custom', message: `Dátum musí byť YYYY-MM-DD: ${iso}` });
	}
	return iso;
});

/** kg CO₂e per kg when an ingredient has no own value (Our World in Data category averages). */
const CATEGORY_CO2: Record<IngredientCategory, number> = {
	zelenina: 0.5,
	ovocie: 0.7,
	strukoviny: 1.8,
	bielkoviny: 3,
	obilniny: 1.6,
	'orechy-semienka': 1,
	'rastlinne-mlieka': 1,
	'omacky-pasty': 1.5,
	koreniny: 2,
	oleje: 3.8,
	nahrady: 2,
	ine: 1.5
};

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
		staple: z.boolean().default(false),
		n: nutrientsSchema,
		units: z.partialRecord(z.enum(UNITS), z.number().positive()).default({}),
		density: z.number().positive().default(1),
		price: z.number().positive(),
		co2: z.number().min(0).max(100).optional(),
		byproduct: z.boolean().default(false),
		color: hexColor.optional(),
		note: z.string().optional(),
		warn: z.string().optional(),
		gf_alternative: slug.optional(),
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

const ingredientLineSchema = z
	.record(slug, z.string())
	.refine((r) => Object.keys(r).length === 1, 'každý riadok má mať práve jednu surovinu');

const variantSchema = z
	.object({
		name: z.string().min(1),
		description: z.string().min(1),
		/** Swap one ingredient for another; without `amount` the same quantity is used. */
		replace: z
			.array(z.object({ from: slug, to: slug, amount: z.string().optional() }).strict())
			.default([]),
		add: z.array(ingredientLineSchema).default([]),
		remove: z.array(slug).default([])
	})
	.strict();

const recipeSchema = z
	.object({
		title: z.string().min(1),
		description: z.string().min(1),
		cuisine: slug,
		meals: z.array(z.enum(MEALS)).min(1),
		/** What kind of dish, "hlavne/kari"; the first one is where it belongs most. */
		categories: z.array(z.enum(CATEGORY_PATHS as [string, ...string[]])).min(1),
		time: z.number().int().positive(),
		active: z.number().int().positive(),
		servings: z.number().int().positive(),
		difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
		tags: z.array(z.string()).default([]),
		ahead: z.string().optional(),
		/** false when a 1:1 flour swap would ruin the dish (pizza dough, halušky). */
		gf_swap: z.boolean().default(true),
		yields: z.string().optional(),
		nutrition: z.boolean().default(true),
		related: z.array(slug).default([]),
		ingredients: z.array(ingredientLineSchema).min(1),
		steps: z.array(z.string().min(1)).min(1),
		tips: z.array(z.string()).default([]),
		howto: z.array(slug).default([]),
		variants: z.array(variantSchema).default([]),
		/** Tools the step text doesn't reveal, and false positives of the detection. */
		equipment: z.array(slug).default([]),
		no_equipment: z.array(slug).default([]),
		/** 0 mild … 3 hot. */
		spicy: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).default(0),
		/** Only when the guess from categories and ingredients is wrong; `neutralne` = neither. */
		taste: z.enum([...TASTES, 'neutralne']).optional(),
		/** Days in the fridge (0 = eat fresh), months in the freezer (0 = don't freeze). */
		keeps: z
			.object({
				fridge: z.number().int().min(0).max(30),
				freezer: z.number().int().min(0).max(12).default(0)
			})
			.strict()
			.optional(),
		leftovers: z.string().min(1).optional(),
		/** Date the recipe was cooked for real and the amounts and times checked. */
		tested: isoDate.optional()
	})
	.strict();

const monthsSchema = z.array(z.number().int().min(1).max(12)).default([]);
const growLevel = z.union([z.literal(1), z.literal(2), z.literal(3)]);
const growFileSchema = z
	.object({
		plodiny: z.array(
			z
				.object({
					ingredient: slug,
					/** Plant name when the ingredient's is a shop product ("Hrášok mrazený" → "Hrach"). */
					name: z.string().min(1).optional(),
					where: z.array(z.enum(GROW_PLACES)).min(1),
					sun: z.array(z.enum(GROW_SUN)).min(1),
					level: growLevel,
					spacing: z.number().int().min(0).max(800),
					family: z.string().min(1),
					yield: z.number().positive(),
					problems: z.array(z.string().min(1)).default([]),
					seeds: z.string().min(1),
					preserve: z.string().min(1),
					indoor: monthsSchema,
					sow: monthsSchema.refine((m) => m.length > 0, 'sow potrebuje aspoň jeden mesiac'),
					harvest: monthsSchema.refine((m) => m.length > 0, 'harvest potrebuje aspoň jeden mesiac'),
					perennial: z.boolean().default(false),
					form: z.enum(GROW_FORMS).optional(),
					height: z.number().positive().max(40).optional(),
					years: z.number().int().min(0).max(30).optional(),
					pollination: z.string().min(1).optional(),
					how: z.string().min(1),
					tip: z.string().min(1).optional(),
					recommend: z.string().min(1).optional(),
					friends: z.array(slug).default([]),
					avoid: z.array(slug).default([])
				})
				.strict()
		),
		kombinacie: z.array(
			z
				.object({
					id: slug,
					name: z.string().min(1),
					where: z.array(z.enum(GROW_PLACES)).min(1),
					sun: z.array(z.enum(GROW_SUN)).min(1),
					level: growLevel,
					area: z.number().positive(),
					max: z.number().int().positive().optional(),
					layout: z.enum(['rows', 'mix', 'kruh']).default('rows'),
					depth: z.number().positive().optional(),
					members: z.record(slug, z.number().int().positive()),
					how: z.string().min(1),
					why: z.string().min(1),
					gear: z.array(z.string().min(1)).default([])
				})
				.strict()
		),
		nepestovatelne: z.array(
			z
				.object({
					ingredient: slug,
					status: z.enum(['nie', 'tazko']),
					origin: z.string().min(1),
					note: z.string().min(1).optional()
				})
				.strict()
		)
	})
	.strict();

const pattern = z.string().transform((source, ctx) => {
	try {
		return new RegExp(source, 'u');
	} catch {
		ctx.addIssue({ code: 'custom', message: `neplatný regulárny výraz: ${source}` });
		return z.NEVER;
	}
});

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
		match: z.array(pattern),
		/** Weaker clues, used only when none of `unless` was detected. */
		weak: z.array(pattern).default([]),
		unless: z.array(slug).default([])
	})
	.strict();

const GF_VARIANT_NAME = 'Bezlepková verzia';
const LOW_SALT_VARIANT_NAME = 'Menej soli';
/** Seasonings halved in the low-salt version: salt itself and salty sauces and pastes (g salt / 100 g). */
const SALTY_SEASONING_MIN = 1.5;

const cuisineSchema = z
	.object({
		id: slug,
		name: z.string(),
		region: z.string(),
		tagline: z.string(),
		color: hexColor,
		staples: z.array(z.string()),
		dishes: z.array(z.string()),
		pitfalls: z.array(z.string())
	})
	.strict();

const pricesSchema = z
	.object({
		stores: z.array(z.object({ id: slug, name: z.string(), color: hexColor }).strict()),
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

const wikiFrontmatterSchema = z
	.object({
		title: z.string(),
		summary: z.string(),
		section: z.enum(WIKI_SECTIONS),
		group: z.enum(WIKI_GROUPS).optional(),
		icon: z.string(),
		order: z.number(),
		/** Drawing from wiki-art shown on the page's card. */
		art: z.enum(ART_NAMES as [string, ...string[]]).optional()
	})
	.strict();

function parseWith<T>(schema: z.ZodType<T>, data: unknown, where: string): T {
	const result = schema.safeParse(data);
	if (!result.success) throw new Error(`${where}: ${z.prettifyError(result.error)}`);
	return result.data;
}

function fileId(path: string): string {
	return path
		.split('/')
		.pop()!
		.replace(/\.(ya?ml|md)$/, '');
}

export interface Content extends Catalog {
	recipeDetails: Map<string, RecipeDetail>;
	equipment: EquipmentFull[];
	ingredientInfo: Map<string, IngredientInfo>;
	/** Substitutes of every ingredient, for ingredient pages. */
	ingredientSwaps: Map<string, Substitute[]>;
	wiki: WikiPage[];
	/** Growing guides, alphabetical. */
	grow: GrowGuide[];
	growCombos: GrowCombo[];
	notGrown: NotGrown[];
}

export interface RawContent {
	ingredients: string;
	equipment: string;
	cuisines: string;
	prices: string;
	/** Generated by `pnpm prices:sync`; same entries format as prices.yaml, no stores. */
	pricesSynced: string;
	recipes: Record<string, string>;
	wiki: Record<string, string>;
	grow: string;
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
		staple: i.staple,
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
		co2: i.co2 ?? CATEGORY_CO2[i.category],
		byproduct: i.byproduct,
		color: i.color ?? CATEGORY_COLORS[i.category],
		note: i.note,
		warn: i.warn,
		gfAlternative: i.gf_alternative,
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

	const cuisines: Cuisine[] = parseWith(
		z.array(cuisineSchema),
		parseYaml(raw.cuisines),
		'content/cuisines.yaml'
	);
	const cuisineIds = new Set(cuisines.map((c) => c.id));

	const pricesRaw = parseWith(pricesSchema, parseYaml(raw.prices), 'content/prices.yaml');
	const pricesSynced = parseWith(
		syncedPricesSchema,
		parseYaml(raw.pricesSynced),
		'content/prices-cenyslovensko.yaml'
	);
	const stores: Store[] = pricesRaw.stores;
	const storeIds = new Set(stores.map((s) => s.id));
	const priceEntries = [
		...pricesRaw.entries.map((e, index) => ({ e, where: `content/prices.yaml entries[${index}]` })),
		...pricesSynced.entries.map((e, index) => ({
			e,
			where: `content/prices-cenyslovensko.yaml entries[${index}]`
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
			url: e.url
		};
	});

	const wiki: WikiPage[] = Object.entries(raw.wiki)
		.map(([path, text]) => {
			const where = `content/wiki/${fileId(path)}.md`;
			const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text.replace(/\r\n/g, '\n'));
			if (!match) throw new Error(`${where}: chýba frontmatter`);
			const meta = parseWith(wikiFrontmatterSchema, parseYaml(match[1]), where);
			// `{{art:name|caption}}` on its own line becomes one of the drawn diagrams.
			const body = match[2].replace(
				/^\{\{art:([a-z0-9-]+)(?:\|(.+))?\}\}$/gm,
				(_m, name, caption) => artFigure(name, caption)
			);
			return { slug: fileId(path), ...meta, html: marked.parse(body, { async: false }) };
		})
		.sort((a, b) => a.order - b.order);

	const wikiBySlug = new Map(wiki.map((w) => [w.slug, w]));
	const howtoLink = (slugId: string, where: string) => {
		const page = wikiBySlug.get(slugId);
		if (!page) throw new Error(`${where}: neznámy návod "${slugId}" (content/wiki/${slugId}.md)`);
		return { slug: page.slug, title: page.title };
	};
	for (const i of ingredients) for (const h of i.howto) howtoLink(h, `ingredients.yaml ${i.id}`);

	const parseLine = (ingredientId: string, amountText: string, where: string): RecipeLine => {
		const ingredient = byId.get(ingredientId);
		if (!ingredient) throw new Error(`${where}: neznáma surovina "${ingredientId}"`);
		try {
			const { amount, unit, note, notEaten } = parseAmount(amountText);
			const line: RecipeLine = {
				ingredientId,
				grams: toGrams(amount, unit, ingredient),
				amount,
				unit,
				note
			};
			if (notEaten) line.notEaten = true;
			return line;
		} catch (error) {
			throw new Error(`${where}: ${ingredientId}: ${(error as Error).message}`);
		}
	};

	/** Same quantity, new ingredient: keep the kitchen unit when it still makes sense, else grams. */
	const swapLine = (line: RecipeLine, toId: string, where: string): RecipeLine => {
		const to = byId.get(toId);
		if (!to) throw new Error(`${where}: neznáma surovina "${toId}"`);
		try {
			toGrams(line.amount, line.unit, to);
			return { ...line, ingredientId: toId };
		} catch {
			return { ...line, ingredientId: toId, amount: Math.round(line.grams), unit: 'g' };
		}
	};

	/** A swap can leave the same ingredient twice (butter → oil next to oil); merge same-unit lines. */
	const mergeLines = (lines: RecipeLine[]): RecipeLine[] => {
		const merged: RecipeLine[] = [];
		for (const line of lines) {
			const twin = merged.find(
				(m) =>
					m.ingredientId === line.ingredientId &&
					m.unit === line.unit &&
					m.unit !== null &&
					!m.notEaten === !line.notEaten
			);
			if (!twin) {
				merged.push({ ...line });
				continue;
			}
			twin.amount = (twin.amount ?? 0) + (line.amount ?? 0);
			twin.grams += line.grams;
			if (line.note && line.note !== twin.note) {
				twin.note = twin.note ? `${twin.note}; ${line.note}` : line.note;
			}
		}
		return merged;
	};

	const compute = (lines: RecipeLine[], servings: number): RecipeComputed => {
		const used = [...new Set(lines.map((l) => l.ingredientId))].map((i) => byId.get(i)!);
		const gluten = recipeGluten(used);
		const perServing = recipeNutrients(lines, byId, servings);
		let cost = 0;
		let costIsEstimate = false;
		for (const line of lines) {
			const price = bestPrice(byId.get(line.ingredientId)!, prices, today);
			cost += (price.perKg * line.grams) / 1000;
			if (price.isEstimate && line.grams > 0) costIsEstimate = true;
		}
		return {
			lines,
			gluten: gluten.status,
			gfSwappable: gluten.swappable,
			allergens: recipeAllergens(used),
			perServing,
			costPerServing: cost / servings,
			costIsEstimate,
			// Everything bought counts, including broth that isn't eaten.
			co2PerServing:
				lines.reduce((sum, l) => sum + (l.grams / 1000) * byId.get(l.ingredientId)!.co2, 0) /
				servings,
			usesSubstitutes: used.some((i) => i.category === 'nahrady'),
			warnings: recipeWarnings(used, byId, perServing)
		};
	};

	const equipmentRules = parseWith(
		z.array(equipmentSchema),
		parseYaml(raw.equipment),
		'content/equipment.yaml'
	);
	const equipment: EquipmentFull[] = equipmentRules.map(
		({ match: _match, weak: _weak, unless: _unless, ...e }) => e
	);
	// Recipes carry only the short form; the encyclopedia text lives on the tool's own page.
	const equipmentById = new Map<string, Equipment>(
		equipment.map(({ uses: _uses, kinds: _kinds, choose: _choose, care: _care, ...e }) => [e.id, e])
	);
	if (equipmentById.size !== equipment.length) throw new Error('equipment.yaml: duplicitné id');
	const levelOrder = (e: Equipment) => EQUIPMENT_LEVELS.indexOf(e.level);

	/** Tools mentioned in the steps or ingredient notes ("prelisovaný" → garlic press). */
	function detectEquipment(steps: string[], lines: RecipeLine[]): Set<string> {
		const text = normalizeSearch([...steps, ...lines.map((l) => l.note ?? '')].join('\n'));
		const found = new Set(
			equipmentRules.filter((e) => e.match.some((re) => re.test(text))).map((e) => e.id)
		);
		for (const e of equipmentRules) {
			if (found.has(e.id) || e.unless.some((id) => found.has(id))) continue;
			if (e.weak.some((re) => re.test(text))) found.add(e.id);
		}
		return found;
	}

	const recipeDetails = new Map<string, RecipeDetail>();
	for (const [path, text] of Object.entries(raw.recipes)) {
		const id = fileId(path);
		const where = `content/recipes/${id}.yaml`;
		parseWith(slug, id, `${where} (názov súboru)`);
		const r = parseWith(recipeSchema, parseYaml(text), where);
		if (!cuisineIds.has(r.cuisine)) throw new Error(`${where}: neznáma kuchyňa "${r.cuisine}"`);
		if (r.active > r.time) throw new Error(`${where}: active nesmie byť viac ako time`);

		const lines = r.ingredients.map((entry) => {
			const [ingredientId, amountText] = Object.entries(entry)[0];
			return parseLine(ingredientId, amountText, where);
		});
		const base = compute(lines, r.servings);
		if (!r.gf_swap) base.gfSwappable = false;
		// Iron/salt hints are nutrition-derived; meaningless when the result is strained.
		if (!r.nutrition) base.warnings = base.warnings.filter((w) => w.level !== 'info');

		const variants: RecipeVariant[] = r.variants.map((v) => {
			const vWhere = `${where} variant "${v.name}"`;
			const baseIds = new Set(lines.map((l) => l.ingredientId));
			for (const id of [...v.replace.map((x) => x.from), ...v.remove]) {
				if (!baseIds.has(id)) throw new Error(`${vWhere}: "${id}" nie je v surovinách receptu`);
			}
			const variantLines = lines
				.filter((l) => !v.remove.includes(l.ingredientId))
				.map((l) => {
					const rep = v.replace.find((x) => x.from === l.ingredientId);
					if (!rep) return l;
					return rep.amount ? parseLine(rep.to, rep.amount, vWhere) : swapLine(l, rep.to, vWhere);
				})
				.concat(
					v.add.map((entry) => {
						const [ingredientId, amountText] = Object.entries(entry)[0];
						return parseLine(ingredientId, amountText, vWhere);
					})
				);
			return {
				name: v.name,
				description: v.description,
				...compute(mergeLines(variantLines), r.servings)
			};
		});

		if (
			base.gluten === 'contains' &&
			base.gfSwappable &&
			!variants.some((v) => v.name === GF_VARIANT_NAME)
		) {
			const culprits = lines
				.map((l) => byId.get(l.ingredientId)!)
				.filter((i) => i.gluten === 'contains');
			const gfLines = lines.map((l) => {
				const ingredient = byId.get(l.ingredientId)!;
				return ingredient.gluten === 'contains' ? swapLine(l, ingredient.gfAlternative!, where) : l;
			});
			variants.push({
				name: GF_VARIANT_NAME,
				description: `Namiesto lepkových surovín: ${[...new Set(culprits)]
					.map((i) => `${i.name} → ${byId.get(i.gfAlternative!)!.name}`)
					.join(', ')}.`,
				...compute(mergeLines(gfLines), r.servings)
			});
		}

		if (
			r.nutrition &&
			base.perServing.salt > SALT_HIGH_G &&
			!variants.some((v) => v.name === LOW_SALT_VARIANT_NAME)
		) {
			const halved = new Set<string>();
			let broth = false;
			const lowLines = lines.flatMap((l): RecipeLine[] => {
				const ingredient = byId.get(l.ingredientId)!;
				if (l.notEaten || l.amount === null) return [l];
				const half = { ...l, amount: l.amount / 2, grams: l.grams / 2 };
				if (l.ingredientId === 'zeleninovy-vyvar') {
					broth = true;
					return [half, swapLine(half, 'voda', where)];
				}
				const seasoning =
					ingredient.id === 'sol' ||
					(ingredient.category === 'omacky-pasty' &&
						ingredient.per100g.salt >= SALTY_SEASONING_MIN);
				if (!seasoning) return [l];
				// "Soľ jódovaná" → "soľ", "Tamari (bezlepková sójová omáčka)" → "tamari".
				halved.add(
					ingredient.id === 'sol' ? 'soľ' : ingredient.name.replace(/\s*\(.*\)/, '').toLowerCase()
				);
				return [half];
			});
			const low = compute(mergeLines(lowLines), r.servings);
			// Only worth offering when the salt comes from what we can halve, not from olives or pickles.
			if (low.perServing.salt <= base.perServing.salt * 0.8) {
				const parts = [
					halved.size ? `Daj len polovicu: ${[...halved].join(', ')}.` : '',
					broth ? 'Polovicu vývaru nahraď vodou.' : '',
					'Na konci ochutnaj a dochuť citrónom, octom alebo bylinkami – kyslosť a vôňa nahradia časť slanosti.'
				];
				variants.push({
					name: LOW_SALT_VARIANT_NAME,
					description: parts.filter(Boolean).join(' '),
					...low
				});
			}
		}

		for (const toolId of [...r.equipment, ...r.no_equipment]) {
			if (!equipmentById.has(toolId)) throw new Error(`${where}: neznáme vybavenie "${toolId}"`);
		}
		const tools = detectEquipment(r.steps, lines);
		for (const toolId of r.equipment) tools.add(toolId);
		for (const toolId of r.no_equipment) tools.delete(toolId);
		const equipmentDetail = [...tools]
			.map((toolId) => equipmentById.get(toolId)!)
			.sort((a, b) => levelOrder(a) - levelOrder(b) || a.name.localeCompare(b.name, 'sk'));

		const allUsed = new Set(
			[...lines, ...variants.flatMap((v) => v.lines)].map((l) => l.ingredientId)
		);
		const eatenGrams = lines.filter((l) => !l.notEaten).reduce((sum, l) => sum + l.grams, 0);
		recipeDetails.set(id, {
			id,
			title: r.title,
			description: r.description,
			cuisine: r.cuisine,
			meals: r.meals,
			categories: r.categories,
			time: r.time,
			activeTime: r.active,
			servings: r.servings,
			difficulty: r.difficulty,
			tags: r.tags,
			ahead: r.ahead,
			yields: r.yields,
			showNutrition: r.nutrition,
			spicy: r.spicy,
			taste:
				r.taste === 'neutralne'
					? undefined
					: (r.taste ??
						guessTaste(
							r.categories,
							lines.map((l) => ({
								...byId.get(l.ingredientId)!,
								gramsPerServing: l.grams / r.servings
							})),
							base.perServing.salt
						)),
			keeps: r.keeps,
			tested: r.tested,
			servingGrams: Math.round(eatenGrams / r.servings),
			leftovers: r.leftovers,
			swaps: Object.fromEntries(
				[...allUsed]
					.map((id) => [id, substitutesById.get(id) ?? []] as const)
					.filter(([, subs]) => subs.length)
			),
			...base,
			substitutes: !base.usesSubstitutes
				? 'none'
				: variants.some((v) => !v.usesSubstitutes)
					? 'optional'
					: 'required',
			variants,
			equipment: equipmentDetail.map((e) => e.id),
			equipmentDetail,
			steps: r.steps,
			tips: r.tips,
			howto: [...new Set([...r.howto, ...[...allUsed].flatMap((i) => byId.get(i)!.howto)])].map(
				(h) => howtoLink(h, where)
			),
			// Resolved below, once every recipe is known.
			related: r.related.map((relatedId) => ({ id: relatedId, title: '' }))
		});
	}

	for (const recipe of recipeDetails.values()) {
		recipe.related = recipe.related.map(({ id: relatedId }) => {
			const target = recipeDetails.get(relatedId);
			if (!target) {
				throw new Error(
					`content/recipes/${recipe.id}.yaml: neznámy súvisiaci recept "${relatedId}"`
				);
			}
			return { id: relatedId, title: target.title };
		});
	}

	const recipes = [...recipeDetails.values()]
		.map(
			({
				steps: _steps,
				tips: _tips,
				howto: _howto,
				related: _related,
				equipmentDetail: _equipment,
				swaps: _swaps,
				leftovers: _leftovers,
				...summary
			}) => summary
		)
		.sort((a, b) => a.title.localeCompare(b.title, 'sk'));

	const homemadeInfo = (
		ingredientId: string,
		{ recipe, steps, note }: { recipe?: string; steps: string[]; note?: string }
	): Homemade => {
		const target = recipe ? recipeDetails.get(recipe) : undefined;
		if (recipe && !target) {
			throw new Error(`ingredients.yaml ${ingredientId}: neznámy recept "${recipe}" v homemade`);
		}
		return {
			...(target && { recipe: { id: target.id, title: target.title } }),
			steps,
			...(note && { note })
		};
	};

	const ingredientInfo = new Map<string, IngredientInfo>(
		rawIngredients.map((i) => [
			i.id,
			{
				about: i.about,
				kinds: i.kinds,
				choose: i.choose,
				storage: i.storage,
				uses: i.uses,
				homemade: i.homemade && homemadeInfo(i.id, i.homemade)
			}
		])
	);

	const growFile = parseWith(growFileSchema, parseYaml(raw.grow), 'content/pestovanie.yaml');
	const growWhere = 'content/pestovanie.yaml';
	const growName = (id: string, what: string) => {
		const ingredient = byId.get(id);
		if (!ingredient) throw new Error(`${growWhere}: ${what}: neznáma surovina "${id}"`);
		return ingredient.name;
	};
	const grownIds = new Set<string>();
	for (const id of [
		...growFile.plodiny.map((g) => g.ingredient),
		...growFile.nepestovatelne.map((n) => n.ingredient)
	]) {
		if (grownIds.has(id)) throw new Error(`${growWhere}: "${id}" je tam dvakrát`);
		grownIds.add(id);
	}
	const grow: GrowGuide[] = growFile.plodiny
		.map((g) => {
			for (const id of [...g.friends, ...g.avoid]) growName(id, `${g.ingredient} susedia`);
			return {
				ingredientId: g.ingredient,
				name: g.name ?? growName(g.ingredient, 'plodiny'),
				where: g.where,
				sun: g.sun,
				level: g.level,
				spacing: g.spacing,
				family: g.family,
				yieldKg: g.yield,
				problems: g.problems,
				seeds: g.seeds,
				preserve: g.preserve,
				indoor: g.indoor,
				sow: g.sow,
				harvest: g.harvest,
				perennial: g.perennial,
				...(g.form && { form: g.form }),
				...(g.height && { heightM: g.height }),
				...(g.years !== undefined && { yearsToHarvest: g.years }),
				...(g.pollination && { pollination: g.pollination }),
				how: g.how,
				...(g.tip && { tip: g.tip }),
				...(g.recommend && { recommend: g.recommend }),
				friends: g.friends,
				avoid: g.avoid
			};
		})
		.sort((a, b) => a.name.localeCompare(b.name, 'sk'));
	const growable = new Set(grow.map((g) => g.ingredientId));
	const plantNames = new Map(grow.map((g) => [g.ingredientId, g.name]));
	const growCombos: GrowCombo[] = growFile.kombinacie.map((c) => ({
		id: c.id,
		name: c.name,
		where: c.where,
		sun: c.sun,
		level: c.level,
		area: c.area,
		...(c.max && { max: c.max }),
		layout: c.layout,
		...(c.depth && { depth: c.depth }),
		members: Object.entries(c.members).map(([id, count]) => {
			if (!growable.has(id)) {
				throw new Error(`${growWhere}: kombinácia ${c.id}: "${id}" nemá návod v plodinách`);
			}
			return { ingredientId: id, name: plantNames.get(id)!, count };
		}),
		how: c.how,
		why: c.why,
		gear: c.gear
	}));
	const notGrown: NotGrown[] = growFile.nepestovatelne
		.map((n) => ({
			ingredientId: n.ingredient,
			name: growName(n.ingredient, 'nepestovatelne'),
			status: n.status,
			origin: n.origin,
			...(n.note && { note: n.note })
		}))
		.sort((a, b) => a.name.localeCompare(b.name, 'sk'));

	return {
		ingredients,
		recipes,
		cuisines,
		stores,
		prices,
		recipeDetails,
		wiki,
		equipment,
		ingredientInfo,
		ingredientSwaps: substitutesById,
		grow,
		growCombos,
		notGrown
	};
}

let cached: Content | undefined;

export function getContent(): Content {
	cached ??= compileContent(
		{
			ingredients: import.meta.glob('/content/ingredients.yaml', {
				query: '?raw',
				import: 'default',
				eager: true
			})['/content/ingredients.yaml'] as string,
			equipment: import.meta.glob('/content/equipment.yaml', {
				query: '?raw',
				import: 'default',
				eager: true
			})['/content/equipment.yaml'] as string,
			cuisines: import.meta.glob('/content/cuisines.yaml', {
				query: '?raw',
				import: 'default',
				eager: true
			})['/content/cuisines.yaml'] as string,
			prices: import.meta.glob('/content/prices.yaml', {
				query: '?raw',
				import: 'default',
				eager: true
			})['/content/prices.yaml'] as string,
			pricesSynced: import.meta.glob('/content/prices-cenyslovensko.yaml', {
				query: '?raw',
				import: 'default',
				eager: true
			})['/content/prices-cenyslovensko.yaml'] as string,
			recipes: import.meta.glob('/content/recipes/*.yaml', {
				query: '?raw',
				import: 'default',
				eager: true
			}),
			wiki: import.meta.glob('/content/wiki/*.md', {
				query: '?raw',
				import: 'default',
				eager: true
			}),
			grow: import.meta.glob('/content/pestovanie.yaml', {
				query: '?raw',
				import: 'default',
				eager: true
			})['/content/pestovanie.yaml'] as string
		},
		new Date()
	);
	return cached;
}
