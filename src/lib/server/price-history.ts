import { parse as parseYaml } from 'yaml';
import { parseAmount, toGrams } from '$lib/amounts';
import { basketIndex, type Basket, type BasketDay } from '$lib/basket';
import { compressHistory, parseCsv, type HistoryRow, type PriceHistory } from '$lib/price-history';
import { getContent } from './content';

const HEADER = 'date,ingredient,store,price,pack,sale_until,product';

/** Shop prices (daily) and e-shop prices (weekly) as they were recorded. Only read at build. */
const rawFiles: Record<string, string> = import.meta.glob('/content/price-history*.csv', {
	query: '?raw',
	import: 'default',
	eager: true
});

/** The raw CSV rows of every history file, header first – the published open-data file. */
export function historyCsvRows(): string[][] {
	const rows = Object.values(rawFiles).flatMap((text) => {
		const [header, ...body] = parseCsv(text);
		if (header?.join(',') !== HEADER) throw new Error(`price history: unexpected header ${header}`);
		return body;
	});
	return [HEADER.split(','), ...rows.toSorted((a, b) => a[0].localeCompare(b[0]))];
}

let cached: PriceHistory | undefined;

export function getPriceHistory(): PriceHistory {
	if (cached) return cached;
	const { ingredients } = getContent();
	const byId = new Map(ingredients.map((i) => [i.id, i]));
	const rows = historyCsvRows()
		.slice(1)
		.flatMap(([date, ingredientId, storeId, price, pack, saleUntil, product]): HistoryRow[] => {
			// Old rows may name an ingredient that was renamed since; they're skipped, not fatal.
			const ingredient = byId.get(ingredientId);
			const amount = parseAmount(pack);
			if (!ingredient || !amount.amount || !Number(price)) return [];
			return [
				{
					date,
					ingredientId,
					storeId,
					product,
					pack,
					packGrams: toGrams(amount.amount, amount.unit, ingredient),
					price: Number(price),
					...(saleUntil && { saleUntil })
				}
			];
		});
	cached = compressHistory(rows);
	return cached;
}

const rawBasket = import.meta.glob('/content/kosik.yaml', {
	query: '?raw',
	import: 'default',
	eager: true
})['/content/kosik.yaml'] as string;

/** The fixed weekly basket of content/kosik.yaml, checked against the ingredients. */
export function getBasket(): Basket {
	const raw = parseYaml(rawBasket) as {
		version?: unknown;
		items?: { ingredient?: unknown; grams?: unknown }[];
	};
	const { ingredients } = getContent();
	const known = new Set(ingredients.map((i) => i.id));
	if (typeof raw.version !== 'number' || !Array.isArray(raw.items) || !raw.items.length) {
		throw new Error('content/kosik.yaml: chýba version alebo items');
	}
	return {
		version: raw.version,
		items: raw.items.map((item, index) => {
			const id = item.ingredient;
			if (typeof id !== 'string' || !known.has(id)) {
				throw new Error(`content/kosik.yaml items[${index}]: neznáma surovina "${id}"`);
			}
			if (typeof item.grams !== 'number' || item.grams <= 0) {
				throw new Error(`content/kosik.yaml items[${index}]: grams musí byť kladné číslo`);
			}
			return { ingredientId: id, grams: item.grams };
		})
	};
}

let cachedIndex: BasketDay[] | undefined;

/** The basket's price day by day, in the shops you walk into. */
export function getBasketIndex(): BasketDay[] {
	cachedIndex ??= basketIndex(
		getPriceHistory(),
		getBasket(),
		getContent()
			.stores.filter((s) => !s.online)
			.map((s) => s.id)
	);
	return cachedIndex;
}
