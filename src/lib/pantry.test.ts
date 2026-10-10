import { describe, expect, it } from 'vitest';
import { consumeFromPantry, rankByLeftovers, rankByPantry, useSoon } from './pantry';
import { buildShoppingList, packLeftover } from './shopping';
import {
	activeSales,
	bestPrice,
	compareStores,
	recipesOnSale,
	shelfCost,
	shelfName,
	unitPrice,
	type SaleDeal
} from './pricing';
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
		color: '#000000',
		howto: [],
		homemade: false,
		swapsTo: [],
		byproduct: false,
		groupFactor: 1,
		freeSugar: 0,
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
		categories: ['hlavne/kari'],
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
		costKnownShare: 0,
		usesSubstitutes: false,
		treat: [],
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

	it('matches interchangeable ingredients by group', () => {
		const [first, second] = rankByPantry(
			[withRice, onlyChickpeas],
			{ 'cicer-suchy': null, sol: null },
			byId
		);
		expect(first.recipe.id).toBe('len-cicer');
		expect(first.missing).toEqual([]);
		expect(second.missing.map((i) => i.id)).toEqual(['ryza']);
	});

	it('does not assume salt, oil or spices are at home', () => {
		const [match] = rankByPantry([onlyChickpeas], { 'cicer-suchy': null }, byId);
		expect(match.missing.map((i) => i.id)).toEqual(['sol']);
	});

	it('flags ingredients that are present but insufficient', () => {
		const [match] = rankByPantry([onlyChickpeas], { 'cicer-suchy': 100 }, byId);
		expect(match.short.map((i) => i.id)).toEqual(['cicer-sterilizovany']);
		expect(match.score).toBeLessThan(1);
	});

	it('uses a listed substitute from the pantry, but never one that adds gluten', () => {
		const lentils = [
			ing('sosovica-hneda', 'sosovica-hneda', { swapsTo: ['sosovica-cervena'] }),
			ing('sosovica-cervena')
		];
		const pasta = [
			ing('cestoviny-bezlepkove', 'cestoviny-bezlepkove', { swapsTo: ['cestoviny'] }),
			ing('cestoviny', 'cestoviny', { gluten: 'contains' })
		];
		const all = new Map([...byId, ...[...lentils, ...pasta].map((i) => [i.id, i] as const)]);

		const [dal] = rankByPantry(
			[recipe('dal', [['sosovica-hneda', 200]])],
			{ 'sosovica-cervena': null },
			all
		);
		expect(dal.missing).toEqual([]);
		expect(dal.swaps.map((s) => [s.need.id, s.use.id])).toEqual([
			['sosovica-hneda', 'sosovica-cervena']
		]);
		expect(dal.score).toBeLessThan(1);

		const [gf] = rankByPantry(
			[recipe('gf', [['cestoviny-bezlepkove', 200]])],
			{ cestoviny: null },
			all
		);
		expect(gf.missing.map((i) => i.id)).toEqual(['cestoviny-bezlepkove']);
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
				pack: '1 kg',
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

describe('shelfCost', () => {
	const today = new Date('2026-09-26');
	const entry = (storeId: string, price: number, date = '2026-09-20'): PriceEntry => ({
		ingredientId: 'ryza',
		storeId,
		product: 'x',
		pack: '1 kg',
		packGrams: 1000,
		price,
		date
	});

	it('prices whole packs, picking the pack size that is cheapest for the amount', () => {
		const ryza = byId.get('ryza')!;
		const small = { ...entry('a', 1), packGrams: 500 };
		const sack = { ...entry('a', 6), packGrams: 5000 };
		expect(shelfCost(ryza, 200, [small, sack], today)).toMatchObject({ packs: 1, cost: 1 });
		expect(shelfCost(ryza, 1100, [small, sack], today)).toMatchObject({ packs: 3, cost: 3 });
		expect(shelfCost(ryza, 520, [small], today)).toMatchObject({ packs: 1 });
		expect(shelfCost(ryza, 200, [], today)).toBeNull();

		const carrot = { ...ryza, id: 'mrkva', category: 'zelenina' as const };
		const loose = { ...entry('a', 1.2), ingredientId: 'mrkva' };
		expect(shelfCost(carrot, 250, [loose], today)?.cost).toBeCloseTo(0.3);
	});

	it('ignores stale prices', () => {
		expect(shelfCost(byId.get('ryza')!, 200, [entry('a', 1, '2026-01-01')], today)).toBeNull();
	});
});

describe('compareStores', () => {
	const today = new Date('2026-09-26');
	const stores = ['a', 'b', 'c'].map((id) => ({ id, name: id, color: '#000000' }));
	const ryza = byId.get('ryza')!;
	const cicer = byId.get('cicer-suchy')!;
	const price = (ingredientId: string, storeId: string, value: number): PriceEntry => ({
		ingredientId,
		storeId,
		product: 'x',
		pack: '1 kg',
		packGrams: 1000,
		price: value,
		date: '2026-09-20'
	});
	const items = [
		{ ingredient: ryza, grams: 500 },
		{ ingredient: cicer, grams: 500 }
	];

	it('prefers a shop that has everything and stays there when a second saves little', () => {
		const prices = [price('ryza', 'a', 2), price('cicer-suchy', 'a', 3), price('ryza', 'b', 1.5)];
		const result = compareStores(items, stores, prices, today);
		expect(result.single?.storeIds).toEqual(['a']);
		expect(result.single?.total).toBe(5);
		expect(result.pair?.total).toBe(4.5);
		expect(result.recommended?.storeIds).toEqual(['a']);
	});

	it('splits the shopping when it pays off', () => {
		const prices = [price('ryza', 'a', 5), price('cicer-suchy', 'a', 3), price('ryza', 'b', 1)];
		const result = compareStores(
			[...items, { ingredient: byId.get('sol')!, grams: 5 }],
			stores,
			prices,
			today
		);
		expect(result.single?.storeIds).toEqual(['a']);
		expect(result.recommended?.storeIds).toEqual(['a', 'b']);
		expect(result.recommended?.total).toBe(4);
		expect(result.recommended?.assignment.get('ryza')).toBe('b');
		expect(result.unpriced).toBe(1);
		expect(result.unpricedCost).toBeGreaterThan(0);
	});

	it('only compares the given shops', () => {
		const prices = [price('ryza', 'a', 2), price('ryza', 'b', 1), price('cicer-suchy', 'a', 3)];
		const result = compareStores(items, [stores[1], stores[2]], prices, today);
		expect(result.single).toMatchObject({ storeIds: ['b'], missing: 0, total: 1 });
		expect(result.unpriced).toBe(1);
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

describe('useSoon', () => {
	const byId = new Map(
		[
			{ id: 'spenat', name: 'Špenát', category: 'zelenina', group: 'spenat' },
			{ id: 'zemiaky', name: 'Zemiaky', category: 'zelenina', group: 'zemiaky' },
			{
				id: 'kukurica-sterilizovana',
				name: 'Kukurica',
				category: 'zelenina',
				group: 'kukurica'
			},
			{ id: 'ryza', name: 'Ryža', category: 'obilniny', group: 'ryza' }
		].map((i) => [i.id, i as Ingredient])
	);
	const pantry = { spenat: null, zemiaky: null, 'kukurica-sterilizovana': null, ryza: null };
	const added = {
		spenat: '2026-09-20',
		zemiaky: '2026-09-01',
		'kukurica-sterilizovana': '2026-09-01',
		ryza: '2026-09-01'
	};

	it('reminds only about fresh food that has been there a while', () => {
		const soon = useSoon(pantry, added, byId, new Date(2026, 8, 30));
		expect(soon.map((s) => [s.ingredient.id, s.days])).toEqual([['spenat', 10]]);
		expect(useSoon(pantry, added, byId, new Date(2026, 8, 22))).toEqual([]);
	});
});

describe('bestPrice', () => {
	const tofu = ing('tofu');
	const entry = (date: string, price: number, extra: Partial<PriceEntry> = {}): PriceEntry => ({
		ingredientId: 'tofu',
		storeId: 'tesco',
		product: 'Tofu',
		pack: '1 kg',
		packGrams: 1000,
		price,
		date,
		...extra
	});
	const today = new Date('2026-12-01');

	it('keeps an outdated shelf price as a labelled estimate instead of a rough guess', () => {
		const best = bestPrice(tofu, [entry('2026-09-26', 7), entry('2026-06-01', 5)], today);
		expect(best).toEqual({ perKg: 7, storeId: null, isEstimate: true, lastSeen: '2026-09-26' });
	});

	it('ignores ended sales and prices older than a year', () => {
		const prices = [entry('2026-09-26', 3, { saleUntil: '2026-09-30' }), entry('2025-10-01', 4)];
		expect(bestPrice(tofu, prices, today)).toEqual({ perKg: 2, storeId: null, isEstimate: true });
	});
});

describe('activeSales', () => {
	const price = (storeId: string, price: number, extra: Partial<PriceEntry> = {}): PriceEntry => ({
		ingredientId: 'zemiaky',
		storeId,
		product: 'Zemiaky',
		pack: '1 kg',
		packGrams: 1000,
		price,
		date: '2026-09-30',
		...extra
	});
	const today = new Date('2026-10-06');

	it('lists running sales with the discount against the cheapest regular price', () => {
		const deals = activeSales(
			[
				price('fresh', 0.88, { saleUntil: '2026-12-31' }),
				price('fresh', 1.15),
				price('kaufland', 1.1),
				price('billa', 0.5, { saleUntil: '2026-10-01' }),
				price('eshop', 0.4, { saleUntil: '2026-12-31', online: true })
			],
			today
		);
		expect(deals).toHaveLength(1);
		expect(deals[0].entry.storeId).toBe('fresh');
		expect(deals[0].regularPerKg).toBe(1.1);
		expect(deals[0].storeRegularPerKg).toBe(1.15);
		expect(deals[0].discountInStore).toBe(true);
		expect(deals[0].discount).toBeCloseTo(1 - 0.88 / 1.15);
		expect(deals[0].daysLeft).toBe(86);
	});

	it('falls back to the cheapest regular price elsewhere when the shop has none', () => {
		const [deal] = activeSales(
			[price('fresh', 0.88, { saleUntil: '2026-10-06' }), price('kaufland', 1.1)],
			today
		);
		expect(deal.discountInStore).toBe(false);
		expect(deal.discount).toBeCloseTo(0.2);
		expect(deal.daysLeft).toBe(0);
	});
});

describe('unitPrice', () => {
	const entry = (pack: string, packGrams: number, price: number): PriceEntry => ({
		ingredientId: 'x',
		storeId: 'billa',
		product: 'x',
		pack,
		packGrams,
		price,
		date: '2026-09-30'
	});

	it('shows liquids per litre, not per kg of their converted weight', () => {
		expect(unitPrice(entry('1 l', 1030, 1.39))).toEqual({ value: 1.39, unit: 'l' });
		expect(unitPrice(entry('250 ml', 250, 0.5))).toEqual({ value: 2, unit: 'l' });
		expect(unitPrice(entry('500 g', 500, 1))).toEqual({ value: 2, unit: 'kg' });
		expect(unitPrice(entry('1 ks', 240, 1.2))).toEqual({ value: 5, unit: 'kg' });
	});
});

describe('shelfName', () => {
	it('calms names written in capitals and leaves the rest alone', () => {
		expect(shelfName('MRKVA VOĽNÁ')).toBe('Mrkva voľná');
		expect(shelfName('Billa Bio sójový nápoj')).toBe('Billa Bio sójový nápoj');
		expect(shelfName('CHLIEB BEZLEP. 210g')).toBe('Chlieb bezlep. 210g');
		expect(shelfName('CLEVER zemiaky')).toBe('CLEVER zemiaky');
	});
});

describe('recipesOnSale', () => {
	const deal = (ingredientId: string, sale: number, regular: number): SaleDeal => ({
		entry: {
			ingredientId,
			storeId: 'fresh',
			product: ingredientId,
			pack: '1 kg',
			packGrams: 1000,
			price: sale,
			date: '2026-10-01',
			saleUntil: '2026-10-10'
		},
		regularPerKg: regular,
		storeRegularPerKg: null,
		discount: 1 - sale / regular,
		discountInStore: false,
		daysLeft: 4
	});
	const recipe = (id: string, lines: [string, number][]) => ({
		id,
		servings: 2,
		lines: lines.map(([ingredientId, grams]) => ({ ingredientId, grams }))
	});

	it('ranks by how many main ingredients are on sale, ignoring pinches', () => {
		const ranked = recipesOnSale(
			[
				recipe('polievka', [['mrkva', 400]]),
				recipe('salat', [
					['mrkva', 200],
					['kapusta', 300]
				]),
				recipe('kari', [['kmin', 4]])
			],
			[deal('mrkva', 0.7, 1.3), deal('kapusta', 0.5, 0.9), deal('kmin', 10, 30)]
		);
		expect(ranked.map((r) => r.recipe.id)).toEqual(['salat', 'polievka']);
		expect(ranked[0].onSale).toEqual(['mrkva', 'kapusta']);
		expect(ranked[1].saving).toBeCloseTo(0.12);
	});
});

describe('packLeftover', () => {
	it('tells what a whole pack leaves over, when it is worth saying', () => {
		expect(packLeftover({ packs: 1, packGrams: 500 }, 200)).toBe(300);
		expect(packLeftover({ packs: 2, packGrams: 400 }, 790)).toBe(0);
		// Loose produce is weighed: nothing left over.
		expect(packLeftover({ packs: 0.3, packGrams: 1000 }, 300)).toBe(0);
		expect(packLeftover(null, 200)).toBe(0);
	});
});
