/**
 * Reads today's price of the e-shop products listed in content/eshops.yaml from each product
 * page (schema.org data, or the shop's own price element) and writes content/prices-eshops.yaml. Run with `pnpm prices:eshops`.
 *
 * A product that is sold out or can't be read keeps its last known price and date, so it ages
 * like any other price instead of disappearing.
 */
import { execFile } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { parse, stringify } from 'yaml';

/** grizly.sk asks for a crawl delay of 5 s in robots.txt; the same pause is used everywhere. */
const PAUSE_MS = 6000;
const REQUEST_TIMEOUT_S = 30;
const USER_AGENT = 'receptio-price-sync (+https://receptio.kohut.xyz)';
const OUT = 'content/prices-eshops.yaml';

interface Mapping {
	ingredient: string;
	store: string;
	pack: string;
	url: string;
}

interface Entry {
	ingredient: string;
	store: string;
	product: string;
	pack: string;
	price: number;
	date: string;
	url: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

/** Every schema.org node on the page, whether listed alone, in an array or in an @graph. */
function jsonLdNodes(html: string): Record<string, unknown>[] {
	const nodes: Record<string, unknown>[] = [];
	const visit = (value: unknown) => {
		if (Array.isArray(value)) value.forEach(visit);
		else if (isRecord(value)) {
			nodes.push(value);
			visit(value['@graph']);
		}
	};
	for (const match of html.matchAll(
		/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
	)) {
		try {
			visit(JSON.parse(match[1]));
		} catch {
			// A broken block on the page; the product may still be in another one.
		}
	}
	return nodes;
}

/**
 * Fetches a page with curl: grizly.sk answers Node's own fetch with 403 whatever it sends,
 * while the same request from curl – same user agent, same pause – is served.
 */
async function getPage(url: string): Promise<{ status: number; html: string }> {
	const { stdout } = await promisify(execFile)(
		'curl',
		['-sS', '--max-time', String(REQUEST_TIMEOUT_S), '-A', USER_AGENT, '-w', '\n%{http_code}', url],
		{ maxBuffer: 20 * 1024 * 1024 }
	);
	const split = stdout.lastIndexOf('\n');
	return { status: Number(stdout.slice(split + 1)), html: stdout.slice(0, split) };
}

type Product = { name: string; price: number };

const text = (html: string) =>
	html
		.replace(/<[^>]+>/g, ' ')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();

/** The page's main heading, or its title without the shop's name. */
const heading = (html: string) =>
	text(/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] ?? '') ||
	text(/<title>([^<|]*)/i.exec(html)?.[1] ?? '');

/** schema.org JSON-LD: the usual way a shop tells search engines its price. */
function fromJsonLd(html: string): Product | string | undefined {
	const product = jsonLdNodes(html).find((n) => n['@type'] === 'Product');
	if (!product) return undefined;
	const offers = Array.isArray(product.offers) ? product.offers[0] : product.offers;
	if (!isRecord(offers)) return 'product has no offer';
	if (offers.priceCurrency !== 'EUR') return `price is in ${String(offers.priceCurrency)}`;
	if (typeof offers.availability === 'string' && !offers.availability.endsWith('/InStock')) {
		return 'not in stock';
	}
	const name = typeof product.name === 'string' ? text(product.name) : '';
	const brand =
		isRecord(product.brand) && typeof product.brand.name === 'string' ? product.brand.name : '';
	return {
		name: brand && !name.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${name}` : name,
		price: Number(offers.price)
	};
}

/** schema.org microdata; only when the page states one price (variants list several). */
function fromMicrodata(html: string): Product | string | undefined {
	const prices = new Set(
		[...html.matchAll(/itemprop=["']price["'][^>]*content=["']([^"']+)["']/gi)].map((m) => m[1])
	);
	if (prices.size === 0) return undefined;
	if (prices.size > 1) return 'several prices on the page (variants)';
	if (!/itemprop=["']priceCurrency["'][^>]*content=["']EUR["']/i.test(html))
		return 'price is not in EUR';
	const availability = /itemprop=["']availability["'][^>]*href=["']([^"']+)["']/i.exec(html)?.[1];
	if (availability && !availability.endsWith('/InStock')) return 'not in stock';
	return { name: heading(html), price: Number([...prices][0]) };
}

/** foodland.sk has no structured data; the product's own price sits in a fixed element. */
function fromPriceElement(html: string): Product | undefined {
	const match = /id=["']product-detail-price-value["'][^>]*>\s*([\d\s]+(?:,\d+)?)\s*€/.exec(html);
	if (!match) return undefined;
	return { name: heading(html), price: Number(match[1].replace(/\s/g, '').replace(',', '.')) };
}

/** Name and price of the product on the page, or why it can't be used. */
export function readProduct(html: string): Product | string {
	const found = fromJsonLd(html) ?? fromMicrodata(html) ?? fromPriceElement(html);
	if (found === undefined) return 'no price data on the page';
	if (typeof found === 'string') return found;
	if (!(found.price > 0)) return 'no price';
	if (!found.name) return 'product has no name';
	return found;
}

/** Kept apart from price-history.csv, which the daily sync rewrites for its own day. */
const HISTORY_FILE = 'content/price-history-eshops.csv';
const HISTORY_HEADER = 'date,ingredient,store,price,pack,sale_until,product';
const csvField = (value: string) =>
	/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

/** Adds today's prices to the history; re-running the same day replaces that day's rows. */
function appendHistory(fresh: Entry[], today: string) {
	const kept = existsSync(HISTORY_FILE)
		? readFileSync(HISTORY_FILE, 'utf8')
				.split('\n')
				.filter((line) => line && line !== HISTORY_HEADER && !line.startsWith(`${today},`))
		: [];
	const rows = fresh.map((e) =>
		[e.date, e.ingredient, e.store, e.price, e.pack, '', e.product]
			.map((v) => csvField(String(v)))
			.join(',')
	);
	writeFileSync(HISTORY_FILE, [HISTORY_HEADER, ...kept, ...rows].join('\n') + '\n');
}

async function main() {
	const mappings = parse(readFileSync('content/eshops.yaml', 'utf8')) as Mapping[];
	const previous: Entry[] = existsSync(OUT)
		? ((parse(readFileSync(OUT, 'utf8')) as { entries: Entry[] | null }).entries ?? [])
		: [];
	const previousByUrl = new Map(previous.map((e) => [e.url, e]));
	const today = new Date().toISOString().slice(0, 10);

	// `pnpm prices:eshops foodland` re-reads one shop and leaves the rest as they are.
	const onlyStores = process.argv.slice(2);
	const wanted = mappings.filter((m) => !onlyStores.length || onlyStores.includes(m.store));

	// Shops are read side by side, each at its own unhurried pace.
	const read = new Map<Mapping, Product | string>();
	const stores = [...new Set(wanted.map((m) => m.store))];
	await Promise.all(
		stores.map(async (store) => {
			const products = wanted.filter((m) => m.store === store);
			for (const [index, mapping] of products.entries()) {
				if (index > 0) await sleep(PAUSE_MS);
				try {
					const page = await getPage(mapping.url);
					read.set(mapping, page.status === 200 ? readProduct(page.html) : `HTTP ${page.status}`);
				} catch (err) {
					read.set(mapping, err instanceof Error ? err.message : String(err));
				}
			}
		})
	);

	const entries: Entry[] = [];
	let fresh = 0;
	for (const mapping of mappings) {
		const kept = previousByUrl.get(mapping.url);
		const result = read.get(mapping);
		if (result === undefined) {
			if (kept) entries.push(kept);
			continue;
		}
		if (typeof result === 'string') {
			console.warn(
				`${mapping.url}: ${result}${kept ? ` – keeping the price from ${kept.date}` : ''}`
			);
			if (kept) entries.push({ ...kept, ingredient: mapping.ingredient, pack: mapping.pack });
			continue;
		}
		fresh++;
		entries.push({
			ingredient: mapping.ingredient,
			store: mapping.store,
			// Most names already end with the pack size; say it once.
			product: /\d\s*(g|kg|ml|l)\b/i.test(result.name)
				? result.name
				: `${result.name} ${mapping.pack}`,
			pack: mapping.pack,
			price: result.price,
			date: today,
			url: mapping.url
		});
	}

	// An outage shouldn't replace good data with a file of stale leftovers.
	if (fresh < wanted.length / 2) {
		throw new Error(`Only ${fresh} of ${wanted.length} products could be read – nothing written.`);
	}
	writeFileSync(
		OUT,
		'# GENEROVANÉ – neupravuj ručne. Ceny zo stránok produktov v e-shopoch, obnov cez\n' +
			'# `pnpm prices:eshops`; zoznam produktov je v eshops.yaml.\n' +
			stringify({ entries }, { lineWidth: 0 })
	);
	appendHistory(
		entries.filter((e) => e.date === today),
		today
	);
	console.log(`${fresh} of ${wanted.length} prices read, ${entries.length} written to ${OUT}.`);
}

if (import.meta.main) await main();
