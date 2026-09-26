import { formatAmount } from './amounts';
import { MEAL_LABELS } from './labels';
import type { Ingredient, RecipeDetail } from './types';

const minutes = (m: number) => `PT${Math.round(m)}M`;

/** schema.org Recipe, so search engines can show time, calories and ingredients. */
export function recipeJsonLd(
	recipe: RecipeDetail,
	byId: Map<string, Ingredient>,
	cuisineName: string | undefined,
	origin: string
) {
	const diets = ['https://schema.org/VeganDiet'];
	if (recipe.gluten === 'free') diets.push('https://schema.org/GlutenFreeDiet');
	const n = recipe.perServing;
	return {
		'@context': 'https://schema.org',
		'@type': 'Recipe',
		name: recipe.title,
		description: recipe.description,
		image: `${origin}/og/${recipe.id}.png`,
		url: `${origin}/recepty/${recipe.id}`,
		recipeCuisine: cuisineName,
		recipeCategory: MEAL_LABELS[recipe.meals[0]],
		keywords: ['vegánske', ...recipe.tags].join(', '),
		suitableForDiet: diets,
		totalTime: minutes(recipe.time),
		prepTime: minutes(recipe.activeTime),
		cookTime: minutes(Math.max(0, recipe.time - recipe.activeTime)),
		recipeYield: recipe.yields ?? `${recipe.servings} porcie`,
		recipeIngredient: recipe.lines.map((line) => {
			const name = byId.get(line.ingredientId)?.name ?? line.ingredientId;
			return line.amount === null
				? `${name} podľa chuti`
				: `${formatAmount(line.amount, line.unit)} ${name}`;
		}),
		recipeInstructions: recipe.steps.map((text) => ({ '@type': 'HowToStep', text })),
		...(recipe.showNutrition && {
			nutrition: {
				'@type': 'NutritionInformation',
				servingSize: '1 porcia',
				calories: `${Math.round(n.kcal)} kcal`,
				proteinContent: `${Math.round(n.protein)} g`,
				carbohydrateContent: `${Math.round(n.carbs)} g`,
				fatContent: `${Math.round(n.fat)} g`,
				fiberContent: `${Math.round(n.fiber)} g`,
				sodiumContent: `${Math.round(n.salt * 400)} mg`
			}
		})
	};
}

/** JSON for an inline <script type="application/ld+json">; `<` is escaped so text can't close the tag. */
export function serializeJsonLd(data: unknown): string {
	return JSON.stringify(data).replace(/</g, '\\u003c');
}
