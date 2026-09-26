import { describe, expect, it } from 'vitest';
import { consumeFromPantry, rankByLeftovers, rankByPantry } from './pantry';
import { buildShoppingList } from './shopping';
import { basketByStore } from './pricing';
import type { Ingredient, PriceEntry, RecipeSummary } from './types';

const zero = {
	kcal: 0,
	protein: 0,
	carbs: 0,
	fat: 0,
	fiber: 0,
	salt: 0,
	iron: 0,
	calcium: 0,
	zinc: 0,
	ala: 0,
	b12: 0
};

function ing(id: string, group = id, extra: Partial<Ingredient> = {}): Ingredient {
	return {
		id,
		name: id,
		category: 'strukoviny',
		group,
		gluten: 'free',
		allergens: [],
		staple: false,
		per100g: zero,
		units: {},
		density: 1,
		priceEstimate: 2,
		co2: 1,
		color: '#000000',
		howto: [],
		homemade: false,
		byproduct: false,
		groupFactor: 1,
		season: [],
		...extra
	};
}

const ingredients = [
	ing('cicer-suchy', 'cicer'),
	ing('cicer-sterilizovany', 'cicer'),
	ing('ryza'),
	ing('sol', 'sol', { staple: true, category: 'koreniny' })
];
const byId = new Map(ingredients.map((i) => [i.id, i]));

function recipe(id: string, lines: [string, number][], servings = 2): RecipeSummary {
	return {
		id,
		title: id,
		description: '',
		cuisine: 'x',
		meals: ['obed'],
		time: 10,
		activeTime: 5,
		servings,
		difficulty: 1,
		tags: [],
		gluten: 'free',
		gfSwappable: true,
		allergens: [],
		perServing: zero,
		costPerServing: 1,
		costIsEstimate: true,
		co2PerServing: 0.5,
		usesSubstitutes: false,
		warnings: [],
		substitutes: 'none',
		showNutrition: true,
		variants: [],
		equipment: [],
		spicy: 0,
		servingGrams: 300,
		lines: lines.map(([ingredientId, grams]) => ({ ingredientId, grams, amount: grams, unit: 'g' }))
	};
}

describe('rankByPantry', () => {
	const withRice = recipe('s-ryzou', [
		['cicer-sterilizovany', 240],
		['ryza', 200],
		['sol', 5]
	]);
	const onlyChickpeas = recipe('len-cicer', [
		['cicer-sterilizovany', 240],
		['sol', 5]
	]);

	it('matches interchangeable ingredients by group and ignores staples', () => {
		const [first, second] = rankByPantry([withRice, onlyChickpeas], { 'cicer-suchy': null }, byId);
		expect(first.recipe.id).toBe('len-cicer');
		expect(first.missing).toEqual([]);
		expect(second.missing.map((i) => i.id)).toEqual(['ryza']);
	});

	it('flags ingredients that are present but insufficient', () => {
		const [match] = rankByPantry([onlyChickpeas], { 'cicer-suchy': 100 }, byId);
		expect(match.short.map((i) => i.id)).toEqual(['cicer-sterilizovany']);
		expect(match.score).toBeLessThan(1);
	});
});

describe('buildShoppingList', () => {
	const r = recipe('r', [
		['ryza', 200],
		['cicer-sterilizovany', 240],
		['sol', 5]
	]);
	const recipesById = new Map([[r.id, r]]);
	const today = new Date('2026-09-26');

	it('scales by servings and subtracts pantry amounts', () => {
		const list = buildShoppingList(
			[{ recipeId: 'r', servings: 4 }],
			recipesById,
			byId,
			{ ryza: 150 },
			[],
			today
		);
		const items = list.byCategory.flatMap(([, i]) => i);
		expect(items.find((i) => i.ingredient.id === 'ryza')?.buyGrams).toBe(250);
		expect(items.find((i) => i.ingredient.id === 'cicer-sterilizovany')?.buyGrams).toBe(480);
		expect(list.staples.map((i) => i.ingredient.id)).toEqual(['sol']);
		expect(list.hasEstimates).toBe(true);
	});

	it('moves out-of-stock basics from the check list to the shopping list', () => {
		const list = buildShoppingList(
			[{ recipeId: 'r', servings: 2 }],
			recipesById,
			byId,
			{},
			[],
			today,
			new Set(['sol'])
		);
		const salt = list.byCategory.flatMap(([, i]) => i).find((i) => i.ingredient.id === 'sol');
		expect(salt?.restock).toBe(true);
		expect(list.staples).toEqual([]);
	});

	it('uses real prices when available', () => {
		const prices: PriceEntry[] = [
			{
				ingredientId: 'ryza',
				storeId: 'lidl',
				product: 'Ryža',
				packGrams: 1000,
				price: 1,
				date: '2026-09-20'
			}
		];
		const list = buildShoppingList(
			[{ recipeId: 'r', servings: 2 }],
			recipesById,
			byId,
			{},
			prices,
			today
		);
		const rice = list.byCategory.flatMap(([, i]) => i).find((i) => i.ingredient.id === 'ryza')!;
		expect(rice.cost).toBeCloseTo(0.2);
		expect(rice.costIsEstimate).toBe(false);
	});
});

describe('basketByStore', () => {
	const today = new Date('2026-09-26');
	const stores = [
		{ id: 'a', name: 'A', color: '#000000' },
		{ id: 'b', name: 'B', color: '#000000' }
	];
	const entry = (storeId: string, price: number, date = '2026-09-20'): PriceEntry => ({
		ingredientId: 'ryza',
		storeId,
		product: 'x',
		packGrams: 1000,
		price,
		date
	});

	it('prefers the cheaper store and ignores stale prices', () => {
		const items = [{ ingredient: byId.get('ryza')!, grams: 1000 }];
		const baskets = basketByStore(items, stores, [entry('a', 3), entry('b', 2)], today);
		expect(baskets.map((b) => b.store.id)).toEqual(['b', 'a']);

		const stale = basketByStore(items, stores, [entry('a', 3), entry('b', 2, '2026-01-01')], today);
		expect(stale.map((b) => b.store.id)).toEqual(['a']);
	});
});

describe('consumeFromPantry', () => {
	const hummus = recipe('hummus', [
		['cicer-sterilizovany', 240],
		['ryza', 100],
		['sol', 5]
	]);

	it('takes the exact ingredient first, then the same group, scaled to servings', () => {
		const { pantry, used } = consumeFromPantry(
			{ 'cicer-suchy': 500, 'cicer-sterilizovany': 200, ryza: 1000 },
			hummus.lines,
			1.5,
			byId
		);
		expect(pantry).toEqual({ 'cicer-suchy': 340, ryza: 850 });
		expect(used.map((u) => [u.ingredient.id, u.grams, u.usedUp])).toEqual([
			['cicer-sterilizovany', 200, true],
			['cicer-suchy', 160, false],
			['ryza', 150, false]
		]);
	});

	it('converts between forms of a group (dry chickpeas swell 2.4×)', () => {
		const withDry = new Map(byId);
		withDry.set('cicer-suchy', ing('cicer-suchy', 'cicer', { groupFactor: 2.4 }));
		const { pantry, used } = consumeFromPantry({ 'cicer-suchy': 500 }, hummus.lines, 1, withDry);
		expect(pantry).toEqual({ 'cicer-suchy': 400 });
		expect(used[0].grams).toBeCloseTo(100);
	});

	it('leaves unweighed items and untracked ingredients alone', () => {
		const { pantry, used } = consumeFromPantry({ 'cicer-suchy': null }, hummus.lines, 1, byId);
		expect(pantry).toEqual({ 'cicer-suchy': null });
		expect(used).toEqual([]);
	});
});

describe('rankByLeftovers', () => {
	const both = recipe('oboje', [
		['cicer-sterilizovany', 240],
		['ryza', 200]
	]);
	const onlyRice = recipe('ryza-sama', [
		['ryza', 200],
		['sol', 5]
	]);
	const none = recipe('nic', [['sol', 5]]);

	it('puts recipes using more leftovers first and counts interchangeable forms', () => {
		const ranked = rankByLeftovers([onlyRice, none, both], ['ryza', 'cicer-suchy'], byId);
		expect(ranked.map((m) => m.recipe.id)).toEqual(['oboje', 'ryza-sama']);
		expect(ranked[0].uses.map((i) => i.id)).toEqual(['cicer-sterilizovany', 'ryza']);
		// Salt is assumed at home, so nothing else is needed.
		expect(ranked[1].others).toEqual([]);
	});
});
