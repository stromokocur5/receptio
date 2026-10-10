import { seededRandom } from './art';
import { isBreakfastRecipe, planLines, type PlanEntry } from './shopping';
import type { Allergen, RecipeSummary, RecipeVariant } from './types';

export interface AutoPlanOptions {
	days: number;
	people: number;
	/** Lunches and/or dinners a day (0–2). */
	mealsPerDay: number;
	/** Plan a breakfast for every day too, from breakfast recipes. */
	breakfasts?: boolean;
	/** Whole plan, in €; null = no limit. */
	budget: number | null;
	/** Minimum protein per serving (one person's meal), in grams. */
	minProtein: number;
	mild: boolean;
	glutenFree: boolean;
	noSubstitutes: boolean;
	excludeAllergens: Allergen[];
	/** Cook bigger batches and eat leftovers (up to 3 meals per recipe) instead of more variety. */
	batchCooking: boolean;
	/** Different seed = a different, equally valid plan. */
	seed: number;
	/**
	 * When not everyone eats every meal (a household with children, someone away): how many meals
	 * to plan and how many portions they take in all. Without it: `days` × meals × `people`.
	 */
	slots?: { main: number; mainPortions: number; morning: number; morningPortions: number };
}

export interface AutoPlanContext {
	/** 0–1, how much of the recipe is already at home. */
	pantryScore?: (recipe: RecipeSummary) => number;
	/** True when the recipe's produce is in season now. */
	inSeason?: (recipe: RecipeSummary) => boolean;
	/**
	 * Anything else worth steering toward: what the diary says is missing, food at home that
	 * should be used up soon. 0 = nothing, 1 ≈ one good reason.
	 */
	bonus?: (recipe: RecipeSummary) => number;
	/**
	 * Grams in the pack an ingredient is bought in; undefined for what's weighed at the till or
	 * kept at home. With it the plan prefers recipes that finish a pack another recipe opened.
	 */
	packOf?: (ingredientId: string) => number | undefined;
}

export interface AutoPlanResult {
	entries: PlanEntry[];
	cost: number;
	/** Meals the plan covers vs. meals asked for. */
	meals: number;
	wanted: number;
	/** Lowest protein per serving among chosen recipes. */
	minProtein: number;
	withinBudget: boolean;
}

interface Candidate {
	recipe: RecipeSummary;
	variant?: string;
	cost: number;
	protein: number;
	/** Meals one batch may cover: leftovers only as long as the fridge allows. */
	maxMeals: number;
}

const GF_VARIANT = 'Bezlepková verzia';
const PLAIN_VARIANT = 'Bez náhrad';
/** Nobody wants the same dish more than three times; without batch cooking, twice. */
const MAX_MEALS_PER_BATCH = 3;
const MAX_MEALS_VARIED = 2;
const ATTEMPTS = 120;
/** Finishing a whole open pack counts about as much as two good reasons (`bonus`). */
const PACK_WEIGHT = 3;

/** The version of a recipe that satisfies the diet options, or null if none does. */
function pickVersion(r: RecipeSummary, o: AutoPlanOptions): Candidate | null {
	let data: RecipeSummary | RecipeVariant = r;
	let variant: string | undefined;
	if (o.glutenFree && r.gluten === 'contains') {
		const gf = r.variants.find((v) => v.name === GF_VARIANT);
		if (!gf) return null;
		data = gf;
		variant = gf.name;
	}
	if (o.noSubstitutes && data.usesSubstitutes) {
		const plain = r.variants.find((v) => v.name === PLAIN_VARIANT && !v.usesSubstitutes);
		if (!plain || variant) return null;
		data = plain;
		variant = plain.name;
	}
	// Comfort food isn't planned for the week; its lighter version (baked, less oil) can be.
	if (data.treat.length) {
		const light = r.variants.find((v) => v.treat.length === 0);
		if (!light || variant) return null;
		data = light;
		variant = light.name;
	}
	if (o.excludeAllergens.some((a) => data.allergens.includes(a))) return null;
	const fridge = r.keeps?.fridge ?? 2;
	return {
		recipe: r,
		variant,
		cost: data.costPerServing,
		protein: data.perServing.protein,
		maxMeals: Math.max(
			1,
			Math.min(o.batchCooking ? MAX_MEALS_PER_BATCH : MAX_MEALS_VARIED, fridge + 1)
		)
	};
}

/** Breakfasts are lighter: a third of the protein asked of a main meal is enough. */
const BREAKFAST_PROTEIN_SHARE = 1 / 3;

export function breakfastCandidates(recipes: RecipeSummary[], o: AutoPlanOptions): Candidate[] {
	return recipes
		.filter((r) => isBreakfastRecipe(r) && !r.meals.includes('domace'))
		.filter((r) => r.showNutrition && (!o.mild || r.spicy === 0))
		.map((r) => pickVersion(r, o))
		.filter(
			(c): c is Candidate => c !== null && c.protein >= o.minProtein * BREAKFAST_PROTEIN_SHARE
		);
}

export function candidates(recipes: RecipeSummary[], o: AutoPlanOptions): Candidate[] {
	return (
		recipes
			.filter((r) => r.meals.includes('obed') || r.meals.includes('vecera'))
			// DIY staples (seitan, tofu, hummus) are ingredients, not a meal on their own.
			.filter((r) => !r.meals.includes('domace'))
			.filter((r) => r.showNutrition && (!o.mild || r.spicy === 0))
			.map((r) => pickVersion(r, o))
			.filter((c): c is Candidate => c !== null && c.protein >= o.minProtein)
	);
}

type Chosen = { c: Candidate; meals: number }[];

/** How much of each opened pack is left after the recipes chosen so far. */
export type OpenPacks = Map<string, number>;

export interface PackNeed {
	id: string;
	grams: number;
	/** Grams in one pack. */
	pack: number;
}

/** Grams of each pack-bought ingredient a recipe takes for `portions`. */
function packNeeds(
	c: Pick<Candidate, 'recipe' | 'variant'>,
	portions: number,
	packOf: (id: string) => number | undefined
): PackNeed[] {
	return planLines(c.recipe, c.variant).flatMap((l) => {
		const pack = packOf(l.ingredientId);
		return pack && l.grams > 0
			? [{ id: l.ingredientId, grams: (l.grams * portions) / c.recipe.servings, pack }]
			: [];
	});
}

/** Packs' worth (0.6 = 60 % of a pack) a recipe would use up from what's already open. */
export function packsFinished(needs: PackNeed[], open: OpenPacks): number {
	return needs.reduce((sum, n) => sum + Math.min(n.grams, open.get(n.id) ?? 0) / n.pack, 0);
}

/** Takes what a recipe needs from the open packs, opening new ones for the rest. */
export function openPacks(needs: PackNeed[], open: OpenPacks): void {
	for (const n of needs) {
		const left = open.get(n.id) ?? 0;
		const rest = n.grams - left;
		open.set(n.id, rest <= 0 ? left - n.grams : Math.ceil(rest / n.pack - 1e-9) * n.pack - rest);
	}
}

/** One randomized greedy pass: cheap, protein-rich, varied picks until `wanted` meals are covered. */
function greedy(
	pool: Candidate[],
	wanted: number,
	rand: () => number,
	costWeight: number,
	ctx: AutoPlanContext,
	/** Portions eaten at one meal. */
	perMeal: number
): Chosen {
	const chosen: Chosen = [];
	const usedCuisines = new Map<string, number>();
	const open: OpenPacks = new Map();
	const packOf = ctx.packOf ?? (() => undefined);
	let left = wanted;
	while (left > 0) {
		const options = pool.filter((c) => !chosen.some((x) => x.c.recipe.id === c.recipe.id));
		if (!options.length) break;
		const scored = options.map((c) => {
			const repeat = usedCuisines.get(c.recipe.cuisine) ?? 0;
			const portions = Math.min(left, c.maxMeals) * perMeal;
			const score =
				// Half a bunch of coriander bought for one recipe is worth a second one that uses it.
				-packsFinished(packNeeds(c, portions, packOf), open) * PACK_WEIGHT +
				c.cost * costWeight -
				c.protein * 0.05 +
				repeat * 0.8 -
				(ctx.pantryScore?.(c.recipe) ?? 0) * 1.2 -
				(ctx.inSeason?.(c.recipe) ? 0.4 : 0) -
				(ctx.bonus?.(c.recipe) ?? 0) * 1.5 +
				rand() * 2.5;
			return { c, score };
		});
		scored.sort((a, b) => a.score - b.score);
		const pick = scored[0].c;
		const meals = Math.min(left, pick.maxMeals);
		openPacks(packNeeds(pick, meals * perMeal, packOf), open);
		chosen.push({ c: pick, meals });
		usedCuisines.set(pick.recipe.cuisine, (usedCuisines.get(pick.recipe.cuisine) ?? 0) + 1);
		left -= meals;
	}
	return chosen;
}

/**
 * Builds a plan of lunches/dinners (and breakfasts, when asked): many randomized greedy
 * attempts, each picking cheap, protein-rich, varied recipes (bonus for pantry and season),
 * then keeps the attempt that fits the budget best.
 */
export function autoPlan(
	recipes: RecipeSummary[],
	o: AutoPlanOptions,
	ctx: AutoPlanContext = {}
): AutoPlanResult {
	const pool = candidates(recipes, o);
	const morningPool = o.breakfasts ? breakfastCandidates(recipes, o) : [];
	const wantedMain = o.slots?.main ?? o.days * o.mealsPerDay;
	const wantedMorning = o.breakfasts ? (o.slots?.morning ?? o.days) : 0;
	// Portions per meal, on average over the plan.
	const perMain = o.slots && o.slots.main ? o.slots.mainPortions / o.slots.main : o.people;
	const perMorning =
		o.slots && o.slots.morning ? o.slots.morningPortions / o.slots.morning : o.people;
	const portions = (meals: number, breakfast: boolean) =>
		meals * (breakfast ? perMorning : perMain);
	const wanted = wantedMain + wantedMorning;
	const rand = seededRandom(o.seed);
	// With a budget, cheapness only has to fit it; without one, cheaper is simply better.
	const costWeight = o.budget === null ? 1.5 : 0.35;
	let best: { result: AutoPlanResult; score: number } | null = null;

	for (let attempt = 0; attempt < ATTEMPTS && pool.length; attempt++) {
		const main = greedy(pool, wantedMain, rand, costWeight, ctx, perMain);
		const morning = greedy(morningPool, wantedMorning, rand, costWeight, ctx, perMorning);
		const all = [...main, ...morning];
		const entry = ({ c, meals }: Chosen[number], breakfast: boolean): PlanEntry => ({
			recipeId: c.recipe.id,
			servings: Math.ceil(portions(meals, breakfast) - 1e-9),
			...(c.variant && { variant: c.variant }),
			...(breakfast && { breakfast: true })
		});
		const entries = [...main.map((x) => entry(x, false)), ...morning.map((x) => entry(x, true))];
		const cost =
			main.reduce((sum, { c, meals }) => sum + c.cost * portions(meals, false), 0) +
			morning.reduce((sum, { c, meals }) => sum + c.cost * portions(meals, true), 0);
		const meals = all.reduce((sum, x) => sum + x.meals, 0);
		const result: AutoPlanResult = {
			entries,
			cost,
			meals,
			wanted,
			minProtein: Math.min(...main.map((x) => x.c.protein)),
			withinBudget: o.budget === null || cost <= o.budget
		};
		const over = o.budget === null ? 0 : Math.max(0, cost - o.budget);
		const cuisines = new Set(main.map((x) => x.c.recipe.cuisine)).size;
		// Within the budget, any fitting plan is fine – prefer variety, then let the seed decide.
		const score =
			over * 10 +
			(wanted - meals) * 5 +
			(o.budget === null ? cost * 0.05 : 0) -
			cuisines * 0.4 +
			rand() * 1.5;
		if (!best || score < best.score) best = { result, score };
	}

	return (
		best?.result ?? {
			entries: [],
			cost: 0,
			meals: 0,
			wanted,
			minProtein: 0,
			withinBudget: o.budget === null
		}
	);
}

/**
 * Replaces one recipe of a suggested plan with a similar one (price close, preferably another
 * cuisine) that isn't in the plan yet, keeping its servings. Returns the plan unchanged when
 * nothing else fits.
 */
export function swapEntry(
	recipes: RecipeSummary[],
	o: AutoPlanOptions,
	plan: AutoPlanResult,
	index: number,
	ctx: AutoPlanContext = {}
): AutoPlanResult {
	const current = plan.entries[index];
	const pool = current?.breakfast ? breakfastCandidates(recipes, o) : candidates(recipes, o);
	const byId = new Map(pool.map((c) => [c.recipe.id, c]));
	const old = current && byId.get(current.recipeId);
	if (!old) return plan;
	const taken = new Set(plan.entries.map((e) => e.recipeId));
	const rand = seededRandom(o.seed);
	const packOf = ctx.packOf ?? (() => undefined);
	// What the rest of the plan leaves in its packs, for the new recipe to finish.
	const open: OpenPacks = new Map();
	const byRecipe = new Map(recipes.map((r) => [r.id, r]));
	plan.entries.forEach((e, i) => {
		const recipe = byRecipe.get(e.recipeId);
		if (i !== index && recipe)
			openPacks(packNeeds({ recipe, variant: e.variant }, e.servings, packOf), open);
	});
	const scored = pool
		.filter((c) => !taken.has(c.recipe.id))
		.map((c) => ({
			c,
			score:
				-packsFinished(packNeeds(c, current.servings, packOf), open) * PACK_WEIGHT +
				Math.abs(c.cost - old.cost) * 2 +
				(c.recipe.cuisine === old.recipe.cuisine ? 0.6 : 0) -
				(ctx.pantryScore?.(c.recipe) ?? 0) -
				(ctx.inSeason?.(c.recipe) ? 0.3 : 0) +
				rand() * 1.5
		}))
		.sort((a, b) => a.score - b.score);
	const pick = scored[0]?.c;
	if (!pick) return plan;

	const entry: PlanEntry = {
		recipeId: pick.recipe.id,
		servings: current.servings,
		...(pick.variant && { variant: pick.variant }),
		...(current.breakfast && { breakfast: true })
	};
	const entries = plan.entries.map((e, i) => (i === index ? entry : e));
	const cost = plan.cost + (pick.cost - old.cost) * current.servings;
	return {
		...plan,
		entries,
		cost,
		// Breakfasts don't count toward the protein floor of main meals.
		minProtein: current.breakfast
			? plan.minProtein
			: Math.min(
					...entries
						.filter((e) => !e.breakfast)
						.map((e) => byId.get(e.recipeId)?.protein ?? Infinity)
				),
		withinBudget: o.budget === null || cost <= o.budget
	};
}
