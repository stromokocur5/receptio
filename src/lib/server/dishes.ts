import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { parseAmount, toGrams } from '$lib/amounts';
import {
	APPLIANCES,
	KITCHEN_TOOLS,
	PART_KINDS,
	STYLES,
	type Dish,
	type Part,
	type PartFacts,
	type PartMethod,
	type PartStep
} from '$lib/dish';
import { recipeAllergens, recipeGluten, recipeNutrients, treatReasons } from '$lib/nutrition';
import { bestPrice } from '$lib/pricing';
import { MEALS, type Ingredient, type PriceEntry, type RecipeLine } from '$lib/types';

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'id: malé písmená, čísla a pomlčky');

const stepSchema = z
	.object({
		text: z.string().min(1),
		min: z.number().int().positive(),
		on: z.enum(APPLIANCES).optional(),
		temp: z.number().int().min(50).max(300).optional(),
		free: z.boolean().default(false),
		/** Defaults to a minute for free steps on the stove or in the oven (putting it in). */
		hands: z.number().int().min(0).optional(),
		pause: z.boolean().default(false)
	})
	.strict()
	.transform((s) => (s.free && s.hands === undefined && s.on ? { ...s, hands: 1 } : s))
	.refine((s) => (s.on === 'rura') === (s.temp !== undefined) || s.on === 'airfryer', {
		message: 'krok v rúre potrebuje `temp` a `temp` patrí len k rúre alebo airfryeru'
	});

const lineSchema = z
	.record(slug, z.string())
	.refine((r) => Object.keys(r).length === 1, 'každý riadok má mať práve jednu surovinu');

const partSchema = z
	.object({
		name: z.string().min(1),
		/** One sentence on what it is, shown while picking. */
		description: z.string().min(10).max(140),
		kind: z.enum(PART_KINDS),
		style: z.array(z.enum(STYLES)).default([]),
		servings: z.number().int().positive(),
		early: z.boolean().default(false),
		ahead: z.string().min(1).optional(),
		ingredients: z.array(lineSchema).min(1),
		/** Steps every method starts with (cleaning, cutting, coating). */
		prep: z.array(stepSchema).default([]),
		methods: z
			.array(
				z
					.object({
						label: z.string().min(1),
						needs: z
							.array(z.union([z.enum(KITCHEN_TOOLS), z.array(z.enum(KITCHEN_TOOLS)).min(2)]))
							.default([]),
						/** Different amounts for this method; replaces every line of that ingredient. */
						amounts: z.record(slug, z.string()).default({}),
						steps: z.array(stepSchema).min(1)
					})
					.strict()
			)
			.min(1),
		tips: z.array(z.string().min(1)).default([])
	})
	.strict();

const dishSchema = z
	.object({
		name: z.string().min(1),
		description: z.string().min(1),
		meals: z.array(z.enum(MEALS)).min(1),
		servings: z.number().int().positive(),
		slots: z.record(
			slug,
			z
				.object({
					label: z.string().min(1),
					options: z.array(slug).min(1),
					optional: z.boolean().default(false)
				})
				.strict()
		),
		finish: z.array(stepSchema).default([]),
		tips: z.array(z.string().min(1)).default([])
	})
	.strict();

const fileId = (path: string) =>
	path
		.split('/')
		.pop()!
		.replace(/\.ya?ml$/, '');

function parseWith<T>(schema: z.ZodType<T>, data: unknown, where: string): T {
	const result = schema.safeParse(data);
	if (!result.success) throw new Error(`${where}: ${z.prettifyError(result.error)}`);
	return result.data;
}

/** "Rúra" or "°C" in the text has to agree with what the step says it occupies. */
function checkStep(step: PartStep, where: string) {
	const degrees = /(\d{2,3})\s*°C/.exec(step.text);
	if (degrees && step.temp !== undefined && Number(degrees[1]) !== step.temp) {
		throw new Error(`${where}: text hovorí ${degrees[1]} °C, ale temp je ${step.temp}`);
	}
	if (/\brúr/i.test(step.text) && step.on !== 'rura' && !/vyber|vytiahni/i.test(step.text)) {
		throw new Error(`${where}: krok spomína rúru, ale nemá on: rura`);
	}
}

export interface Pricing {
	prices: PriceEntry[];
	today: Date;
}

function facts(
	lines: RecipeLine[],
	servings: number,
	byId: Map<string, Ingredient>,
	{ prices, today }: Pricing
): PartFacts {
	const used = [...new Set(lines.map((l) => l.ingredientId))].map((id) => byId.get(id)!);
	const perServing = recipeNutrients(lines, byId, servings);
	let cost = 0;
	let costIsEstimate = false;
	for (const line of lines) {
		const price = bestPrice(byId.get(line.ingredientId)!, prices, today);
		cost += (price.perKg * line.grams) / 1000;
		if (price.isEstimate && line.grams > 0) costIsEstimate = true;
	}
	return {
		perServing,
		costPerServing: cost / servings,
		costIsEstimate,
		gluten: recipeGluten(used).status,
		allergens: recipeAllergens(used),
		treat: treatReasons(lines, byId, servings, perServing)
	};
}

export function compileParts(
	files: Record<string, string>,
	byId: Map<string, Ingredient>,
	pricing: Pricing
): Part[] {
	return Object.entries(files)
		.map(([path, text]): Part => {
			const id = fileId(path);
			const where = `content/casti/${id}.yaml`;
			const raw = parseWith(partSchema, parseYaml(text), where);
			const parseLine = (ingredientId: string, amountText: string): RecipeLine => {
				const ingredient = byId.get(ingredientId);
				if (!ingredient) throw new Error(`${where}: neznáma surovina "${ingredientId}"`);
				try {
					const { amount, unit, note, notEaten } = parseAmount(amountText);
					return {
						ingredientId,
						grams: toGrams(amount, unit, ingredient),
						amount,
						unit,
						...(note && { note }),
						...(notEaten && { notEaten })
					};
				} catch (error) {
					throw new Error(`${where}: ${ingredientId}: ${(error as Error).message}`);
				}
			};
			const lines = raw.ingredients.map((entry) => parseLine(...Object.entries(entry)[0]));
			const labels = new Set<string>();
			const methods: PartMethod[] = raw.methods.map(({ amounts, ...own }) => {
				const method = { ...own, steps: [...raw.prep, ...own.steps] };
				const at = `${where} ${method.label}`;
				if (labels.has(method.label)) throw new Error(`${at}: dvakrát rovnaký label`);
				labels.add(method.label);
				method.steps.forEach((s, i) => checkStep(s, `${at} krok ${i + 1}`));
				const needs = new Set(method.needs.flat());
				if (method.steps.some((s) => s.on === 'rura') && !needs.has('rura')) {
					throw new Error(`${at}: kroky v rúre, ale needs nemá rura`);
				}
				if (method.steps.some((s) => s.on === 'airfryer') && !needs.has('airfryer')) {
					throw new Error(`${at}: kroky v airfryeri, ale needs nemá airfryer`);
				}
				const methodLines = lines.flatMap((line, i) => {
					const override = amounts[line.ingredientId];
					if (override === undefined) return [line];
					const first = lines.findIndex((l) => l.ingredientId === line.ingredientId);
					return i === first ? [parseLine(line.ingredientId, override)] : [];
				});
				for (const id of Object.keys(amounts)) {
					if (!lines.some((l) => l.ingredientId === id)) {
						throw new Error(`${at}: amounts mení "${id}", ktorá v surovinách nie je`);
					}
				}
				return {
					...method,
					lines: methodLines,
					...facts(methodLines, raw.servings, byId, pricing)
				};
			});
			return {
				id,
				name: raw.name,
				description: raw.description,
				kind: raw.kind,
				style: raw.style,
				servings: raw.servings,
				methods,
				...(raw.ahead && { ahead: raw.ahead }),
				early: raw.early,
				tips: raw.tips
			};
		})
		.sort((a, b) => a.id.localeCompare(b.id));
}

export function compileDishes(files: Record<string, string>, partIds: Set<string>): Dish[] {
	const used = new Set<string>();
	const dishes = Object.entries(files)
		.map(([path, text]): Dish => {
			const id = fileId(path);
			const where = `content/jedla/${id}.yaml`;
			const raw = parseWith(dishSchema, parseYaml(text), where);
			const slots = Object.entries(raw.slots).map(([slotId, s]) => {
				for (const option of s.options) {
					if (!partIds.has(option)) throw new Error(`${where}: neznáma časť "${option}"`);
					used.add(option);
				}
				return { id: slotId, ...s };
			});
			if (!slots.length) throw new Error(`${where}: jedlo potrebuje aspoň jednu časť`);
			raw.finish.forEach((s, i) => checkStep(s, `${where} finish krok ${i + 1}`));
			return {
				id,
				name: raw.name,
				description: raw.description,
				meals: raw.meals,
				servings: raw.servings,
				slots,
				finish: raw.finish,
				tips: raw.tips
			};
		})
		.sort((a, b) => a.name.localeCompare(b.name, 'sk'));
	const orphans = [...partIds].filter((p) => !used.has(p));
	if (orphans.length) throw new Error(`content/casti: nepoužité časti ${orphans.join(', ')}`);
	return dishes;
}
