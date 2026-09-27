import { describe, expect, it } from 'vitest';
import {
	bedPlants,
	bedSize,
	bedWarnings,
	fillWithCombo,
	newSeason,
	plantsPerCell,
	type Bed,
	comboLayout,
	decodeShared,
	encodeShared,
	yieldEstimate,
	frostDates,
	harvestRecipes,
	localizeGuide,
	seasonDelayWeeks,
	successors,
	harvestTotals,
	monthTasks,
	planGarden,
	sowNow,
	yearsPhrase
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
		yieldKg: 1,
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

	it('puts crops side by side when a box is too shallow for rows', () => {
		const layout = comboLayout(
			combo('parapet', 0.3, ['fazula', 'kukurica', 'mata'], {
				members: ['fazula', 'kukurica', 'mata'].map((id) => ({
					ingredientId: id,
					name: id,
					count: 1
				}))
			}),
			guides
		);
		const xs = layout.dots.map((d) => d.x);
		expect(new Set(xs).size).toBe(3);
		expect(layout.dots.every((d) => Math.abs(d.y - 0.15) < 1e-9)).toBe(true);
	});

	it('puts a guild tree in the middle and the rest in rings', () => {
		const layout = comboLayout(
			combo('cech', 16, [], {
				layout: 'kruh',
				depth: 4,
				members: [
					{ ingredientId: 'kukurica', name: 'k', count: 1 },
					{ ingredientId: 'fazula', name: 'f', count: 10 }
				]
			}),
			guides
		);
		expect(layout.width).toBe(4);
		expect(layout.dots[0]).toMatchObject({ x: 2, y: 2, ingredientId: 'kukurica' });
		expect(layout.dots).toHaveLength(11);
		expect(
			layout.dots.slice(1).every((d) => Math.hypot(d.x - 2, d.y - 2) > 0.5 && d.x > 0 && d.x < 4)
		).toBe(true);
	});

	it('says when a tree bears fruit in Slovak', () => {
		expect(yearsPhrase(1)).toBe('o rok');
		expect(yearsPhrase(3)).toBe('o 3 roky');
		expect(yearsPhrase(6)).toBe('o 6 rokov');
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

describe('local season', () => {
	it('delays the season with altitude', () => {
		expect(seasonDelayWeeks(120)).toBe(0);
		expect(seasonDelayWeeks(500)).toBe(2);
		expect(seasonDelayWeeks(1200)).toBe(5);
		const { lastSpring, firstAutumn } = frostDates(650, 2026);
		expect(lastSpring.toISOString().slice(0, 10)).toBe('2026-05-11');
		expect(firstAutumn.toISOString().slice(0, 10)).toBe('2026-09-29');
	});

	it('moves spring work and summer harvest later, autumn sowing earlier', () => {
		const g = { ...guide('cesnak', 'x', [4, 10]), indoor: [3], harvest: [7, 12] };
		const local = localizeGuide(g, 5);
		expect(local.sow).toEqual([5, 9]);
		expect(local.indoor).toEqual([4]);
		expect(local.harvest).toEqual([8, 12]);
		expect(localizeGuide(g, 1)).toBe(g);
	});

	it('suggests a second crop of another family after an early harvest', () => {
		const peas = { ...guide('hrach', 'bobovite', [3]), harvest: [6, 7], where: ['zahrada'] };
		const chinese = { ...guide('kapusta', 'kapustovite', [7, 8]), where: ['zahrada'] };
		const beans = { ...guide('fazula2', 'bobovite', [8]), where: ['zahrada'] };
		const all = [peas, chinese, beans] as unknown as GrowGuide[];
		expect(
			successors(peas as unknown as GrowGuide, all, 'zahrada').map((g) => g.ingredientId)
		).toEqual(['kapusta']);
	});
});

describe('wanted crops, yield and sharing', () => {
	it('puts combinations with wanted crops first', () => {
		const plan = planGarden(
			{ place: 'zahrada', area: 4, sun: 'slnko', level: 1 },
			[combo('a', 3, ['kukurica']), combo('b', 3, ['fazula'])],
			guides,
			new Set(['fazula'])
		);
		expect(plan.combos.map((c) => c.combo.id)).toEqual(['b']);
	});

	it('plants wanted crops on their own when no combination has them', () => {
		const tomato = {
			...guide('paradajky', 'lilkovite', [5]),
			spacing: 50,
			where: ['zahrada'],
			sun: ['slnko'],
			level: 2
		} as unknown as GrowGuide;
		const plan = planGarden(
			{ place: 'zahrada', area: 4, sun: 'slnko', level: 1 },
			[combo('a', 3, ['kukurica'])],
			[...guides, tomato],
			new Set(['paradajky'])
		);
		expect(plan.extras).toEqual([
			{ ingredientId: 'paradajky', name: 'paradajky', count: 2, area: 0.5, level: 2 }
		]);
		expect(plan.plants.find((p) => p.ingredientId === 'paradajky')?.count).toBe(2);
	});

	it('estimates harvest and its shop value', () => {
		const est = yieldEstimate([{ ingredientId: 'fazula', count: 3 }], guides, () => 4);
		expect(est).toEqual({ kg: 3, eur: 12, perCrop: [{ ingredientId: 'fazula', kg: 3, eur: 12 }] });
	});

	it('round-trips a plan through a link and rejects junk', () => {
		const shared = {
			place: 'zahrada' as const,
			area: 12.5,
			sun: 'slnko' as const,
			level: 2 as const,
			beds: [
				{
					name: 'Záhon pri plote',
					width: 3,
					depth: 1.2,
					cells: { '0,0': 'mrkva', '2,1': 'cesnak' }
				}
			]
		};
		expect(decodeShared(encodeShared(shared))).toEqual(shared);
		expect(decodeShared('nie-je-to-plan')).toBeNull();
		expect(decodeShared(encodeShared({ ...shared, area: -1 }))).toBeNull();
	});
});

describe('bed editor', () => {
	const g = (
		id: string,
		spacing: number,
		family: string,
		avoid: string[] = [],
		perennial = false
	) => ({ ingredientId: id, name: id, spacing, family, avoid, perennial }) as unknown as GrowGuide;
	const crops = [
		g('mrkva', 4, 'mrkvovite'),
		g('cibula', 10, 'cibulovite', ['hrach']),
		g('hrach', 5, 'bobovite'),
		g('cuketa', 90, 'tekvicovite'),
		g('mata', 30, 'x', [], true)
	];
	const bed = (cells: Record<string, string>, past: Bed['past'] = []): Bed => ({
		id: 'b',
		name: 'b',
		width: 1.2,
		depth: 0.9,
		cells,
		past
	});

	it('sizes the grid and counts plants per square', () => {
		expect(bedSize({ width: 1.2, depth: 0.9 })).toEqual({ cols: 4, rows: 3 });
		expect(plantsPerCell(10)).toBe(9);
		expect(plantsPerCell(4)).toBe(16);
		expect(bedPlants(bed({ '0,0': 'cibula', '1,0': 'cibula', '2,0': 'cuketa' }), crops)).toEqual([
			{ ingredientId: 'cibula', cells: 2, count: 18, cellsPerPlant: 1 },
			{ ingredientId: 'cuketa', cells: 1, count: 0, cellsPerPlant: 9 }
		]);
	});

	it('warns about bad neighbours, repeated families and cramped plants', () => {
		const warnings = bedWarnings(
			bed({ '0,0': 'cibula', '1,0': 'hrach', '3,2': 'cuketa' }, [
				{ year: 2025, families: ['bobovite'] }
			]),
			crops
		);
		expect(warnings.map((w) => w.kind)).toEqual(['neighbours', 'rotation', 'space']);
		expect(warnings[0].cells.sort()).toEqual(['0,0', '1,0']);
	});

	it('fills free squares from a combination and starts a new season', () => {
		const filled = fillWithCombo(
			bed({ '0,0': 'mata' }),
			{
				members: [
					{ ingredientId: 'cibula', name: 'c', count: 10 },
					{ ingredientId: 'mrkva', name: 'm', count: 16 }
				]
			} as GrowCombo,
			crops
		);
		expect(Object.values(filled.cells).filter((id) => id === 'cibula')).toHaveLength(2);
		expect(Object.values(filled.cells).filter((id) => id === 'mrkva')).toHaveLength(1);
		const next = newSeason(filled, crops, 2026);
		expect(next.cells).toEqual({ '0,0': 'mata' });
		expect(next.past).toEqual([
			{ year: 2026, families: expect.arrayContaining(['x', 'cibulovite', 'mrkvovite']) }
		]);
	});
});
