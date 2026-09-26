/**
 * Pulls today's prices from cenyslovensko.sk (the Ministry of Finance price comparison, fed
 * daily by the chains) for the ingredients mapped in content/cenyslovensko.yaml, and writes
 * content/prices-cenyslovensko.yaml. Run with `pnpm prices:sync`.
 *
 * Per chain and ingredient it keeps the cheapest product per kg: the regular price most
 * branches charge, plus the promo price when most branches run the same promo.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parse, stringify } from 'yaml';

const API = 'https://api.cenyslovensko.sk/api';
const PAGE_SIZE = 100;
/** Be gentle with a public service: one request at a time, with a pause. */
const PAUSE_MS = 1500;
/** A price under 40 % of the median across chains is treated as a data error. */
const SUSPICIOUS_BELOW = 0.4;

const STORE_BY_COMPANY: Record<string, string> = {
	'31321828': 'tesco',
	'31347037': 'billa',
	'50020188': 'terno',
	'35793783': 'lidl',
	'36183181': 'fresh',
	'35790164': 'kaufland'
};

interface Mapping {
	ingredient: string;
	types: string[];
	include?: string;
	exclude?: string;
}

interface ApiPrice {
	price: number;
	promoPrice?: number | null;
	promoTo?: string | null;
}

interface ApiProduct {
	companyId: string;
	productDetails: {
		productName: string;
		unit: string;
		packageSize: number;
		productUrl: string | null;
	};
	prices: ApiPrice[];
}

interface Entry {
	ingredient: string;
	store: string;
	product: string;
	pack: string;
	price: number;
	date: string;
	sale_until?: string;
	url?: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const normalize = (text: string) =>
	text
		.toLowerCase()
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '');

async function fetchType(typeId: string): Promise<ApiProduct[]> {
	const products: ApiProduct[] = [];
	for (let page = 0; ; page++) {
		const url = `${API}/product-prices/current-day?typeId=${encodeURIComponent(typeId)}&page=${page}&size=${PAGE_SIZE}`;
		const res = await fetch(url, {
			headers: {
				accept: 'application/json',
				'user-agent': 'receptio-price-sync (+https://receptio.kohut.xyz)'
			}
		});
		if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
		const body = (await res.json()) as { count: number; content: ApiProduct[] };
		products.push(...body.content);
		await sleep(PAUSE_MS);
		if (products.length >= body.count || body.content.length === 0) return products;
	}
}

/** Pack size in g or ml. The API's unit is sometimes wrong ("200 kg" cream), so the size in
 * the product name wins when there is one. */
function packSize(product: ApiProduct): { amount: number; unit: 'g' | 'ml' } | null {
	const fromName = /(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l)\b/i.exec(product.productDetails.productName);
	const [size, unit] = fromName
		? [Number(fromName[1].replace(',', '.')), fromName[2].toLowerCase()]
		: [product.productDetails.packageSize, product.productDetails.unit.toLowerCase()];
	if (!(size > 0)) return null;
	if (unit === 'kg') return { amount: size * 1000, unit: 'g' };
	if (unit === 'g') return { amount: size, unit: 'g' };
	if (unit === 'l') return { amount: size * 1000, unit: 'ml' };
	if (unit === 'ml') return { amount: size, unit: 'ml' };
	return null;
}

function formatPack({ amount, unit }: { amount: number; unit: 'g' | 'ml' }): string {
	if (amount >= 1000 && amount % 100 === 0) return `${amount / 1000} ${unit === 'g' ? 'kg' : 'l'}`;
	return `${Math.round(amount)} ${unit}`;
}

function mostCommon<T>(values: T[]): T | undefined {
	const counts = new Map<T, number>();
	for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
	return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
}

function toEntries(mapping: Mapping, products: ApiProduct[], today: string): Entry[] {
	const include = mapping.include ? new RegExp(mapping.include) : null;
	const exclude = mapping.exclude ? new RegExp(mapping.exclude) : null;
	const best = new Map<string, { entry: Entry; perUnit: number }>();
	const keep = (key: string, entry: Entry, perUnit: number) => {
		const current = best.get(key);
		if (!current || perUnit < current.perUnit) best.set(key, { entry, perUnit });
	};

	for (const product of products) {
		const store = STORE_BY_COMPANY[product.companyId];
		const name = product.productDetails.productName.trim().replace(/\s+/g, ' ');
		const normalized = normalize(name);
		if (!store || !product.prices.length) continue;
		if (include && !include.test(normalized)) continue;
		if (exclude && exclude.test(normalized)) continue;
		// Sold by the piece ("3ks balenie") – the weight in the data can't be trusted.
		if (/\d\s*ks\b/.test(normalized)) continue;
		const pack = packSize(product);
		if (!pack) continue;

		const price = mostCommon(product.prices.map((p) => p.price));
		if (!price) continue;
		const url = product.productDetails.productUrl?.startsWith('https://')
			? product.productDetails.productUrl
			: undefined;
		const base = {
			ingredient: mapping.ingredient,
			store,
			product: name,
			pack: formatPack(pack),
			date: today,
			...(url && { url })
		};
		keep(`${store}`, { ...base, price }, price / pack.amount);

		const promos = product.prices.filter((p) => p.promoPrice && p.promoTo && p.promoTo >= today);
		if (promos.length * 2 > product.prices.length) {
			const promoPrice = mostCommon(promos.map((p) => p.promoPrice!))!;
			const promoTo = mostCommon(promos.map((p) => p.promoTo!.slice(0, 10)))!;
			if (promoPrice < price) {
				keep(
					`${store}:promo`,
					{ ...base, price: promoPrice, sale_until: promoTo },
					promoPrice / pack.amount
				);
			}
		}
	}

	// Far below what every other chain charges almost always means a wrong pack size.
	const regular = [...best].filter(([key]) => !key.endsWith(':promo')).map(([, b]) => b.perUnit);
	const median = regular.sort((a, b) => a - b)[Math.floor(regular.length / 2)];
	const plausible = (perUnit: number) => regular.length < 3 || perUnit >= median * SUSPICIOUS_BELOW;

	// A promo only matters if it beats the store's cheapest regular price.
	return [...best]
		.filter(([, { perUnit }]) => plausible(perUnit))
		.filter(([key, { perUnit }]) => {
			if (!key.endsWith(':promo')) return true;
			const regular = best.get(key.replace(':promo', ''));
			return !regular || perUnit < regular.perUnit;
		})
		.map(([, { entry }]) => entry)
		.sort(
			(a, b) => a.store.localeCompare(b.store) || (a.sale_until ? 1 : 0) - (b.sale_until ? 1 : 0)
		);
}

const mappings = parse(readFileSync('content/cenyslovensko.yaml', 'utf8')) as Mapping[];
const today = new Date().toISOString().slice(0, 10);
const byType = new Map<string, ApiProduct[]>();
const entries: Entry[] = [];

for (const mapping of mappings) {
	const products: ApiProduct[] = [];
	for (const type of mapping.types) {
		if (!byType.has(type)) byType.set(type, await fetchType(type));
		products.push(...byType.get(type)!);
	}
	const found = toEntries(mapping, products, today);
	console.log(`${mapping.ingredient}: ${found.length} cien z ${products.length} produktov`);
	entries.push(...found);
}

const header = [
	'# GENEROVANÉ – neupravuj ručne. Zdroj: cenyslovensko.sk (Ministerstvo financií SR),',
	'# ceny posielajú reťazce denne. Obnov cez `pnpm prices:sync`, mapovanie je v cenyslovensko.yaml.',
	''
].join('\n');
writeFileSync(
	'content/prices-cenyslovensko.yaml',
	header + stringify({ entries }, { lineWidth: 0 })
);
console.log(`Zapísaných ${entries.length} cien.`);
