import { normalizeSearch } from './labels';
import type { Ingredient, RecipeLine } from './types';

/**
 * Rough minutes of knife work before and between the cooking: peeling, chopping, grating,
 * draining. Recipes state their own `time` and `activeTime`; this only checks those aren't
 * lower than what an unhurried home cook needs (1 kg of potatoes peeled and diced ≈ 10 min).
 */

/** Minutes per 100 g for ingredients that are peeled and cut. */
const PEEL_AND_CUT = new Set([
	'zemiaky',
	'batat',
	'mrkva',
	'petrzlen-koren',
	'pastinak',
	'cvikla',
	'kalerab',
	'topinambur',
	'cierny-koren',
	'biela-redkev',
	'tekvica-hokkaido',
	'plantain',
	'ananas',
	'mango'
]);
const PEEL_RATE = 1;
/** Washed and cut without peeling: peppers, courgettes, mushrooms, cabbage… */
const CUT_RATE = 0.6;
/** Fruit is mostly halved, sliced or picked over. */
const FRUIT_RATE = 0.35;
/** Each onion is peeled and chopped; each garlic clove peeled and pressed. */
const PER_ONION = 2;
const PER_CLOVE = 0.5;
/** Herbs, ginger, chillies, lemons: a minute whatever the amount. */
const SMALL_JOB = 1;
/** Tofu and tempeh are pressed or patted dry and cut. */
const PROTEIN_BLOCK = 2;
/** Anything else that isn't assumed at home: measuring, opening, draining a can. */
const MEASURE = 0.3;

const ONIONS = new Set(['cibula', 'cibula-cervena', 'por']);
const SMALL = new Set([
	'zazvor',
	'jarna-cibulka',
	'cili-papricka',
	'citronova-trava',
	'chren',
	'limetka',
	'citron',
	'bylinky-koriander',
	'bylinky-mata',
	'petrzlenova-vnat',
	'kopor',
	'bazalka',
	'pazitka'
]);
/** Bought ready to use: no knife needed. */
const READY = /mrazen|sterilizovan|z konzervy|z plechovky|hotov|scedene|uvaren|zvysok|zvysn/;
const NO_KNIFE_CATEGORIES = new Set(['koreniny', 'oleje', 'omacky-pasty']);

/** Potatoes baked or boiled in their skins aren't peeled raw. */
const UNPEELED = /v supke|neosupan|supat (ich )?netreba/;

export function linePrepMinutes(
	line: RecipeLine,
	ingredient: Ingredient | undefined,
	unpeeled = false
): number {
	if (!ingredient || ingredient.staple || ingredient.byproduct) return 0;
	const id = ingredient.id;
	const note = normalizeSearch(line.note ?? '');
	if (NO_KNIFE_CATEGORIES.has(ingredient.category)) return MEASURE;
	if (READY.test(note)) return MEASURE;
	const per100 = line.grams / 100;
	if (ONIONS.has(id))
		return Math.max(1, (line.unit === 'ks' && line.amount) || per100 / 1.2) * PER_ONION;
	if (id === 'cesnak')
		return Math.max(1, (line.unit === 'ks' && line.amount) || per100 * 20) * PER_CLOVE;
	if (SMALL.has(id)) return SMALL_JOB;
	if (PEEL_AND_CUT.has(id)) return Math.max(1, per100 * (unpeeled ? CUT_RATE : PEEL_RATE));
	if (ingredient.category === 'zelenina') return Math.max(0.5, per100 * CUT_RATE);
	if (ingredient.category === 'ovocie') return Math.max(0.3, per100 * FRUIT_RATE);
	if (ingredient.category === 'bielkoviny') return PROTEIN_BLOCK;
	return MEASURE;
}

/** Knife work for the whole recipe, in minutes. */
export function prepMinutes(
	lines: RecipeLine[],
	byId: Map<string, Ingredient>,
	steps: string[]
): number {
	const unpeeled = UNPEELED.test(normalizeSearch(steps.join(' ')));
	return lines.reduce(
		(sum, line) => sum + linePrepMinutes(line, byId.get(line.ingredientId), unpeeled),
		0
	);
}
