import { seededRandom } from './art';
import type { PlanEntry } from './shopping';
import type { Allergen, RecipeSummary, RecipeVariant } from './types';

export interface AutoPlanOptions {
	days: number;
	people: number;
	mealsPerDay: 1 | 2;
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
}

export interface AutoPlanContext {
	/** 0–1, how much of the recipe is already at home. */
	pantryScore?: (recipe: RecipeSummary) => number;
	/** True when the recipe's produce is in season now. */
	inSeason?: (recipe: RecipeSummary) => boolean;
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

/**
 * Builds a plan of lunches/dinners: many randomized greedy attempts, each picking cheap,
 * protein-rich, varied recipes (bonus for pantry and season), then keeps the attempt that
 * fits the budget best.
 */
export function autoPlan(
	recipes: RecipeSummary[],
	o: AutoPlanOptions,
	ctx: AutoPlanContext = {}
): AutoPlanResult {
	const pool = candidates(recipes, o);
	const wanted = o.days * o.mealsPerDay;
	const rand = seededRandom(o.seed);
	// With a budget, cheapness only has to fit it; without one, cheaper is simply better.
	const costWeight = o.budget === null ? 1.5 : 0.35;
	let best: { result: AutoPlanResult; score: number } | null = null;

	for (let attempt = 0; attempt < ATTEMPTS && pool.length; attempt++) {
		const chosen: { c: Candidate; meals: number }[] = [];
		const usedCuisines = new Map<string, number>();
		let left = wanted;
		while (left > 0) {
			const options = pool.filter((c) => !chosen.some((x) => x.c.recipe.id === c.recipe.id));
			if (!options.length) break;
			const scored = options.map((c) => {
				const repeat = usedCuisines.get(c.recipe.cuisine) ?? 0;
				const score =
					c.cost * costWeight -
					c.protein * 0.05 +
					repeat * 0.8 -
					(ctx.pantryScore?.(c.recipe) ?? 0) * 1.2 -
					(ctx.inSeason?.(c.recipe) ? 0.4 : 0) +
					rand() * 2.5;
				return { c, score };
			});
			scored.sort((a, b) => a.score - b.score);
			const pick = scored[0].c;
			const meals = Math.min(left, pick.maxMeals);
			chosen.push({ c: pick, meals });
			usedCuisines.set(pick.recipe.cuisine, (usedCuisines.get(pick.recipe.cuisine) ?? 0) + 1);
			left -= meals;
		}

		const entries: PlanEntry[] = chosen.map(({ c, meals }) =>
			c.variant
				? { recipeId: c.recipe.id, servings: meals * o.people, variant: c.variant }
				: { recipeId: c.recipe.id, servings: meals * o.people }
		);
		const cost = chosen.reduce((sum, { c, meals }) => sum + c.cost * meals * o.people, 0);
		const meals = chosen.reduce((sum, x) => sum + x.meals, 0);
		const result: AutoPlanResult = {
			entries,
			cost,
			meals,
			wanted,
			minProtein: Math.min(...chosen.map((x) => x.c.protein)),
			withinBudget: o.budget === null || cost <= o.budget
		};
		const over = o.budget === null ? 0 : Math.max(0, cost - o.budget);
		const cuisines = new Set(chosen.map((x) => x.c.recipe.cuisine)).size;
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
	const pool = candidates(recipes, o);
	const byId = new Map(pool.map((c) => [c.recipe.id, c]));
	const current = plan.entries[index];
	const old = current && byId.get(current.recipeId);
	if (!old) return plan;
	const taken = new Set(plan.entries.map((e) => e.recipeId));
	const rand = seededRandom(o.seed);
	const scored = pool
		.filter((c) => !taken.has(c.recipe.id))
		.map((c) => ({
			c,
			score:
				Math.abs(c.cost - old.cost) * 2 +
				(c.recipe.cuisine === old.recipe.cuisine ? 0.6 : 0) -
				(ctx.pantryScore?.(c.recipe) ?? 0) -
				(ctx.inSeason?.(c.recipe) ? 0.3 : 0) +
				rand() * 1.5
		}))
		.sort((a, b) => a.score - b.score);
	const pick = scored[0]?.c;
	if (!pick) return plan;

	const entry: PlanEntry = pick.variant
		? { recipeId: pick.recipe.id, servings: current.servings, variant: pick.variant }
		: { recipeId: pick.recipe.id, servings: current.servings };
	const entries = plan.entries.map((e, i) => (i === index ? entry : e));
	const cost = plan.cost + (pick.cost - old.cost) * current.servings;
	return {
		...plan,
		entries,
		cost,
		minProtein: Math.min(...entries.map((e) => byId.get(e.recipeId)?.protein ?? Infinity)),
		withinBudget: o.budget === null || cost <= o.budget
	};
}
