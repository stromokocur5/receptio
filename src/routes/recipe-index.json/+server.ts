import { getContent } from '$lib/server/content';
import { recipeEmbeddingText, type IndexedRecipe } from '$lib/server/semantic';
import type { RequestHandler } from './$types';

export const prerender = true;

/** The text of every recipe for the search by meaning; the cron embeds what changed. */
export const GET: RequestHandler = () => {
	const { recipes, ingredients, cuisines } = getContent();
	const ingredientNames = new Map(ingredients.map((i) => [i.id, i.name.split(' (')[0]]));
	const cuisineNames = new Map(cuisines.map((c) => [c.id, c.name]));
	const index: IndexedRecipe[] = recipes.map((r) => ({
		id: r.id,
		text: recipeEmbeddingText(r, cuisineNames.get(r.cuisine) ?? '', [
			...new Set(
				r.lines
					.filter((l) => l.ingredientId !== 'voda')
					.map((l) => ingredientNames.get(l.ingredientId)!)
			)
		])
	}));
	return new Response(JSON.stringify(index), {
		headers: { 'content-type': 'application/json' }
	});
};
