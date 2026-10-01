import { describe, expect, it } from 'vitest';
import { pickToday } from './today';
import type { Ingredient, RecipeSummary } from './types';

const ing = (id: string, season: number[] = []) =>
	({ id, group: id, groupFactor: 1, staple: false, swapsTo: [], season }) as unknown as Ingredient;

const byId = new Map(
	[ing('cicer'), ing('ryza'), ing('tofu'), ing('tekvica', [9, 10]), ing('cestoviny')].map((i) => [
		i.id,
		i
	])
);

function recipe(id: string, ids: string[], extra: Partial<RecipeSummary> = {}): RecipeSummary {
	return {
		id,
		cuisine: id,
		meals: ['obed'],
		time: 30,
		treat: [],
		perServing: { kcal: 500 },
		lines: ids.map((ingredientId) => ({ ingredientId, grams: 200, amount: 200, unit: 'g' })),
		...extra
	} as RecipeSummary;
}

const base = { pantry: {}, month: 1, maxTime: 0, skip: new Set<string>(), seed: 1 };

describe('pickToday', () => {
	const recipes = [
		recipe('kari', ['cicer', 'ryza']),
		recipe('tofu-ryza', ['tofu', 'ryza']),
		recipe('tekvicova', ['tekvica']),
		recipe('pasta', ['cestoviny'])
	];

	it('puts what the pantry covers first', () => {
		const picks = pickToday(recipes, byId, { ...base, pantry: { cicer: 500, ryza: 500 } });
		expect(picks[0].recipe.id).toBe('kari');
		expect(picks[0].match?.missing).toEqual([]);
		expect(picks).toHaveLength(3);
	});

	it('leaves out treats, long recipes, soaking ahead and skipped ones', () => {
		const picks = pickToday(
			[
				recipe('langos', ['cestoviny'], { treat: ['vyprazane'] }),
				recipe('dlhe', ['ryza'], { time: 90 }),
				recipe('namocit', ['cicer'], { ahead: 'Namoč cez noc' }),
				recipe('ranajky', ['ryza'], { meals: ['ranajky'] }),
				recipe('priloha', ['ryza'], { perServing: { kcal: 100 } } as Partial<RecipeSummary>),
				recipe('vcera', ['tofu']),
				recipe('ok', ['tofu'])
			],
			byId,
			{ ...base, maxTime: 45, skip: new Set(['vcera']) }
		);
		expect(picks.map((p) => p.recipe.id)).toEqual(['ok']);
	});

	it('never offers two recipes of one cuisine', () => {
		const picks = pickToday(
			[recipe('a', ['tofu'], { cuisine: 'x' }), recipe('b', ['ryza'], { cuisine: 'x' })],
			byId,
			base
		);
		expect(picks).toHaveLength(1);
	});

	it('marks seasonal dishes and changes with the seed', () => {
		const october = pickToday(recipes, byId, { ...base, month: 10 });
		expect(october.find((p) => p.recipe.id === 'tekvicova')?.inSeason).toBe(true);
		const orders = new Set(
			[1, 2, 3, 4, 5, 6].map((seed) =>
				pickToday(recipes, byId, { ...base, seed })
					.map((p) => p.recipe.id)
					.join()
			)
		);
		expect(orders.size).toBeGreaterThan(1);
	});
});
