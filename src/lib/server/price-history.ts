import { parseAmount, toGrams } from '$lib/amounts';
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
