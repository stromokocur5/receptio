import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { parseAmount, toGrams } from '$lib/amounts';
import {
	GROUPS,
	TECHNIQUES,
	type Amount,
	type ComposerData,
	type ComposerIngredient,
	type FlavorBase
} from '$lib/composer';
import { STYLES } from '$lib/dish';
import type { Ingredient } from '$lib/types';

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const minutes = z.union([z.number().int().positive(), z.literal(false)]);

const schema = z
	.object({
		sposoby: z.record(
			z.enum(TECHNIQUES),
			z.object({ name: z.string().min(1), popis: z.string().min(1) }).strict()
		),
		suroviny: z.record(
			slug,
			z
				.object({
					skupina: z.enum(GROUPS),
					porcia: z.string().optional(),
					krajanie: z.string().min(1),
					min: z.number().int().min(0).default(3),
					ochutit: z.boolean().default(false),
					tekutina: z.string().optional(),
					wok: minutes,
					plech: minutes,
					hrniec: minutes,
					polievka: minutes,
					salat: z.union([z.boolean(), z.string().min(1)])
				})
				.strict()
		),
		zaklady: z.record(
			slug,
			z
				.object({
					name: z.string().min(1),
					text: z.string().min(1),
					sposoby: z.array(z.enum(TECHNIQUES)).min(1),
					styl: z.array(z.enum(STYLES)).default([]),
					mixovat: z.boolean().default(false),
					suroviny: z.record(slug, z.string())
				})
				.strict()
		),
		navrch: z.record(slug, z.string())
	})
	.strict();

export function compileComposer(text: string, byId: Map<string, Ingredient>): ComposerData {
	const where = 'content/skladacka.yaml';
	const parsed = schema.safeParse(parseYaml(text));
	if (!parsed.success) throw new Error(`${where}: ${z.prettifyError(parsed.error)}`);
	const raw = parsed.data;
	const used = new Set<string>();

	const amount = (id: string, value: string, at: string): Amount | null => {
		const ingredient = byId.get(id);
		if (!ingredient) throw new Error(`${where} ${at}: neznáma surovina "${id}"`);
		used.add(id);
		const a = parseAmount(value);
		if (a.amount === null || a.unit === null) return null;
		toGrams(a.amount, a.unit, ingredient);
		return { amount: a.amount, unit: a.unit };
	};

	const ingredients: Record<string, ComposerIngredient> = {};
	for (const [id, s] of Object.entries(raw.suroviny)) {
		const at = `suroviny.${id}`;
		if (!byId.has(id)) throw new Error(`${where} ${at}: neznáma surovina`);
		used.add(id);
		const times: ComposerIngredient['times'] = {};
		for (const t of ['wok', 'plech', 'hrniec', 'polievka'] as const) if (s[t]) times[t] = s[t];
		ingredients[id] = {
			id,
			group: s.skupina,
			...(s.porcia && { portion: amount(id, s.porcia, at)! }),
			cut: s.krajanie,
			prepMin: s.min,
			season: s.ochutit,
			...(s.tekutina && { liquid: amount('voda', s.tekutina, at)! }),
			times,
			raw: s.salat === false ? null : s.salat === true ? '' : s.salat
		};
	}

	const techniques = Object.fromEntries(
		Object.entries(raw.sposoby).map(([t, v]) => [t, { name: v.name, about: v.popis }])
	) as ComposerData['techniques'];
	for (const t of TECHNIQUES) if (!techniques[t]) throw new Error(`${where}: chýba spôsob ${t}`);

	const bases: Record<string, FlavorBase> = {};
	for (const [id, b] of Object.entries(raw.zaklady)) {
		bases[id] = {
			id,
			name: b.name,
			text: b.text,
			techniques: b.sposoby,
			style: b.styl,
			blend: b.mixovat,
			lines: Object.entries(b.suroviny).map(([ing, value]) => ({
				ingredientId: ing,
				amount: amount(ing, value, `zaklady.${id}`)
			}))
		};
	}
	for (const t of TECHNIQUES) {
		if (!Object.values(bases).some((b) => b.techniques.includes(t))) {
			throw new Error(`${where}: spôsob ${t} nemá žiadny základ chuti`);
		}
	}

	const toppings: Record<string, Amount> = {};
	for (const [id, value] of Object.entries(raw.navrch)) {
		const a = amount(id, value, `navrch.${id}`);
		if (!a) throw new Error(`${where} navrch.${id}: treba množstvo`);
		toppings[id] = a;
	}
	used.add('voda');
	used.add('sojova-omacka');
	used.add('olej');

	const nutrition: ComposerData['nutrition'] = {};
	for (const id of used) {
		const i = byId.get(id);
		if (!i) throw new Error(`${where}: neznáma surovina "${id}"`);
		nutrition[id] = {
			per100g: i.per100g,
			density: i.density,
			gluten: i.gluten,
			allergens: i.allergens
		};
	}
	return { techniques, ingredients, bases, toppings, nutrition };
}
