import {
	NUTRIENT_KEYS,
	type Allergen,
	type GlutenStatus,
	type Ingredient,
	type NutrientKey,
	type Nutrients,
	type RecipeLine,
	type RecipeSummary,
	type Warning
} from './types';

export const NUTRIENT_META: Record<NutrientKey, { label: string; unit: string }> = {
	kcal: { label: 'Energia', unit: 'kcal' },
	protein: { label: 'Bielkoviny', unit: 'g' },
	carbs: { label: 'Sacharidy', unit: 'g' },
	fat: { label: 'Tuky', unit: 'g' },
	fiber: { label: 'Vláknina', unit: 'g' },
	salt: { label: 'Soľ', unit: 'g' },
	iron: { label: 'Železo', unit: 'mg' },
	calcium: { label: 'Vápnik', unit: 'mg' },
	zinc: { label: 'Zinok', unit: 'mg' },
	ala: { label: 'Omega-3 (ALA)', unit: 'g' },
	b12: { label: 'Vitamín B12', unit: 'µg' }
};

/**
 * Daily reference values for an adult (EU reference intakes / EFSA), salt as WHO upper limit.
 * Protein is replaced by 1.1 g/kg when the user sets their weight.
 */
export const DAILY_REFERENCE: Nutrients = {
	kcal: 2000,
	protein: 65,
	carbs: 260,
	fat: 70,
	fiber: 30,
	salt: 5,
	iron: 14,
	calcium: 1000,
	zinc: 10,
	ala: 2,
	b12: 4
};

export const VEGAN_PROTEIN_G_PER_KG = 1.1;

export const ALLERGEN_LABELS: Record<Allergen, string> = {
	soy: 'sója',
	peanuts: 'arašidy',
	nuts: 'orechy',
	sesame: 'sezam',
	mustard: 'horčica',
	celery: 'zeler',
	lupin: 'vlčí bôb',
	sulphites: 'siričitany'
};

export function emptyNutrients(): Nutrients {
	return Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 0])) as Nutrients;
}

export function addScaled(target: Nutrients, per100g: Nutrients, grams: number): Nutrients {
	for (const key of NUTRIENT_KEYS) target[key] += (per100g[key] * grams) / 100;
	return target;
}

export function scaleNutrients(n: Nutrients, factor: number): Nutrients {
	return Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, n[k] * factor])) as Nutrients;
}

export function recipeNutrients(
	lines: RecipeLine[],
	byId: Map<string, Ingredient>,
	servings: number
): Nutrients {
	const total = emptyNutrients();
	for (const line of lines) {
		if (!line.notEaten) addScaled(total, byId.get(line.ingredientId)!.per100g, line.grams);
	}
	return scaleNutrients(total, 1 / servings);
}

const GLUTEN_RANK: Record<GlutenStatus, number> = { free: 0, risk: 1, contains: 2 };

export function recipeGluten(ingredients: Ingredient[]): {
	status: GlutenStatus;
	culprits: Ingredient[];
	swappable: boolean;
} {
	const culprits = ingredients.filter((i) => i.gluten !== 'free');
	const status = culprits.reduce<GlutenStatus>(
		(worst, i) => (GLUTEN_RANK[i.gluten] > GLUTEN_RANK[worst] ? i.gluten : worst),
		'free'
	);
	const swappable = culprits.every((i) => i.gluten === 'risk' || i.gfAlternative !== undefined);
	return { status, culprits, swappable };
}

export function recipeAllergens(ingredients: Ingredient[]): Allergen[] {
	return [...new Set(ingredients.flatMap((i) => i.allergens))].sort();
}

export function proteinEnergyShare(n: Nutrients): number {
	return n.kcal > 0 ? (n.protein * 4) / n.kcal : 0;
}

export const HIGH_PROTEIN_G = 20;
export const QUICK_MINUTES = 20;
export const CHEAP_EUR = 1.2;

export type ComputedTag =
	| 'bezlepkove'
	| 'vela-bielkovin'
	| 'rychle'
	| 'lacne'
	| 'vela-vlakniny'
	| 'zelezo'
	| 'omega-3'
	| 'jeden-hrniec'
	| 'bez-varenia'
	| 'len-rura'
	| 'jemne';

/** Equipment that heats food; which of them a recipe uses decides the cooking-style tags. */
const HEAT = ['hrniec', 'panvica', 'rura'] as const;

/** One pot, no heat at all, or only the oven – read from the recipe's equipment. */
export function cookingStyle(equipment: string[]): ComputedTag | null {
	const used = HEAT.filter((h) => equipment.includes(h));
	if (used.length === 0) return 'bez-varenia';
	if (used.length === 1 && used[0] === 'hrniec') return 'jeden-hrniec';
	if (used.length === 1 && used[0] === 'rura') return 'len-rura';
	return null;
}

export const COMPUTED_TAG_LABELS: Record<ComputedTag, string> = {
	bezlepkove: 'Bezlepkové',
	'vela-bielkovin': 'Veľa bielkovín',
	rychle: 'Do 20 minút',
	lacne: 'Lacné',
	'vela-vlakniny': 'Veľa vlákniny',
	zelezo: 'Zdroj železa',
	'omega-3': 'Omega-3',
	'jeden-hrniec': 'Jeden hrniec',
	'bez-varenia': 'Bez varenia',
	'len-rura': 'Len rúra',
	jemne: 'Nepálivé, aj pre deti'
};

export function computedTags(r: RecipeSummary): ComputedTag[] {
	const n = r.perServing;
	const tags: ComputedTag[] = [];
	if (r.gluten === 'free') tags.push('bezlepkove');
	if (r.time <= QUICK_MINUTES) tags.push('rychle');
	if (r.costPerServing <= CHEAP_EUR) tags.push('lacne');
	const style = cookingStyle(r.equipment);
	if (style) tags.push(style);
	if (r.spicy === 0) tags.push('jemne');
	// Strained DIY staples (soy milk, tofu) don't contain everything their ingredients do.
	if (!r.showNutrition) return tags;
	if (n.protein >= HIGH_PROTEIN_G || proteinEnergyShare(n) >= 0.25) tags.push('vela-bielkovin');
	if (n.fiber >= 10) tags.push('vela-vlakniny');
	if (n.iron >= 5) tags.push('zelezo');
	if (n.ala >= 1.5) tags.push('omega-3');
	return tags;
}

export function recipeWarnings(
	ingredients: Ingredient[],
	byId: Map<string, Ingredient>,
	perServing: Nutrients
): Warning[] {
	const warnings: Warning[] = [];
	const gluten = recipeGluten(ingredients);

	for (const i of gluten.culprits) {
		const alt = i.gfAlternative ? byId.get(i.gfAlternative) : undefined;
		const swap = alt ? ` Bezlepková zámena: ${alt.name}.` : '';
		warnings.push(
			i.gluten === 'contains'
				? { level: 'danger', text: `Obsahuje lepok: ${i.name}.${swap}` }
				: {
						level: 'warn',
						text: `Riziko lepku: ${i.name}${i.note ? ` – ${i.note}` : ' – kontroluj etiketu'}.${swap}`
					}
		);
	}

	const allergens = recipeAllergens(ingredients);
	if (allergens.length > 0) {
		warnings.push({
			level: 'warn',
			text: `Alergény: ${allergens.map((a) => ALLERGEN_LABELS[a]).join(', ')}.`
		});
	}

	for (const i of ingredients) if (i.warn) warnings.push({ level: 'warn', text: i.warn });

	if (perServing.salt > 2.5) {
		warnings.push({
			level: 'info',
			text: `Porcia má ${perServing.salt.toFixed(1)} g soli (polovica denného limitu) – dosoľuj opatrne.`
		});
	}
	if (perServing.iron >= 4) {
		warnings.push({
			level: 'info',
			text: 'Dobrý zdroj železa: pridaj vitamín C (citrón, paprika) a čaj či kávu si daj až hodinu po jedle.'
		});
	}
	return warnings;
}
