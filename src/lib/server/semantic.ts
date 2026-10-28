import { RECIPE_CATEGORIES, splitCategory, subLabel } from '../categories';
import { MEAL_LABELS } from '../labels';
import type { RecipeSummary } from '../types';

/**
 * Search by meaning: every recipe is embedded once with Workers AI into Vectorize, a typed
 * wish ("niečo hrejivé s hubami") is embedded on the fly and the nearest recipes come back.
 * bge-m3 is multilingual, so Slovak works without translating.
 */
export const EMBEDDING_MODEL = '@cf/baai/bge-m3';
/** Recipes embedded per cron run; the first full index takes a few runs. */
const MAX_PER_RUN = 200;
/** Texts per Workers AI call. */
const BATCH = 50;
/** Where the build writes the texts (prerendered, see routes/recipe-index.json). */
export const RECIPE_INDEX_PATH = '/recipe-index.json';

export interface IndexedRecipe {
	id: string;
	text: string;
}

/** "Polievky – Ázijské a rezancové": the sub alone doesn't say it's a soup. */
function categoryText(path: string): string {
	const { category } = splitCategory(path);
	return [RECIPE_CATEGORIES[category]?.label, subLabel(path)].filter(Boolean).join(' – ');
}

/** What a recipe is about, in words: the text that gets embedded. */
export function recipeEmbeddingText(
	recipe: Pick<
		RecipeSummary,
		'title' | 'description' | 'meals' | 'categories' | 'tags' | 'time' | 'spicy'
	>,
	cuisineName: string,
	ingredientNames: string[]
): string {
	const traits = [
		recipe.time <= 30 && 'rýchle',
		recipe.spicy >= 2 && 'pikantné',
		...recipe.tags.map((t) => t.replace(/-/g, ' '))
	].filter(Boolean);
	return [
		`${recipe.title}. ${recipe.description}`,
		`Kuchyňa: ${cuisineName}.`,
		`Druh: ${recipe.categories.map(categoryText).join(', ')}.`,
		`Kedy: ${recipe.meals.map((m) => MEAL_LABELS[m]).join(', ')}.`,
		`Suroviny: ${ingredientNames.join(', ')}.`,
		traits.length ? `${traits.join(', ')}.` : ''
	]
		.filter(Boolean)
		.join('\n');
}

async function hashText(text: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function embed(ai: Ai, texts: string[]): Promise<number[][]> {
	const output = (await ai.run(EMBEDDING_MODEL, { text: texts })) as { data?: number[][] };
	if (!output.data || output.data.length !== texts.length) {
		throw new Error(`semantic: ${EMBEDDING_MODEL} returned ${output.data?.length} vectors`);
	}
	return output.data;
}

/**
 * Brings the vector index up to the deployed recipes: embeds new and changed ones (by a hash
 * of their text, kept in D1) and removes deleted ones. Runs from the cron; does nothing when
 * nothing changed.
 */
export async function syncRecipeIndex(env: {
	DB: D1Database;
	AI: Ai;
	RECIPE_INDEX: Vectorize;
	ASSETS: Fetcher;
}): Promise<void> {
	const response = await env.ASSETS.fetch(`https://assets.local${RECIPE_INDEX_PATH}`);
	if (!response.ok) throw new Error(`semantic: ${RECIPE_INDEX_PATH} ${response.status}`);
	const recipes = (await response.json()) as IndexedRecipe[];
	const stored = await env.DB.prepare('SELECT id, hash FROM recipe_vectors').all<{
		id: string;
		hash: string;
	}>();
	const known = new Map(stored.results.map((r) => [r.id, r.hash]));

	const hashed = await Promise.all(
		recipes.map(async (r) => ({ ...r, hash: await hashText(r.text) }))
	);
	const changed = hashed.filter((r) => known.get(r.id) !== r.hash).slice(0, MAX_PER_RUN);
	for (let at = 0; at < changed.length; at += BATCH) {
		const batch = changed.slice(at, at + BATCH);
		const vectors = await embed(
			env.AI,
			batch.map((r) => r.text)
		);
		await env.RECIPE_INDEX.upsert(batch.map((r, i) => ({ id: r.id, values: vectors[i] })));
		await env.DB.batch(
			batch.map((r) =>
				env.DB.prepare('INSERT OR REPLACE INTO recipe_vectors (id, hash) VALUES (?, ?)').bind(
					r.id,
					r.hash
				)
			)
		);
	}

	const current = new Set(recipes.map((r) => r.id));
	const removed = [...known.keys()].filter((id) => !current.has(id));
	if (removed.length) {
		await env.RECIPE_INDEX.deleteByIds(removed);
		await env.DB.batch(
			removed.map((id) => env.DB.prepare('DELETE FROM recipe_vectors WHERE id = ?').bind(id))
		);
	}
}

/** Recipe ids nearest in meaning to the query, best first. */
export async function similarRecipeIds(
	ai: Ai,
	index: Vectorize,
	query: string,
	topK: number
): Promise<{ id: string; score: number }[]> {
	const [vector] = await embed(ai, [query]);
	const { matches } = await index.query(vector, { topK });
	return matches.map((m) => ({ id: m.id, score: m.score }));
}

/**
 * Recipes nearest to a few recipes at once ("Pre teba" from what was liked and cooked, or the
 * one recipe being read): each seed's neighbours, scores summed, the seeds left out.
 * Uses only the stored vectors – no Workers AI call.
 */
export async function similarToRecipes(
	index: Vectorize,
	seedIds: string[],
	topK: number
): Promise<string[]> {
	const seeds = new Set(seedIds);
	const results = await Promise.all(
		seedIds.map((id) => index.queryById(id, { topK: topK + seedIds.length }))
	);
	const scores = new Map<string, number>();
	for (const { matches } of results) {
		for (const m of matches) {
			if (!seeds.has(m.id)) scores.set(m.id, (scores.get(m.id) ?? 0) + m.score);
		}
	}
	return [...scores]
		.sort((a, b) => b[1] - a[1])
		.slice(0, topK)
		.map(([id]) => id);
}
