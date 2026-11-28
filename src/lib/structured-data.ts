import { formatAmount } from './amounts';
import { RECIPE_CATEGORIES, splitCategory, subLabel } from './categories';
import type { Ingredient, RecipeDetail } from './types';

const minutes = (m: number) => `PT${Math.round(m)}M`;

/** Tags that only make recipes findable in the app search; never published. */
const SEARCH_ONLY_TAGS = new Set(['zlatica', 'nasarodinka']);

/** Who publishes the site; referenced as author and publisher. */
export function organizationJsonLd(origin: string) {
	return {
		'@type': 'Organization',
		'@id': `${origin}/#organization`,
		name: 'Receptio',
		url: `${origin}/`,
		logo: `${origin}/icon-512.png`
	};
}

/** Tells search engines the site's name, so results show "Receptio" instead of the domain. */
export function websiteJsonLd(origin: string) {
	return {
		'@context': 'https://schema.org',
		'@graph': [
			{
				'@type': 'WebSite',
				'@id': `${origin}/#website`,
				name: 'Receptio',
				alternateName: 'Receptio – vegánske a bezlepkové recepty',
				url: `${origin}/`,
				inLanguage: 'sk',
				publisher: { '@id': `${origin}/#organization` }
			},
			organizationJsonLd(origin)
		]
	};
}

/** The path above a page (Recepty › Indická › Dal), shown instead of the bare URL in results. */
export function breadcrumbJsonLd(items: { name: string; path: string }[], origin: string) {
	return {
		'@context': 'https://schema.org',
		'@type': 'BreadcrumbList',
		itemListElement: items.map((item, i) => ({
			'@type': 'ListItem',
			position: i + 1,
			name: item.name,
			item: origin + item.path
		}))
	};
}

/** A wiki guide as an article. */
export function articleJsonLd(
	page: { title: string; summary: string; path: string; image?: string },
	origin: string
) {
	return {
		'@context': 'https://schema.org',
		'@type': 'Article',
		headline: page.title,
		description: page.summary,
		url: origin + page.path,
		image: origin + (page.image ?? '/og/receptio.png'),
		inLanguage: 'sk',
		author: organizationJsonLd(origin),
		publisher: organizationJsonLd(origin)
	};
}

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
		recipeCategory: RECIPE_CATEGORIES[splitCategory(recipe.categories[0]).category].label,
		keywords: [
			'vegánsky recept',
			recipe.gluten === 'free' ? 'bezlepkový recept' : '',
			cuisineName ? `${cuisineName.toLowerCase()} kuchyňa` : '',
			...recipe.categories.map(subLabel).map((l) => l.toLowerCase()),
			...recipe.tags.filter((t) => !SEARCH_ONLY_TAGS.has(t))
		]
			.filter(Boolean)
			.join(', '),
		inLanguage: 'sk',
		author: organizationJsonLd(origin),
		publisher: organizationJsonLd(origin),
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
