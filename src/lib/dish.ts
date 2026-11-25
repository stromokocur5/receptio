import { emptyNutrients } from './nutrition';
import { isAssumedAtHome, pantryByGroup, TAP_WATER_ID, type Pantry } from './pantry';
import type { IconName } from './components/Icon.svelte';
import type {
	Allergen,
	GlutenStatus,
	IngredientLite as Ingredient,
	Meal,
	Nutrients,
	RecipeLine,
	TreatReason
} from './types';

/**
 * What a step keeps busy besides the cook's hands. Burners come in as many as the kitchen has;
 * the oven holds one temperature at a time.
 */
export const APPLIANCES = ['platna', 'rura', 'airfryer', 'mikrovlnka', 'mixer'] as const;
export type Appliance = (typeof APPLIANCES)[number];

/** Tools a method can depend on beyond pans, pots and knives, which every kitchen has. */
export const KITCHEN_TOOLS = [
	'rura',
	'airfryer',
	'mikrovlnka',
	'tlakovy-hrniec',
	'tycovy-mixer',
	'mixer'
] as const;
export type KitchenTool = (typeof KITCHEN_TOOLS)[number];

export const TOOL_META: Record<KitchenTool, { label: string; icon: IconName; hint: string }> = {
	rura: { label: 'Rúra', icon: 'oven', hint: 'pečené zemiaky, zelenina, cícer' },
	airfryer: { label: 'Airfryer', icon: 'airfryer', hint: 'chrumkavé s lyžicou oleja' },
	mikrovlnka: { label: 'Mikrovlnka', icon: 'microwave', hint: 'kaša za 4 minúty' },
	'tlakovy-hrniec': {
		label: 'Tlakový hrniec',
		icon: 'pressure-cooker',
		hint: 'strukoviny za tretinu času'
	},
	'tycovy-mixer': {
		label: 'Tyčový mixér',
		icon: 'stick-blender',
		hint: 'polievky, sekáčik na falafel'
	},
	mixer: { label: 'Stolný mixér', icon: 'blender', hint: 'hummus, omáčky dohladka' }
};

export const APPLIANCE_LABELS: Record<Appliance, string> = {
	platna: 'platňa',
	rura: 'rúra',
	airfryer: 'airfryer',
	mikrovlnka: 'mikrovlnka',
	mixer: 'mixér'
};

export interface Kitchen {
	burners: number;
	tools: KitchenTool[];
}

export const DEFAULT_KITCHEN: Kitchen = { burners: 4, tools: ['rura', 'tycovy-mixer'] };

export interface PartStep {
	text: string;
	/** Minutes the step takes. */
	min: number;
	on?: Appliance;
	/** Oven or air fryer temperature in °C. */
	temp?: number;
	/** Hands are free meanwhile: simmering, baking, resting. */
	free: boolean;
	/** Minutes of work at the start of a free step: tipping the pasta in before it boils alone. */
	hands?: number;
	/** The step may start later than the previous one ended (cooked potatoes can wait to be fried). */
	pause: boolean;
}

/** A tool, or a list of tools any one of which will do (a chopper or a blender). */
export type Need = KitchenTool | KitchenTool[];

export interface PartMethod extends PartFacts {
	/** Short name shown on the method switch: "Na panvici", "V rúre". */
	label: string;
	needs: Need[];
	steps: PartStep[];
	/** Frying takes more oil than baking, so every method has its own amounts. */
	lines: RecipeLine[];
}

export const PART_KINDS = [
	'hlavne',
	'bielkovina',
	'priloha',
	'omacka',
	'zelenina',
	'ovocie',
	'pecivo',
	'navrch'
] as const;
export type PartKind = (typeof PART_KINDS)[number];

/** Kitchens a part belongs to, for suggesting what goes with what. None = goes with anything. */
export const STYLES = [
	'azijske',
	'indicke',
	'stredomorske',
	'mexicke',
	'domace',
	'sladke'
] as const;
export type Style = (typeof STYLES)[number];

export const STYLE_LABELS: Record<Style, string> = {
	azijske: 'ázijské',
	indicke: 'indické',
	stredomorske: 'stredomorské',
	mexicke: 'mexické',
	domace: 'domáce',
	sladke: 'sladké'
};

/** Everything that follows from the ingredients, per serving, so a combination just adds up. */
export interface PartFacts {
	perServing: Nutrients;
	costPerServing: number;
	costIsEstimate: boolean;
	gluten: GlutenStatus;
	allergens: Allergen[];
	treat: TreatReason[];
}

export interface Part {
	id: string;
	name: string;
	/** One sentence on what it is. */
	description: string;
	kind: PartKind;
	style: Style[];
	servings: number;
	/** First one is the usual way. */
	methods: PartMethod[];
	/** Has to start well before cooking (soaking overnight); not part of the timeline. */
	ahead?: string;
	/**
	 * Keeps until the meal (salads, cold sauces), so it can be made first. The rest is timed to be
	 * ready right before serving: warm food, avocado that would brown.
	 */
	early: boolean;
	tips: string[];
}

export interface DishSlot {
	id: string;
	label: string;
	/** Part ids, the usual choice first. */
	options: string[];
	/** Can be left out altogether (a dip, a salad on the side). */
	optional: boolean;
}

export interface Dish {
	id: string;
	name: string;
	description: string;
	meals: Meal[];
	servings: number;
	slots: DishSlot[];
	/** Putting it together once every part is ready. */
	finish: PartStep[];
	tips: string[];
	/** A plate put together freely: every slot starts empty. */
	free?: boolean;
}

/** Which option was picked for each slot; null = an optional slot left out. */
export type Choice = Record<string, string | null>;

export function usableMethods(part: Part, kitchen: Kitchen): PartMethod[] {
	const tools = new Set<string>(kitchen.tools);
	const has = (need: Need) =>
		Array.isArray(need) ? need.some((t) => tools.has(t)) : tools.has(need);
	return part.methods.filter((m) => m.needs.every(has));
}

/** The usual way, or the first one this kitchen can do. Undefined when it has none of the tools. */
export function pickMethod(part: Part, kitchen: Kitchen, wanted?: string): PartMethod | undefined {
	const usable = usableMethods(part, kitchen);
	return usable.find((m) => m.label === wanted) ?? usable[0];
}

/** What a slot holds before anything is picked: the usual option, or nothing on a free plate. */
export function slotDefault(dish: Dish, slot: DishSlot): string | null {
	return dish.free ? null : slot.options[0];
}

export function defaultChoice(dish: Dish): Choice {
	return Object.fromEntries(dish.slots.map((s) => [s.id, slotDefault(dish, s)]));
}

export interface ChosenPart {
	slot: DishSlot;
	part: Part;
	method: PartMethod;
}

/**
 * The picked parts in slot order, each cooked the way the user picked or the first way this
 * kitchen can. A part the kitchen can't make at all falls back to its usual method.
 */
export function chosenParts(
	dish: Dish,
	choice: Choice,
	methods: Record<string, string>,
	partsById: Map<string, Part>,
	kitchen: Kitchen
): ChosenPart[] {
	return dish.slots.flatMap((slot) => {
		const id = slot.id in choice ? choice[slot.id] : slotDefault(dish, slot);
		if (id === null) return [];
		const part = partsById.get(id && slot.options.includes(id) ? id : slot.options[0]);
		if (!part) return [];
		const method = pickMethod(part, kitchen, methods[part.id]) ?? part.methods[0];
		return [{ slot, part, method }];
	});
}

const GLUTEN_RANK: Record<GlutenStatus, number> = { free: 0, risk: 1, contains: 2 };

/** One serving of the whole plate. */
export function combineFacts(parts: PartFacts[]): PartFacts {
	const perServing = emptyNutrients();
	for (const p of parts)
		for (const k of Object.keys(perServing)) {
			perServing[k as keyof Nutrients] += p.perServing[k as keyof Nutrients];
		}
	return {
		perServing,
		costPerServing: parts.reduce((sum, p) => sum + p.costPerServing, 0),
		costIsEstimate: parts.some((p) => p.costIsEstimate),
		gluten: parts.reduce<GlutenStatus>(
			(worst, p) => (GLUTEN_RANK[p.gluten] > GLUTEN_RANK[worst] ? p.gluten : worst),
			'free'
		),
		allergens: [...new Set(parts.flatMap((p) => p.allergens))].sort(),
		treat: [...new Set(parts.flatMap((p) => p.treat))]
	};
}

/** Lines of a part cooked one way, for `servings` people. */
export function scaledLines(
	part: Part,
	servings: number,
	method: PartMethod = part.methods[0]
): RecipeLine[] {
	const factor = servings / part.servings;
	return method.lines.map((l) => ({
		...l,
		grams: l.grams * factor,
		amount: l.amount === null ? null : l.amount * factor
	}));
}

export interface PartMatch {
	part: Part;
	/** Not at home at all. */
	missing: Ingredient[];
	/** At home, but less than needed. */
	short: Ingredient[];
}

/**
 * What a part still needs from the shop. Salt, oil and spices are taken as being at home:
 * nobody fills the pantry with them, and asking would hide every dish.
 */
export function matchPart(
	part: Part,
	method: PartMethod,
	servings: number,
	groups: Map<string, number>,
	byId: Map<string, Ingredient>
): PartMatch {
	const needed = new Map<string, { ingredient: Ingredient; grams: number }>();
	for (const line of scaledLines(part, servings, method)) {
		const ingredient = byId.get(line.ingredientId)!;
		if (ingredient.id === TAP_WATER_ID || isAssumedAtHome(ingredient)) continue;
		const entry = needed.get(ingredient.group) ?? { ingredient, grams: 0 };
		entry.grams += line.grams * ingredient.groupFactor;
		needed.set(ingredient.group, entry);
	}
	const missing: Ingredient[] = [];
	const short: Ingredient[] = [];
	for (const [group, { ingredient, grams }] of needed) {
		const available = groups.get(group);
		if (available === undefined) missing.push(ingredient);
		else if (available < grams) short.push(ingredient);
	}
	return { part, missing, short };
}

const partCost = (m: PartMatch) => m.missing.length + m.short.length * 0.5;

export interface DishMatch {
	dish: Dish;
	/** The options that need the least shopping; optional slots only when they need nothing. */
	choice: Choice;
	missing: Ingredient[];
	short: Ingredient[];
	/** Ingredients from the pantry the dish uses, for ranking "use what you have". */
	uses: number;
}

export function matchDish(
	dish: Dish,
	pantry: Pantry,
	partsById: Map<string, Part>,
	byId: Map<string, Ingredient>,
	kitchen: Kitchen
): DishMatch | null {
	const groups = pantryByGroup(pantry, byId);
	const choice: Choice = {};
	const missing = new Map<string, Ingredient>();
	const short = new Map<string, Ingredient>();
	let uses = 0;
	for (const slot of dish.slots) {
		const matches = slot.options.flatMap((id) => {
			const part = partsById.get(id)!;
			const method = pickMethod(part, kitchen);
			return method ? [matchPart(part, method, dish.servings, groups, byId)] : [];
		});
		if (!matches.length) {
			if (slot.optional) {
				choice[slot.id] = null;
				continue;
			}
			return null;
		}
		const best = matches.reduce((a, b) => (partCost(b) < partCost(a) ? b : a));
		if (slot.optional && partCost(best) > 0) {
			choice[slot.id] = null;
			continue;
		}
		choice[slot.id] = best.part.id;
		for (const i of best.missing) missing.set(i.id, i);
		for (const i of best.short) short.set(i.id, i);
		uses += best.part.methods[0].lines.filter((l) =>
			groups.has(byId.get(l.ingredientId)!.group)
		).length;
	}
	return { dish, choice, missing: [...missing.values()], short: [...short.values()], uses };
}

/** Cookable now first, then by how little is missing, then by how much of the pantry it uses. */
export function rankDishes(matches: DishMatch[]): DishMatch[] {
	const cost = (m: DishMatch) => m.missing.length + m.short.length * 0.5;
	return [...matches].sort((a, b) => cost(a) - cost(b) || b.uses - a.uses);
}

/**
 * Lines of the whole plate, one per ingredient, for the shopping list and the pantry. Amounts in
 * different units are added by weight and written in the unit of the bigger one.
 */
export function dishLines(
	parts: { part: Part; method: PartMethod }[],
	servings: number,
	byId: Map<string, Ingredient>
): RecipeLine[] {
	const merged = new Map<string, { line: RecipeLine; biggest: RecipeLine }>();
	for (const { part, method } of parts) {
		for (const line of scaledLines(part, servings, method)) {
			if (!byId.has(line.ingredientId)) continue;
			const entry = merged.get(line.ingredientId);
			if (!entry) {
				merged.set(line.ingredientId, {
					line: { ...line, note: line.note ? `${part.name}: ${line.note}` : undefined },
					biggest: line
				});
				continue;
			}
			const total = entry.line.grams + line.grams;
			if (line.grams > entry.biggest.grams) entry.biggest = line;
			const { biggest } = entry;
			const perUnit = biggest.amount ? biggest.grams / biggest.amount : 0;
			entry.line = {
				ingredientId: line.ingredientId,
				grams: total,
				amount: perUnit > 0 ? total / perUnit : null,
				unit: perUnit > 0 ? biggest.unit : null,
				...(entry.line.notEaten && line.notEaten && { notEaten: true })
			};
		}
	}
	return [...merged.values()].map((e) => e.line);
}

/** Servings, choices and methods in the URL, so a built plate can be shared and opened to cook. */
export interface Build {
	servings: number;
	choice: Choice;
	methods: Record<string, string>;
}

export const MAX_SERVINGS = 12;
const NONE = '-';

export function buildToParams(dish: Dish, build: Build): URLSearchParams {
	const params = new URLSearchParams();
	if (build.servings !== dish.servings) params.set('porcie', String(build.servings));
	for (const slot of dish.slots) {
		const fallback = slotDefault(dish, slot);
		const picked = slot.id in build.choice ? build.choice[slot.id] : fallback;
		if (picked !== fallback) params.set(slot.id, picked ?? NONE);
	}
	for (const [partId, label] of Object.entries(build.methods)) params.set(`ako-${partId}`, label);
	return params;
}

/** Reads a build back, ignoring anything the dish doesn't have. */
export function buildFromParams(
	dish: Dish,
	params: URLSearchParams,
	parts: Map<string, Part>
): Build {
	const servings = Number(params.get('porcie'));
	const choice: Choice = {};
	for (const slot of dish.slots) {
		const value = params.get(slot.id);
		if (value === NONE && slot.optional) choice[slot.id] = null;
		else if (value && slot.options.includes(value)) choice[slot.id] = value;
		else choice[slot.id] = slotDefault(dish, slot);
	}
	const methods: Record<string, string> = {};
	for (const [key, label] of params) {
		const part = key.startsWith('ako-') ? parts.get(key.slice(4)) : undefined;
		if (part?.methods.some((m) => m.label === label)) methods[part.id] = label;
	}
	return {
		servings:
			Number.isInteger(servings) && servings >= 1 && servings <= MAX_SERVINGS
				? servings
				: dish.servings,
		choice,
		methods
	};
}
