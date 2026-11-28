import { describe, expect, it } from 'vitest';
import {
	recipeEmbeddingText,
	similarToRecipes,
	syncRecipeIndex,
	type IndexedRecipe
} from './semantic';

describe('recipeEmbeddingText', () => {
	it('describes the dish in words: kind, meal, ingredients and traits', () => {
		const text = recipeEmbeddingText(
			{
				title: 'Tom kha',
				description: 'Kokosová polievka.',
				meals: ['obed'],
				categories: ['polievky/azijske'],
				tags: ['one-pot'],
				time: 30,
				spicy: 2
			},
			'Thajská',
			['Kokosové mlieko', 'Tofu natural']
		);
		expect(text).toContain('Tom kha. Kokosová polievka.');
		expect(text).toContain('Kuchyňa: Thajská.');
		expect(text).toContain('Druh: Polievky – Ázijské a rezancové.');
		expect(text).toContain('Kedy: Obed.');
		expect(text).toContain('Suroviny: Kokosové mlieko, Tofu natural.');
		expect(text).toContain('rýchle, pikantné, one pot.');
	});
});

/** Just enough of D1 for the sync: the stored hashes and the writes made to them. */
function fakeDb(rows: { id: string; hash: string }[]) {
	const stored = new Map(rows.map((r) => [r.id, r.hash]));
	const statement = (sql: string, args: string[] = []) => ({
		bind: (...values: string[]) => statement(sql, values),
		all: async () => ({ results: [...stored].map(([id, hash]) => ({ id, hash })) }),
		run: async () => {
			if (sql.startsWith('INSERT')) stored.set(args[0], args[1]);
			if (sql.startsWith('DELETE')) stored.delete(args[0]);
		}
	});
	const db = {
		prepare: (sql: string) => statement(sql),
		batch: async (statements: { run: () => Promise<void> }[]) => {
			for (const s of statements) await s.run();
		}
	};
	return { db: db as unknown as D1Database, stored };
}

function fakeEnv(recipes: IndexedRecipe[], rows: { id: string; hash: string }[]) {
	const { db, stored } = fakeDb(rows);
	const embedded: string[] = [];
	const upserted: string[] = [];
	const deleted: string[] = [];
	const env = {
		DB: db,
		ASSETS: { fetch: async () => Response.json(recipes) } as unknown as Fetcher,
		AI: {
			run: async (_model: string, { text }: { text: string[] }) => {
				embedded.push(...text);
				return { data: text.map(() => [0.1, 0.2]) };
			}
		} as unknown as Ai,
		RECIPE_INDEX: {
			upsert: async (vectors: { id: string }[]) => {
				upserted.push(...vectors.map((v) => v.id));
			},
			deleteByIds: async (ids: string[]) => {
				deleted.push(...ids);
			}
		} as unknown as Vectorize
	};
	return { env, stored, embedded, upserted, deleted };
}

describe('syncRecipeIndex', () => {
	it('embeds new and changed recipes, removes deleted ones and skips the rest', async () => {
		const first = fakeEnv(
			[
				{ id: 'a', text: 'A' },
				{ id: 'b', text: 'B' }
			],
			[]
		);
		await syncRecipeIndex(first.env);
		expect(first.upserted).toEqual(['a', 'b']);
		const hashes = [...first.stored];

		const second = fakeEnv(
			[
				{ id: 'a', text: 'A' },
				{ id: 'c', text: 'C' }
			],
			hashes.map(([id, hash]) => ({ id, hash }))
		);
		await syncRecipeIndex(second.env);
		expect(second.embedded).toEqual(['C']);
		expect(second.deleted).toEqual(['b']);
		expect([...second.stored.keys()].sort()).toEqual(['a', 'c']);
	});
});

describe('similarToRecipes', () => {
	it('sums the neighbours of every seed and leaves the seeds out', async () => {
		const neighbours: Record<string, [string, number][]> = {
			kari: [
				['kari', 1],
				['dal', 0.8],
				['polievka', 0.5]
			],
			wok: [
				['wok', 1],
				['kari', 0.6],
				['polievka', 0.5],
				['rezance', 0.7]
			]
		};
		const index = {
			queryById: async (id: string) => ({
				matches: neighbours[id].map(([match, score]) => ({ id: match, score }))
			})
		} as unknown as Vectorize;
		expect(await similarToRecipes(index, ['kari', 'wok'], 3)).toEqual([
			'polievka',
			'dal',
			'rezance'
		]);
	});
});
