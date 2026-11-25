import { describe, expect, it } from 'vitest';
import {
	buildFromParams,
	buildToParams,
	chosenParts,
	combineFacts,
	dishLines,
	matchDish,
	pickMethod,
	rankDishes,
	type Dish,
	type Kitchen,
	type Part,
	type PartMethod
} from './dish';
import { emptyNutrients } from './nutrition';
import type { IngredientLite } from './types';

const ing = (id: string, extra: Partial<IngredientLite> = {}): IngredientLite => ({
	id,
	name: id,
	category: 'zelenina',
	group: id,
	groupFactor: 1,
	staple: false,
	color: '#000',
	units: {},
	...extra
});
const byId = new Map(
	[ing('tofu'), ing('ryza'), ing('quinoa'), ing('olej', { category: 'oleje' }), ing('citron')].map(
		(i) => [i.id, i]
	)
);

function method(
	label: string,
	lines: [string, number][],
	extra: Partial<PartMethod> = {}
): PartMethod {
	return {
		label,
		needs: [],
		steps: [{ text: label, min: 5, free: false, pause: false }],
		lines: lines.map(([ingredientId, grams]) => ({
			ingredientId,
			grams,
			amount: grams,
			unit: 'g'
		})),
		perServing: { ...emptyNutrients(), kcal: 100 },
		costPerServing: 1,
		costIsEstimate: false,
		gluten: 'free',
		allergens: [],
		treat: [],
		...extra
	};
}

function part(id: string, methods: PartMethod[], servings = 2): Part {
	return { id, name: id, kind: 'priloha', servings, methods, early: false, tips: [] };
}

const tofu = part('tofu', [
	method(
		'V airfryeri',
		[
			['tofu', 200],
			['olej', 5]
		],
		{ needs: ['airfryer'] }
	),
	method('Na panvici', [
		['tofu', 200],
		['olej', 15]
	])
]);
const ryza = part('ryza', [method('V hrnci', [['ryza', 150]])]);
const quinoa = part('quinoa', [method('V hrnci', [['quinoa', 120]])]);
const citron = part('citron', [method('Nakrájaný', [['citron', 50]])]);
const partsById = new Map([tofu, ryza, quinoa, citron].map((p) => [p.id, p]));

const dish: Dish = {
	id: 'misa',
	name: 'Misa',
	description: '',
	meals: ['obed'],
	servings: 2,
	slots: [
		{ id: 'bielkovina', label: 'Bielkovina', options: ['tofu'], optional: false },
		{ id: 'zaklad', label: 'Základ', options: ['ryza', 'quinoa'], optional: false },
		{ id: 'navrch', label: 'Navrch', options: ['citron'], optional: true }
	],
	finish: [],
	tips: []
};

const bare: Kitchen = { burners: 2, tools: [] };
const airfryer: Kitchen = { burners: 2, tools: ['airfryer'] };

describe('pickMethod', () => {
	it('takes the usual way when the kitchen can do it, else the next one', () => {
		expect(pickMethod(tofu, airfryer)?.label).toBe('V airfryeri');
		expect(pickMethod(tofu, bare)?.label).toBe('Na panvici');
	});

	it('respects a picked method only if the kitchen has the tools', () => {
		expect(pickMethod(tofu, airfryer, 'Na panvici')?.label).toBe('Na panvici');
		expect(pickMethod(tofu, bare, 'V airfryeri')?.label).toBe('Na panvici');
	});

	it('accepts any one of alternative tools', () => {
		const hummus = part('hummus', [method('V mixéri', [], { needs: [['tycovy-mixer', 'mixer']] })]);
		expect(pickMethod(hummus, { burners: 1, tools: ['mixer'] })).toBeDefined();
		expect(pickMethod(hummus, bare)).toBeUndefined();
	});
});

describe('matchDish', () => {
	it('picks the options already at home and skips optional extras that need shopping', () => {
		const match = matchDish(dish, { tofu: 400, quinoa: null }, partsById, byId, bare)!;
		expect(match.choice).toEqual({ bielkovina: 'tofu', zaklad: 'quinoa', navrch: null });
		expect(match.missing).toEqual([]);
	});

	it('lists what is missing and short, but never oil or spices', () => {
		const match = matchDish(dish, { tofu: 100 }, partsById, byId, bare)!;
		expect(match.missing.map((i) => i.id)).toEqual(['ryza']);
		expect(match.short.map((i) => i.id)).toEqual(['tofu']);
	});

	it('ranks dishes that can be cooked now first', () => {
		const other = { ...dish, id: 'iba-ryza', slots: [dish.slots[1]] };
		const ranked = rankDishes(
			[dish, other].map((d) => matchDish(d, { ryza: null }, partsById, byId, bare)!)
		);
		expect(ranked[0].dish.id).toBe('iba-ryza');
	});
});

describe('combining parts', () => {
	it('adds facts of the chosen methods and merges lines', () => {
		const parts = chosenParts(dish, { zaklad: 'ryza', navrch: null }, {}, partsById, bare);
		expect(parts.map((p) => [p.part.id, p.method.label])).toEqual([
			['tofu', 'Na panvici'],
			['ryza', 'V hrnci']
		]);
		expect(combineFacts(parts.map((p) => p.method)).perServing.kcal).toBe(200);
		const lines = dishLines(parts, 4, byId);
		expect(lines.find((l) => l.ingredientId === 'tofu')?.grams).toBe(400);
		expect(lines.find((l) => l.ingredientId === 'olej')?.grams).toBe(30);
	});

	it('adds the same ingredient in different units by weight', () => {
		const spoon = part('a', [method('x', [])]);
		spoon.methods[0].lines = [{ ingredientId: 'olej', grams: 30, amount: 2, unit: 'pl' }];
		const tea = part('b', [method('x', [])]);
		tea.methods[0].lines = [
			{ ingredientId: 'olej', grams: 5, amount: 1, unit: 'čl', notEaten: true }
		];
		const [line] = dishLines(
			[
				{ part: spoon, method: spoon.methods[0] },
				{ part: tea, method: tea.methods[0] }
			],
			2,
			byId
		);
		expect(line).toMatchObject({ grams: 35, unit: 'pl' });
		expect(line.amount).toBeCloseTo(35 / 15);
		expect(line.notEaten).toBeUndefined();
	});
});

describe('builds in the URL', () => {
	it('round-trips choices, left-out slots, methods and servings', () => {
		const build = {
			servings: 3,
			choice: { bielkovina: 'tofu', zaklad: 'quinoa', navrch: null },
			methods: { tofu: 'Na panvici' }
		};
		const params = buildToParams(dish, build);
		expect(params.toString()).toBe('porcie=3&zaklad=quinoa&navrch=-&ako-tofu=Na+panvici');
		expect(buildFromParams(dish, params, partsById)).toEqual(build);
	});

	it('ignores unknown parts, methods and silly servings', () => {
		const params = new URLSearchParams('porcie=999&zaklad=pizza&bielkovina=-&ako-tofu=Na+grile');
		expect(buildFromParams(dish, params, partsById)).toEqual({
			servings: 2,
			choice: { bielkovina: 'tofu', zaklad: 'ryza', navrch: 'citron' },
			methods: {}
		});
	});
});
