import { describe, expect, it } from 'vitest';
import type { Kitchen, PartStep } from './dish';
import { planTimeline, PREHEAT_MIN, type TimedStep } from './timeline';

const step = (text: string, min: number, extra: Partial<PartStep> = {}): PartStep => ({
	text,
	min,
	free: false,
	pause: false,
	...extra
});

const kitchen: Kitchen = { burners: 4, tools: ['rura'] };

const overlaps = (a: TimedStep, b: TimedStep) => a.start < b.end && b.start < a.end;

describe('planTimeline', () => {
	it('keeps a part’s steps in order and back to back', () => {
		const t = planTimeline(
			[
				{
					id: 'a',
					name: 'A',
					early: false,
					steps: [step('krájaj', 5), step('opekaj', 8, { on: 'platna' })]
				}
			],
			[],
			kitchen
		);
		expect(t.total).toBe(13);
		expect(t.steps.map((s) => [s.text, s.start, s.end])).toEqual([
			['krájaj', 0, 5],
			['opekaj', 5, 13]
		]);
	});

	it('never needs the cook’s hands twice at once', () => {
		const t = planTimeline(
			[
				{ id: 'a', name: 'A', early: false, steps: [step('krájaj', 5)] },
				{ id: 'b', name: 'B', early: false, steps: [step('miešaj', 4)] }
			],
			[],
			kitchen
		);
		expect(t.total).toBe(9);
		const [x, y] = t.steps;
		expect(overlaps(x, y)).toBe(false);
	});

	it('does hands-on work while something simmers', () => {
		const t = planTimeline(
			[
				{
					id: 'ryza',
					name: 'Ryža',
					early: false,
					steps: [step('zalej', 2, { on: 'platna' }), step('var', 20, { on: 'platna', free: true })]
				},
				{
					id: 'tofu',
					name: 'Tofu',
					early: false,
					steps: [step('krájaj', 5), step('opekaj', 10, { on: 'platna' })]
				}
			],
			[],
			kitchen
		);
		expect(t.total).toBe(22);
	});

	it('ends warm parts right before the plate is put together', () => {
		const t = planTimeline(
			[
				{
					id: 'dlhe',
					name: 'Dlhé',
					early: false,
					steps: [step('var', 30, { free: true, on: 'platna' })]
				},
				{ id: 'kratke', name: 'Krátke', early: false, steps: [step('opeč', 5, { on: 'platna' })] }
			],
			[step('nalož', 2)],
			kitchen
		);
		const short = t.steps.find((s) => s.partId === 'kratke')!;
		const plate = t.steps.find((s) => s.partId === null)!;
		expect(short.end).toBe(plate.start);
		expect(plate.end).toBe(t.total);
	});

	it('makes cold parts early instead of delaying warm ones', () => {
		const t = planTimeline(
			[
				{ id: 'salat', name: 'Šalát', early: true, steps: [step('krájaj', 6)] },
				{ id: 'tofu', name: 'Tofu', early: false, steps: [step('opekaj', 6, { on: 'platna' })] }
			],
			[],
			kitchen
		);
		const salad = t.steps.find((s) => s.partId === 'salat')!;
		const tofu = t.steps.find((s) => s.partId === 'tofu')!;
		expect(salad.end).toBeLessThanOrEqual(tofu.start);
		expect(tofu.end).toBe(t.total);
	});

	it('runs out of burners', () => {
		const one: Kitchen = { burners: 1, tools: [] };
		const t = planTimeline(
			[
				{
					id: 'a',
					name: 'A',
					early: false,
					steps: [step('var', 10, { on: 'platna', free: true })]
				},
				{ id: 'b', name: 'B', early: false, steps: [step('var', 10, { on: 'platna', free: true })] }
			],
			[],
			one
		);
		expect(t.total).toBe(20);
	});

	it('preheats the oven once and shares it at one temperature', () => {
		const bake = (id: string) => ({
			id,
			name: id,
			early: false,
			steps: [step('peč', 20, { on: 'rura' as const, temp: 200, free: true })]
		});
		const t = planTimeline([bake('a'), bake('b')], [], kitchen);
		expect(t.steps.filter((s) => s.preheat)).toHaveLength(1);
		expect(t.total).toBe(PREHEAT_MIN + 20);
	});

	it('does not bake two temperatures at once', () => {
		const t = planTimeline(
			[
				{
					id: 'a',
					name: 'A',
					early: false,
					steps: [step('peč', 20, { on: 'rura', temp: 220, free: true })]
				},
				{
					id: 'b',
					name: 'B',
					early: false,
					steps: [step('peč', 20, { on: 'rura', temp: 180, free: true })]
				}
			],
			[],
			kitchen
		);
		const [a, b] = t.steps.filter((s) => s.on === 'rura' && !s.preheat);
		expect(overlaps(a, b)).toBe(false);
	});

	it('lets a step marked pause wait', () => {
		const t = planTimeline(
			[
				{
					id: 'zemiaky',
					name: 'Zemiaky',
					early: false,
					steps: [
						step('var', 15, { on: 'platna', free: true }),
						step('opeč', 10, { on: 'platna', pause: true })
					]
				},
				{
					id: 'huby',
					name: 'Huby',
					early: false,
					steps: [step('obaľ', 10), step('vyprážaj', 10, { on: 'platna' })]
				}
			],
			[],
			{ burners: 2, tools: [] }
		);
		const steps = t.steps.filter((s) => s.partId === 'zemiaky');
		expect(steps[0].end).toBeLessThanOrEqual(steps[1].start);
	});

	it('keeps the hands for the first minutes of a free step', () => {
		const t = planTimeline(
			[
				{
					id: 'cestoviny',
					name: 'Cestoviny',
					early: false,
					steps: [step('vsyp a var', 10, { on: 'platna', free: true, hands: 1 })]
				},
				{ id: 'salat', name: 'Šalát', early: false, steps: [step('krájaj', 9)] }
			],
			[],
			kitchen
		);
		const pasta = t.steps.find((s) => s.partId === 'cestoviny')!;
		const salad = t.steps.find((s) => s.partId === 'salat')!;
		expect(salad.start >= pasta.start + 1 || salad.end <= pasta.start).toBe(true);
		expect(t.total).toBe(10);
	});
});
