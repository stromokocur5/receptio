import { normalizeSearch } from './labels';
import type { Ingredient } from './types';

/**
 * A product's barcode → which ingredient it is and how much is in the pack, for the pantry.
 * Products come from Open Food Facts (open data, no key); only the barcode leaves the phone.
 */

export interface Product {
	code: string;
	name: string;
	/** Grams in the pack (ml counted as grams), when the label says. */
	grams: number | null;
	/** Category words, e.g. "chickpeas", "legumes". */
	categories: string[];
}

/** EAN-8, UPC-A, EAN-13 and GTIN-14. */
export const isBarcode = (text: string) => /^\d{8}$|^\d{12,14}$/.test(text.trim());

/** "400 g", "0,5 kg", "1 l", "250ml", "2 x 125 g" → grams. */
export function parseQuantity(text: string | undefined | null): number | null {
	if (!text) return null;
	const m = /(?:(\d+)\s*[x×]\s*)?(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|cl|dl)\b/i.exec(text);
	if (!m) return null;
	const count = m[1] ? Number(m[1]) : 1;
	const value = Number(m[2].replace(',', '.'));
	const unit = m[3].toLowerCase();
	const factor = { kg: 1000, g: 1, l: 1000, dl: 100, cl: 10, ml: 1 }[unit] ?? 1;
	const grams = Math.round(count * value * factor);
	return grams > 0 && grams <= 50_000 ? grams : null;
}

export async function lookupProduct(code: string, fetcher = fetch): Promise<Product | null> {
	const fields =
		'product_name,product_name_sk,product_name_cs,generic_name,quantity,categories_tags';
	const res = await fetcher(
		`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${fields}`
	);
	if (res.status === 404) return null;
	if (!res.ok) throw new Error(`Open Food Facts: ${res.status}`);
	const data = (await res.json()) as { status?: number; product?: Record<string, unknown> };
	const p = data.product;
	if (!p || data.status === 0) return null;
	const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
	const name =
		text(p.product_name_sk) ||
		text(p.product_name_cs) ||
		text(p.product_name) ||
		text(p.generic_name);
	return {
		code,
		name: name.slice(0, 120),
		grams: parseQuantity(text(p.quantity)),
		categories: Array.isArray(p.categories_tags)
			? p.categories_tags
					.filter((t): t is string => typeof t === 'string')
					.map((t) => t.replace(/^[a-z]{2}:/, '').replace(/-/g, ' '))
					.slice(0, 30)
			: []
	};
}

const words = (text: string) =>
	normalizeSearch(text)
		.split(/[^a-z0-9]+/)
		.filter((w) => w.length >= 3);

/**
 * The ingredients the product most likely is, best first: the more of an ingredient's name (or
 * an alias) shows up in the product's name, the better; its categories count a little.
 */
export function matchIngredients(
	product: Pick<Product, 'name' | 'categories'>,
	ingredients: Pick<Ingredient, 'id' | 'name' | 'aliases'>[],
	max = 5
): string[] {
	const nameWords = words(product.name);
	const categoryWords = words(product.categories.join(' '));
	// Slovak words bend ("cícer", "cíceru"): a shared start of 4+ letters counts.
	const hit = (w: string, list: string[]) =>
		list.some(
			(x) => x === w || (w.length >= 4 && x.length >= 4 && x.slice(0, 4) === w.slice(0, 4))
		);
	const scored = ingredients.flatMap((ingredient) => {
		const names = [ingredient.name.split(' (')[0], ...(ingredient.aliases ?? [])];
		let best = 0;
		for (const n of names) {
			const ws = words(n);
			if (!ws.length) continue;
			const inName = ws.filter((w) => hit(w, nameWords)).length;
			const inCategory = ws.filter((w) => hit(w, categoryWords)).length;
			// All of the ingredient's words found beats some of them; shorter names are more general.
			const score = (inName / ws.length) * 10 + inName + inCategory * 0.5 - ws.length * 0.01;
			if (inName + inCategory > 0) best = Math.max(best, score);
		}
		return best > 0 ? [{ id: ingredient.id, score: best }] : [];
	});
	return scored
		.sort((a, b) => b.score - a.score)
		.slice(0, max)
		.map((s) => s.id);
}
