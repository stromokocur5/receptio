import { describe, expect, it } from 'vitest';
import { planCheck, type PlanCheckEntry } from './plancheck';
import type { Ingredient, RecipeLine } from './types';

const byId = new Map(
	[
		{ id: 'cicer', category: 'strukoviny' },
		{ id: 'mrkva', category: 'zelenina' },
		{ id: 'cestoviny', category: 'obilniny' }
	].map((i) => [i.id, i as unknown as Ingredient])
);
const line = (ingredientId: string, grams: number) => ({ ingredientId, grams }) as RecipeLine;
const entry = (lines: RecipeLine[], treat: string[] = []): PlanCheckEntry => {
	const data = { lines, treat } as unknown as PlanCheckEntry['data'];
	return { recipe: { servings: 2 } as PlanCheckEntry['recipe'], data, servings: 2 };
};

describe('planCheck', () => {
	it('praises a plan with legumes and plenty of vegetables', () => {
		const tips = planCheck([entry([line('cicer', 240), line('mrkva', 600)])], byId, 1, 2);
		expect(tips.map((t) => t.level)).toEqual(['ok', 'ok']);
	});

	it('asks for legumes and vegetables when they are missing', () => {
		const tips = planCheck(
			[entry([line('cestoviny', 400)]), entry([line('cestoviny', 400), line('mrkva', 100)])],
			byId,
			2,
			1
		);
		expect(tips.every((t) => t.level === 'tip')).toBe(true);
		expect(tips[0].text).toContain('0 z 2');
		expect(tips[1].text).toContain('50 g');
	});

	it('counts treats per week', () => {
		const fried = entry([line('cicer', 200), line('mrkva', 800)], ['vyprazane']);
		const tips = planCheck([fried, fried, fried], byId, 7, 1);
		expect(tips.at(-1)?.text).toMatch(/^3 jedál je „na občas“/);
	});
});
