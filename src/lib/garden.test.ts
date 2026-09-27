import { describe, expect, it } from 'vitest';
import {
	comboLayout,
	harvestRecipes,
	harvestTotals,
	monthTasks,
	planGarden,
	sowNow
} from './garden';
import type { GrowCombo, GrowGuide } from './types';

const guide = (ingredientId: string, family: string, sow: number[], perennial = false) =>
	({
		ingredientId,
		name: ingredientId,
		family,
		sow,
		indoor: [],
		harvest: [8],
		spacing: 20,
		perennial
	}) as unknown as GrowGuide;

const combo = (id: string, area: number, members: string[], extra: Partial<GrowCombo> = {}) =>
	({
		id,
		name: id,
		where: ['zahrada'],
		sun: ['slnko'],
		level: 1,
		area,
		members: members.map((m) => ({ ingredientId: m, name: m, count: 2 })),
		gear: [],
		layout: 'rows',
		...extra
	}) as GrowCombo;

const guides = [
	guide('fazula', 'bobovite', [5]),
	guide('kukurica', 'travy', [5]),
	guide('mata', 'x', [4], true)
];
const combos = [
	combo('sestry', 3, ['fazula', 'kukurica']),
	combo('okraj', 2, ['mata'], { max: 1 }),
	combo('tazke', 1, ['fazula'], { level: 3 }),
	combo('balkon', 0.5, ['fazula'], { where: ['balkon'] })
];

describe('planGarden', () => {
	it('keeps paths free, alternates combos and respects max', () => {
		const plan = planGarden({ place: 'zahrada', area: 12, sun: 'slnko', level: 1 }, combos, guides);
		expect(plan.paths).toBeCloseTo(2.4);
		expect(plan.combos.map((c) => [c.combo.id, c.modules])).toEqual([
			['okraj', 1],
			['sestry', 2]
		]);
		expect(plan.used).toBe(8);
		expect(plan.free).toBeCloseTo(1.6);
		expect(plan.plants.find((p) => p.ingredientId === 'fazula')?.count).toBe(4);
		expect(plan.gear).toContain('fúrik');
	});

	it('skips combos for other places, light or harder levels', () => {
		const plan = planGarden({ place: 'balkon', area: 1, sun: 'slnko', level: 1 }, combos, guides);
		expect(plan.paths).toBe(0);
		expect(plan.combos.map((c) => c.combo.id)).toEqual(['balkon']);
		expect(
			planGarden({ place: 'zahrada', area: 1, sun: 'tien', level: 3 }, combos, guides).combos
		).toEqual([]);
	});

	it('treats light as a minimum', () => {
		const shade = [combo('klicky', 0.1, ['fazula'], { sun: ['tien'] })];
		expect(
			planGarden({ place: 'zahrada', area: 1, sun: 'slnko', level: 1 }, shade, guides).combos
		).toHaveLength(1);
		const sunny = [combo('paradajky', 0.1, ['fazula'])];
		expect(
			planGarden({ place: 'zahrada', area: 1, sun: 'polotien', level: 1 }, sunny, guides).combos
		).toEqual([]);
	});

	it('builds a calendar without re-sowing perennials', () => {
		const plan = planGarden({ place: 'zahrada', area: 10, sun: 'slnko', level: 1 }, combos, guides);
		expect(plan.calendar[4].sow).toEqual(['fazula', 'kukurica']);
		expect(plan.calendar[3].sow).toEqual([]);
		expect(plan.families).toEqual(expect.arrayContaining(['bobovite', 'travy']));
	});
});

describe('sowNow', () => {
	it('lists crops to sow or start indoors this month', () => {
		expect(sowNow(guides, 5).map((g) => g.ingredientId)).toEqual(['fazula', 'kukurica']);
	});
});

describe('garden diary', () => {
	it('lists the month tasks and skips replanting perennials', () => {
		const plants = [{ ingredientId: 'fazula' }, { ingredientId: 'mata' }];
		expect(monthTasks(plants, guides, {}, 2026, 5).map((t) => t.key)).toEqual([
			'2026-5-sow-fazula'
		]);
		expect(monthTasks(plants, guides, {}, 2027, 4).map((t) => t.key)).toEqual(['2027-4-sow-mata']);
		expect(monthTasks(plants, guides, { '2026-4-sow-mata': '2026-04-10' }, 2027, 4)).toEqual([]);
	});

	it('sums a year of harvests and finds recipes for them', () => {
		const harvests = [
			{ ingredientId: 'fazula', grams: 300, date: '2026-08-01' },
			{ ingredientId: 'fazula', grams: 200, date: '2026-08-09' },
			{ ingredientId: 'kukurica', grams: 900, date: '2026-08-20' },
			{ ingredientId: 'fazula', grams: 100, date: '2025-08-01' }
		];
		expect(harvestTotals(harvests, 2026)).toEqual([
			{ ingredientId: 'kukurica', grams: 900 },
			{ ingredientId: 'fazula', grams: 500 }
		]);
		const recipes = [
			{ id: 'a', lines: [{ ingredientId: 'fazula' }] },
			{ id: 'b', lines: [{ ingredientId: 'fazula' }, { ingredientId: 'kukurica' }] },
			{ id: 'c', lines: [{ ingredientId: 'ryza' }] }
		];
		expect(harvestRecipes(recipes, ['fazula', 'kukurica']).map((r) => r.id)).toEqual(['b', 'a']);
	});
});

describe('comboLayout', () => {
	it('places every plant inside the bed, tall crops to the north', () => {
		const layout = comboLayout(
			combo('rad', 2, ['fazula', 'kukurica'], {
				members: [
					{ ingredientId: 'fazula', name: 'f', count: 4 },
					{ ingredientId: 'kukurica-klas', name: 'k', count: 3 }
				]
			}),
			guides
		);
		expect(layout.dots).toHaveLength(7);
		expect(layout.dots.every((d) => d.x > 0 && d.x < 2 && d.y > 0 && d.y < 1)).toBe(true);
		const corn = layout.dots.filter((d) => d.ingredientId === 'kukurica-klas');
		const beans = layout.dots.filter((d) => d.ingredientId === 'fazula');
		expect(Math.max(...corn.map((d) => d.y))).toBeLessThan(Math.min(...beans.map((d) => d.y)));
	});

	it('interleaves mixed plantings', () => {
		const layout = comboLayout(combo('mix', 1, ['fazula', 'kukurica'], { layout: 'mix' }), guides);
		expect(layout.dots.map((d) => d.ingredientId)).toEqual([
			'fazula',
			'kukurica',
			'fazula',
			'kukurica'
		]);
	});
});
