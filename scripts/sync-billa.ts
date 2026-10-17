/**
 * Reads Billa's online catalogue (billa.sk/produkty – mostly what's in the current and coming
 * leaflets) and writes:
 * - content/katalog-billa.csv: every food product with today's price, for mapping more later,
 * - content/prices-billa.yaml: prices of the ingredients mapped in content/billa.yaml,
 * - today's rows in content/price-history-billa.csv.
 * Run with `pnpm prices:billa`.
 *
 * The catalogue has no promo dates, only the leaflet week ("KW 43/2026"). A Billa leaflet runs
 * from Wednesday to the next Tuesday, so a promo counts only while one of its weeks is on.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { format, resolveConfig } from 'prettier';
import { parse, stringify } from 'yaml';

const API = 'https://www.billa.sk/api/product-discovery/products';
const PAGE_SIZE = 500;
const PAUSE_MS = 2000;
const REQUEST_TIMEOUT_MS = 30_000;
const PRICES_FILE = 'content/prices-billa.yaml';
const CATALOG_FILE = 'content/katalog-billa.csv';
const HISTORY_FILE = 'content/price-history-billa.csv';
const HISTORY_HEADER = 'date,ingredient,store,price,pack,sale_until,product';

/** Top categories that aren't food. */
const NOT_FOOD = new Set([
	'washing-detergents-1467',
	'air-fresheners-3073',
	'cleaning-1469',
	'body-1541',
	'oral-1542',
	'hair-1540',
	'toilet-paper-1597',
	'napkins-1600',
	'kitchen-towels-1598',
	'tissues-1599',
	'cat-food-1612',
	'dog-food-1611',
	'baby-diapers-1663'
]);
const LEAFLET = 'leaflet-99000000';

interface Category {
	slug: string;
	name: string;
}

export interface BillaProduct {
	sku: string;
	name: string;
	amount: string;
	volumeLabelShort: string;
	weightArticle: boolean;
	slug: string;
	parentCategories: Category[][];
	price: {
		crossed?: number;
		regular: { value: number; tags?: string[]; promotionQuantity?: number };
	};
}

interface Mapping {
	ingredient: string;
	include: string;
	exclude?: string;
	/** Category slugs (any level) the product must be in. */
	categories?: string[];
}

interface Entry {
	ingredient: string;
	store: 'billa';
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

async function fetchPage(page: number): Promise<{ total: number; results: BillaProduct[] }> {
	const res = await fetch(`${API}?pageSize=${PAGE_SIZE}&page=${page}`, {
		headers: { accept: 'application/json' },
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
	});
	if (!res.ok) throw new Error(`${API} page ${page}: HTTP ${res.status}`);
	return (await res.json()) as { total: number; results: BillaProduct[] };
}

async function fetchCatalog(): Promise<BillaProduct[]> {
	const products: BillaProduct[] = [];
	for (let page = 0; ; page++) {
		const body = await fetchPage(page);
		products.push(...body.results);
		if (products.length >= body.total || body.results.length === 0) return products;
		await sleep(PAUSE_MS);
	}
}

/** Monday of ISO week `week` in `year`, as a UTC date. */
function isoWeekMonday(year: number, week: number): Date {
	const jan4 = new Date(Date.UTC(year, 0, 4));
	const monday = new Date(jan4);
	monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + (week - 1) * 7);
	return monday;
}

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

/** Wednesday to Tuesday of the leaflet "KW 43/2026" (slug kw-432026). */
export function leafletWeek(slug: string): { from: string; to: string } | null {
	const match = /^kw-(\d{1,2})(\d{4})$/.exec(slug);
	if (!match) return null;
	const monday = isoWeekMonday(Number(match[2]), Number(match[1]));
	const from = new Date(monday);
	from.setUTCDate(monday.getUTCDate() + 2);
	const to = new Date(monday);
	to.setUTCDate(monday.getUTCDate() + 8);
	return { from: isoDate(from), to: isoDate(to) };
}

/** The last day of the leaflet promo running today, following back-to-back weeks. */
function promoUntil(product: BillaProduct, today: string): string | undefined {
	const weeks = product.parentCategories
		.filter((path) => path[0]?.slug === LEAFLET)
		.map((path) => (path[1] ? leafletWeek(path[1].slug) : null))
		.filter((w) => w !== null)
		.sort((a, b) => a.from.localeCompare(b.from));
	let until: string | undefined;
	for (const week of weeks) {
		if (week.from <= today && today <= week.to) until = week.to;
		else if (until && week.from <= nextDay(until)) until = week.to;
	}
	return until;
}

function nextDay(date: string): string {
	const d = new Date(`${date}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + 1);
	return isoDate(d);
}

/** Pack as recipes write it: "1 kg", "500 g", "1 l", "1 ks". */
export function packOf(product: BillaProduct): string | null {
	const unit = product.volumeLabelShort.toLowerCase();
	const amount = Number(product.amount.replace(',', '.'));
	if (!(amount > 0)) return null;
	const decimal = String(amount).replace('.', ',');
	if (unit === 'ks') return `${decimal} ks`;
	if (unit === 'kg') return `${decimal} kg`;
	if (unit === 'l') return `${decimal} l`;
	if (unit !== 'g' && unit !== 'ml') return null;
	if (amount >= 1000 && amount % 100 === 0) return `${amount / 1000} ${unit === 'g' ? 'kg' : 'l'}`;
	return `${amount} ${unit}`;
}

const categorySlugs = (product: BillaProduct) =>
	new Set(product.parentCategories.flat().map((c) => c.slug));

const isFood = (product: BillaProduct) =>
	![...categorySlugs(product)].some((slug) => NOT_FOOD.has(slug));

const euros = (cents: number) => Math.round(cents) / 100;

/** Regular shelf price and, while a leaflet runs, the promo price. Multi-buy deals don't count. */
export function prices(product: BillaProduct, today: string) {
	const { crossed, regular } = product.price;
	const multiBuy = regular.tags?.includes('pt-multi') || (regular.promotionQuantity ?? 1) > 1;
	const discounted = crossed !== undefined && crossed > regular.value;
	const until = discounted && !multiBuy ? promoUntil(product, today) : undefined;
	return {
		// Outside its leaflet week a product is sold at the crossed-out price.
		regular: euros(discounted ? crossed : regular.value),
		promo: until ? { price: euros(regular.value), until } : undefined
	};
}

function toEntries(
	mapping: Mapping,
	products: BillaProduct[],
	today: string,
	soldByPiece: boolean
): Entry[] {
	const include = new RegExp(mapping.include);
	const exclude = mapping.exclude ? new RegExp(mapping.exclude) : null;
	const entries: Entry[] = [];
	for (const product of products) {
		const name = normalize(product.name);
		if (!include.test(name) || exclude?.test(name)) continue;
		if (mapping.categories && !mapping.categories.some((c) => categorySlugs(product).has(c))) {
			continue;
		}
		const pack = packOf(product);
		// "1 ks" only means something when the ingredient knows what one piece weighs.
		if (!pack || (pack.endsWith(' ks') && !soldByPiece)) continue;
		const { regular, promo } = prices(product, today);
		const base = {
			ingredient: mapping.ingredient,
			store: 'billa' as const,
			product: product.name.replace(/\s+/g, ' ').trim(),
			pack,
			date: today,
			url: `https://www.billa.sk/produkty/${product.slug}`
		};
		entries.push({ ...base, price: regular });
		if (promo) entries.push({ ...base, price: promo.price, sale_until: promo.until });
	}
	return entries;
}

const csvField = (value: string) =>
	/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
const csvRow = (values: (string | number)[]) => values.map((v) => csvField(String(v))).join(',');

async function writeFormatted(file: string, text: string) {
	// Written the way Prettier leaves it, so `pnpm lint` passes on the synced commit.
	writeFileSync(file, await format(text, { ...(await resolveConfig(file)), filepath: file }));
}

async function main() {
	const today = new Date().toISOString().slice(0, 10);
	const products = (await fetchCatalog()).filter(isFood);
	if (products.length < 500) {
		throw new Error(`Len ${products.length} potravín v katalógu – nič nezapisujem.`);
	}
	const previous = existsSync(PRICES_FILE)
		? ((parse(readFileSync(PRICES_FILE, 'utf8')) as { entries?: Entry[] | null }).entries ?? [])
		: [];

	const catalog = products
		.map((p) => {
			const { regular, promo } = prices(p, today);
			const category = p.parentCategories.find((path) => path[0]?.slug !== LEAFLET);
			return [
				p.sku,
				p.name.replace(/\s+/g, ' ').trim(),
				category?.map((c) => c.name).join(' / ') ?? '',
				packOf(p) ?? '',
				regular,
				promo?.price ?? '',
				promo?.until ?? ''
			];
		})
		.sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'sk'));
	writeFileSync(
		CATALOG_FILE,
		[
			csvRow(['sku', 'product', 'category', 'pack', 'price', 'sale_price', 'sale_until']),
			...catalog.map(csvRow)
		].join('\n') + '\n'
	);

	const mappings = parse(readFileSync('content/billa.yaml', 'utf8')) as Mapping[];
	const ingredients = parse(readFileSync('content/ingredients.yaml', 'utf8')) as {
		id: string;
		units?: Record<string, number>;
	}[];
	const byPiece = new Set(ingredients.filter((i) => i.units?.ks).map((i) => i.id));
	const entries = mappings.flatMap((m) => {
		const found = toEntries(m, products, today, byPiece.has(m.ingredient));
		if (!found.length) console.warn(`${m.ingredient}: v katalógu nič nezodpovedá ${m.include}`);
		return found;
	});
	// The catalogue follows the leaflets, so a mapped product may be missing this week: keep its
	// last regular price, which then ages like any other.
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
		'# GENEROVANÉ – neupravuj ručne. Ceny z katalógu billa.sk, obnov cez `pnpm prices:billa`;\n' +
			'# mapovanie je v billa.yaml.\n' +
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
