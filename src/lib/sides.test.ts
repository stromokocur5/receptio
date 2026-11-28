import { describe, expect, it } from 'vitest';
import type { Part, PartMethod } from './dish';
import { emptyNutrients } from './nutrition';
import {
	hasStarch,
	resolveSides,
	sideGroup,
	sideLines,
	sidesFor,
	sideTiming,
	takesSides,
	validateSides
} from './sides';

function method(label: string, minutes: number[], grams = 100): PartMethod {
	return {
		label,
		needs: [],
		steps: minutes.map((min) => ({ text: label, min, free: true, pause: false })),
		lines: [{ ingredientId: 'ryza', grams, amount: grams, unit: 'g' }],
		perServing: { ...emptyNutrients(), kcal: 200 },
		costPerServing: 0.3,
		costIsEstimate: false,
		gluten: 'free',
		allergens: [],
		treat: []
	};
}

function part(id: string, extra: Partial<Part> = {}): Part {
	return {
		id,
		name: id,
		description: '',
		kind: 'priloha',
		style: [],
		servings: 2,
		methods: [method('V hrnci', [5, 15]), method('V rúre', [40])],
		early: false,
		tips: [],
		...extra
	};
}

describe('sides', () => {
	it('sorts parts into side groups, leaving warm sauces and sweet ones out', () => {
		expect(sideGroup(part('ryza'))).toBe('priloha');
		expect(sideGroup(part('chlieb', { kind: 'pecivo' }))).toBe('priloha');
		expect(sideGroup(part('salat', { kind: 'zelenina' }))).toBe('zelenina');
		expect(sideGroup(part('hummus', { kind: 'omacka', early: true }))).toBe('dip');
		expect(sideGroup(part('bolonska', { kind: 'omacka' }))).toBeUndefined();
		expect(sideGroup(part('karamel', { kind: 'omacka', early: true, style: ['sladke'] }))).toBe(
			undefined
		);
		expect(sideGroup(part('tofu', { kind: 'hlavne' }))).toBeUndefined();
	});

	it('puts sides of the same cuisine first', () => {
		const sides = [
			part('zemiaky', { style: ['domace'] }),
			part('basmati', { style: ['indicke'] }),
			part('quinoa')
		];
		expect(sidesFor(sides, 'priloha', 'indicke').map((p) => p.id)).toEqual([
			'basmati',
			'quinoa',
			'zemiaky'
		]);
	});

	it('times a side to be ready with the recipe', () => {
		const rice = part('ryza');
		expect(sideTiming(rice, rice.methods[0], 45)).toBe(
			'20 min · začni ju 25 min po začatí receptu'
		);
		expect(sideTiming(rice, rice.methods[1], 20)).toBe('40 min · začni ju 20 min pred receptom');
		expect(sideTiming(rice, rice.methods[0], 22)).toBe('20 min · začni spolu s receptom');
		const salad = part('salat', { kind: 'zelenina', early: true });
		expect(sideTiming(salad, salad.methods[0], 60)).toBe('20 min · dá sa pripraviť vopred');
	});

	it('scales side ingredients to the recipe servings, cooked the picked way', () => {
		const rice = part('ryza', {
			methods: [method('V hrnci', [20], 150), method('Rúra', [40], 90)]
		});
		const sides = resolveSides(
			[{ part: 'ryza', method: 'Rúra' }, { part: 'zmizla' }],
			new Map([['ryza', rice]])
		);
		expect(sides.map((s) => s.method.label)).toEqual(['Rúra']);
		expect(sideLines(sides, 4)[0].grams).toBe(180);
	});

	it('offers sides to mains only', () => {
		expect(takesSides({ meals: ['obed'], categories: ['hlavne/kari'] })).toBe(true);
		expect(takesSides({ meals: ['obed'], categories: ['polievky/strukovinove'] })).toBe(false);
		expect(takesSides({ meals: ['ranajky'], categories: ['ranajky/slane'] })).toBe(false);
	});

	it('knows when rice or pasta is already in the recipe', () => {
		const byId = new Map([
			['ryza', { id: 'ryza', category: 'obilniny' as const }],
			['muka', { id: 'muka', category: 'obilniny' as const }],
			['cicer', { id: 'cicer', category: 'strukoviny' as const }]
		]);
		const line = (ingredientId: string, grams: number) => ({
			ingredientId,
			grams,
			amount: grams,
			unit: 'g' as const
		});
		expect(hasStarch([line('cicer', 400), line('ryza', 300)], byId)).toBe(true);
		expect(hasStarch([line('cicer', 400), line('muka', 10)], byId)).toBe(false);
	});

	it('keeps only well-formed sides from storage', () => {
		expect(
			validateSides([{ part: 'ryza' }, { part: 'Bad Id' }, { part: 'salat', method: 'Rúra' }, 3])
		).toEqual([{ part: 'ryza' }, { part: 'salat', method: 'Rúra' }]);
		expect(validateSides('ryza')).toBeUndefined();
	});
});
