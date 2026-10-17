/**
 * Reads the food part of Košík's online catalogue (kosik.sk – delivered groceries, Metro's range
 * included) and writes:
 * - content/katalog-kosik-sk.csv: every food product with today's price, for mapping more later,
 * - content/prices-kosik-sk.yaml: prices of the ingredients mapped in content/kosik-sk.yaml,
 * - today's rows in content/price-history-kosik-sk.csv.
 * Run with `pnpm prices:kosik`.
 *
 * A product on sale shows its regular price as `recommendedPrice` and the end of the sale as
 * "Akcia platí do 20. 10."; multi-buy prices (`cumulativePrices`) aren't used.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { format, resolveConfig } from 'prettier';
import { parse, stringify } from 'yaml';

const SITE = 'https://www.kosik.sk';
const PAGE_SIZE = 30;
const PAUSE_MS = 700;
const REQUEST_TIMEOUT_MS = 30_000;
const PRICES_FILE = 'content/prices-kosik-sk.yaml';
const CATALOG_FILE = 'content/katalog-kosik-sk.csv';
const HISTORY_FILE = 'content/price-history-kosik-sk.csv';
const HISTORY_HEADER = 'date,ingredient,store,price,pack,sale_until,product';
/** Top categories of the menu that are food. */
const FOOD = new Set([
	'c2784-pekaren-a-cukraren',
	'c2894-ovocie-a-zelenina',
	'c3338-udeniny-a-lahodky',
	'c3501-mliecne-a-chladene',
	'c3708-mrazene',
	'c3820-trvanlive',
	'c4457-napoje',
	'c5045-zdravie-a-zivotny-styl'
]);

export interface KosikProduct {
	id: number;
	name: string;
	url: string;
	price: number;
	recommendedPrice: number;
	unit: string;
	productQuantity: { value: number; unit: string } | null;
	actionLabel?: string | null;
	mainCategory?: { name: string } | null;
}

interface MenuItem {
	name: string;
	url: string;
	children?: MenuItem[];
	[key: string]: unknown;
}

interface Mapping {
	ingredient: string;
	include: string;
	exclude?: string;
	/** The product's main category must match, e.g. fresh herbs rather than frozen ones. */
	category?: string;
}

interface Entry {
	ingredient: string;
	store: 'kosik';
	product: string;
	pack: string;
	price: number;
	date: string;
	sale_until?: string;
	url: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const normalize = (text: string) =>
	text
		.toLowerCase()
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.replace(/\s+/g, ' ')
		.trim();

async function api<T>(path: string, body?: unknown): Promise<T> {
	const res = await fetch(`${SITE}/api/front/${path}`, {
		method: body ? 'POST' : 'GET',
		headers: { accept: 'application/json', 'content-type': 'application/json' },
		body: body ? JSON.stringify(body) : undefined,
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
	});
	if (!res.ok) throw new Error(`${SITE}/api/front/${path}: HTTP ${res.status}`);
	return (await res.json()) as T;
}

/** Second-level categories of the food part of the menu, e.g. "c2899-zelenina". */
export function foodCategories(menu: unknown): string[] {
	const slugs: string[] = [];
	const visit = (value: unknown, top: string | null, depth: number) => {
		if (Array.isArray(value)) return value.forEach((v) => visit(v, top, depth));
		if (typeof value !== 'object' || value === null) return;
		const item = value as MenuItem;
		const slug = typeof item.url === 'string' ? item.url.replace(/^\//, '') : null;
		if (slug && typeof item.name === 'string') {
			if (depth === 0) top = slug;
			else if (depth === 1 && top && FOOD.has(top)) slugs.push(slug);
			for (const v of Object.values(item)) visit(v, top, depth + 1);
			return;
		}
		for (const v of Object.values(item)) visit(v, top, depth);
	};
	visit(menu, null, 0);
	return [...new Set(slugs)];
}

async function fetchCategory(slug: string): Promise<KosikProduct[]> {
	const first = await api<{ products?: { items: KosikProduct[]; cursor?: string | null } }>(
		`page/products/flexible?vendor=1&slug=${encodeURIComponent(slug)}&limit=${PAGE_SIZE}&platform=web`
	);
	const products = [...(first.products?.items ?? [])];
	let cursor = first.products?.cursor;
	while (cursor) {
		await sleep(PAUSE_MS);
		const more = await api<{ products: KosikProduct[]; cursor?: string | null }>('products/more', {
			cursor,
			limit: PAGE_SIZE
		});
		products.push(...more.products);
		cursor = more.products.length ? more.cursor : null;
	}
	return products;
}

async function fetchCatalog(): Promise<KosikProduct[]> {
	const categories = foodCategories(await api<unknown>('menu/main'));
	if (categories.length < 20) throw new Error(`Len ${categories.length} kategórií v menu.`);
	const byId = new Map<number, KosikProduct>();
	for (const slug of categories) {
		await sleep(PAUSE_MS);
		for (const product of await fetchCategory(slug)) byId.set(product.id, product);
	}
	return [...byId.values()];
}

/** Pack as recipes write it: "1 kg", "500 g", "1 l", "1 ks". */
export function packOf(product: KosikProduct): string | null {
	if (product.unit === 'kg') return '1 kg';
	const quantity = product.productQuantity;
	if (!quantity || !(quantity.value > 0)) return null;
	const unit = quantity.unit.toLowerCase();
	const amount = quantity.value;
	const decimal = String(amount).replace('.', ',');
	if (unit === 'ks' || unit === 'kg' || unit === 'l') return `${decimal} ${unit}`;
	if (unit !== 'g' && unit !== 'ml') return null;
	if (amount >= 1000 && amount % 100 === 0) {
		return `${String(amount / 1000).replace('.', ',')} ${unit === 'g' ? 'kg' : 'l'}`;
	}
	return `${decimal} ${unit}`;
}

/** "Akcia platí do 20. 10." as a date: the next 20. 10. from today on. */
export function saleUntil(label: string | null | undefined, today: string): string | undefined {
	const match = /do (\d{1,2})\. ?(\d{1,2})\./.exec(label ?? '');
	if (!match) return undefined;
	const year = Number(today.slice(0, 4));
	const date = (y: number) => `${y}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
	return date(year) >= today ? date(year) : date(year + 1);
}

// Products sold by weight come priced to a fraction of a cent (1.5225 for 870 g).
const cents = (euros: number) => Math.round(euros * 100) / 100;

/** Regular price and, while a sale runs, the sale price. */
export function prices(product: KosikProduct, today: string) {
	const until =
		product.recommendedPrice > product.price ? saleUntil(product.actionLabel, today) : undefined;
	return {
		regular: cents(until ? product.recommendedPrice : product.price),
		promo: until ? { price: cents(product.price), until } : undefined
	};
}

const csvField = (value: string) =>
	/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
const csvRow = (values: (string | number)[]) => values.map((v) => csvField(String(v))).join(',');

async function writeFormatted(file: string, text: string) {
	// Written the way Prettier leaves it, so `pnpm lint` passes on the synced commit.
	writeFileSync(file, await format(text, { ...(await resolveConfig(file)), filepath: file }));
}

const productName = (product: KosikProduct) => product.name.replace(/\s+/g, ' ').trim();

async function main() {
	const today = new Date().toISOString().slice(0, 10);
	const products = (await fetchCatalog()).filter((p) => p.price > 0);
	if (products.length < 2000) {
		throw new Error(`Len ${products.length} potravín v katalógu – nič nezapisujem.`);
	}

	writeFileSync(
		CATALOG_FILE,
		[
			csvRow(['id', 'product', 'category', 'pack', 'price', 'sale_price', 'sale_until']),
			...products
				.map((p) => {
					const { regular, promo } = prices(p, today);
					return [
						p.id,
						productName(p),
						p.mainCategory?.name ?? '',
						packOf(p) ?? '',
						regular,
						promo?.price ?? '',
						promo?.until ?? ''
					];
				})
				.sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'sk'))
				.map(csvRow)
		].join('\n') + '\n'
	);

	const mappings = parse(readFileSync('content/kosik-sk.yaml', 'utf8')) as Mapping[];
	const ingredients = parse(readFileSync('content/ingredients.yaml', 'utf8')) as {
		id: string;
		units?: Record<string, number>;
	}[];
	const byPiece = new Set(ingredients.filter((i) => i.units?.ks).map((i) => i.id));
	const entries: Entry[] = [];
	for (const mapping of mappings) {
		const include = new RegExp(mapping.include);
		const exclude = mapping.exclude ? new RegExp(mapping.exclude) : null;
		const category = mapping.category ? new RegExp(mapping.category) : null;
		const before = entries.length;
		for (const product of products) {
			const name = normalize(productName(product));
			if (!include.test(name) || exclude?.test(name)) continue;
			if (category && !category.test(normalize(product.mainCategory?.name ?? ''))) continue;
			const pack = packOf(product);
			// "1 ks" only means something when the ingredient knows what one piece weighs.
			if (!pack || (pack.endsWith(' ks') && !byPiece.has(mapping.ingredient))) continue;
			const { regular, promo } = prices(product, today);
			const base = {
				ingredient: mapping.ingredient,
				store: 'kosik' as const,
				product: productName(product),
				pack,
				date: today,
				url: `${SITE}${product.url}`
			};
			entries.push({ ...base, price: regular });
			if (promo) entries.push({ ...base, price: promo.price, sale_until: promo.until });
		}
		if (entries.length === before) {
			console.warn(`${mapping.ingredient}: v katalógu nič nezodpovedá ${mapping.include}`);
		}
	}

	// A mapped product that's sold out drops out of the catalogue: keep its last regular price,
	// which then ages like any other.
	const previous = existsSync(PRICES_FILE)
		? ((parse(readFileSync(PRICES_FILE, 'utf8')) as { entries?: Entry[] | null }).entries ?? [])
		: [];
	const fresh = new Set(entries.map((e) => `${e.ingredient}|${e.url}`));
	const known = new Set(mappings.map((m) => m.ingredient));
	const kept = previous.filter(
		(e) => !e.sale_until && known.has(e.ingredient) && !fresh.has(`${e.ingredient}|${e.url}`)
	);
	const all = [...entries, ...kept].sort(
		(a, b) =>
			a.ingredient.localeCompare(b.ingredient) ||
			a.product.localeCompare(b.product, 'sk') ||
			(a.sale_until ? 1 : 0) - (b.sale_until ? 1 : 0)
	);
	await writeFormatted(
		PRICES_FILE,
		'# GENEROVANÉ – neupravuj ručne. Ceny z katalógu kosik.sk, obnov cez `pnpm prices:kosik`;\n' +
			'# mapovanie je v kosik-sk.yaml.\n' +
			stringify({ entries: all }, { lineWidth: 0 })
	);

	const history = existsSync(HISTORY_FILE)
		? readFileSync(HISTORY_FILE, 'utf8')
				.split('\n')
				.filter((line) => line && line !== HISTORY_HEADER && !line.startsWith(`${today},`))
		: [];
	const todayRows = entries.map((e) =>
		csvRow([e.date, e.ingredient, e.store, e.price, e.pack, e.sale_until ?? '', e.product])
	);
	writeFileSync(HISTORY_FILE, [HISTORY_HEADER, ...history, ...todayRows].join('\n') + '\n');

	const sales = entries.filter((e) => e.sale_until).length;
	console.log(
		`${products.length} potravín v katalógu, ${entries.length} cien pre ${new Set(entries.map((e) => e.ingredient)).size} surovín (${sales} v akcii).`
	);
}

if (import.meta.main) await main();
