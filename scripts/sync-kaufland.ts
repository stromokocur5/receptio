/**
 * Reads this week's Kaufland offers (predajne.kaufland.sk – the leaflet as data, with dates) and
 * writes:
 * - content/katalog-kaufland.csv: every food offer of the week, for mapping more later,
 * - content/prices-kaufland.yaml: prices of the ingredients mapped in content/kaufland.yaml,
 * - today's rows in content/price-history-kaufland.csv.
 * Run with `pnpm prices:kaufland`.
 *
 * An offer's crossed-out price is the regular shelf price; the offer price counts as a promo
 * only between its dates. Prices with the Kaufland Card and "buy two for one" aren't used.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { format, resolveConfig } from 'prettier';
import { parse, stringify } from 'yaml';

const PAGE = 'https://predajne.kaufland.sk/aktualna-ponuka/prehlad.html?kloffer-week=current';
const REQUEST_TIMEOUT_MS = 60_000;
const PRICES_FILE = 'content/prices-kaufland.yaml';
const CATALOG_FILE = 'content/katalog-kaufland.csv';
const HISTORY_FILE = 'content/price-history-kaufland.csv';
const HISTORY_HEADER = 'date,ingredient,store,price,pack,sale_until,product';
/** Offer categories that aren't food. */
const NOT_FOOD = /oblecenie|elektro|drogeria|dom, domacnost/;

export interface KauflandOffer {
	offerId: string;
	dateFrom: string;
	dateTo: string;
	title?: string;
	subtitle?: string;
	price: number;
	unit?: string;
	label?: string;
	formattedOldPrice?: string;
}

interface Mapping {
	ingredient: string;
	include: string;
	exclude?: string;
}

interface Entry {
	ingredient: string;
	store: 'kaufland';
	product: string;
	pack: string;
	price: number;
	date: string;
	sale_until?: string;
	url: string;
}

const normalize = (text: string) =>
	text
		.toLowerCase()
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.replace(/\s+/g, ' ')
		.trim();

/** The page carries its data as `window.SSR['…'] = {…}` in a script; the offers are in there. */
export function readOffers(html: string): { category: string; offer: KauflandOffer }[] {
	const at = html.indexOf('"offerData"');
	if (at < 0) throw new Error('Kaufland: v stránke chýba offerData');
	const start = html.lastIndexOf('<script', at);
	const end = html.indexOf('</script>', at);
	const script = html.slice(html.indexOf('>', start) + 1, end);
	const json = script
		.slice(script.indexOf('] = ') + 4)
		.trim()
		.replace(/;$/, '');
	const data = JSON.parse(json) as {
		props: {
			offerData: {
				cycles: { categories: { displayName: string; offers: KauflandOffer[] }[] }[];
			};
		};
	};
	return data.props.offerData.cycles.flatMap((cycle) =>
		cycle.categories.flatMap((c) => c.offers.map((offer) => ({ category: c.displayName, offer })))
	);
}

export const productName = (offer: KauflandOffer) =>
	[offer.title, offer.subtitle?.split('\n')[0]]
		.map((s) => s?.trim())
		.filter(Boolean)
		.join(' ');

/** Pack as recipes write it, from "500 g", "5 kg balenie", "cena za 1 kg", "4 x 100 g", "1 kus". */
export function packOf(unit: string | undefined): string | null {
	const text = normalize(unit ?? '').replace('cena za ', '');
	const multi = /^(\d+) x (\d+(?:,\d+)?) (g|kg|ml|l)$/.exec(text);
	if (multi) return packOf(`${Number(multi[1]) * Number(multi[2].replace(',', '.'))} ${multi[3]}`);
	const single = /^(\d+(?:[,.]\d+)?) (g|kg|ml|l|kus|kusy|kusov)(?: v baleni| balenie)?$/.exec(text);
	if (!single) return null;
	const amount = Number(single[1].replace(',', '.'));
	if (!(amount > 0)) return null;
	const unitName = single[2].startsWith('kus') ? 'ks' : single[2];
	if ((unitName === 'g' || unitName === 'ml') && amount >= 1000 && amount % 100 === 0) {
		return `${String(amount / 1000).replace('.', ',')} ${unitName === 'g' ? 'kg' : 'l'}`;
	}
	return `${String(amount).replace('.', ',')} ${unitName}`;
}

const euros = (text: string | undefined) => {
	const value = Number(text?.replace(',', '.'));
	return value > 0 ? value : undefined;
};

/** Regular shelf price and, between the offer's dates, the offer price. */
export function prices(offer: KauflandOffer, today: string) {
	if (offer.label === 'halfPrice') return null;
	const old = euros(offer.formattedOldPrice);
	const running = offer.dateFrom <= today && today <= offer.dateTo;
	if (old && old > offer.price) {
		return {
			regular: old,
			promo: running ? { price: offer.price, until: offer.dateTo } : undefined
		};
	}
	// Without a crossed-out price the offer is the regular price, but only while it's on.
	return running ? { regular: offer.price, promo: undefined } : null;
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
	const res = await fetch(PAGE, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
	if (!res.ok) throw new Error(`${PAGE}: HTTP ${res.status}`);
	const offers = readOffers(await res.text()).filter(
		({ category, offer }) => !NOT_FOOD.test(normalize(category)) && offer.price > 0
	);
	if (offers.length < 100) {
		throw new Error(`Len ${offers.length} ponúk v potravinách – nič nezapisujem.`);
	}

	writeFileSync(
		CATALOG_FILE,
		[
			csvRow(['offer', 'product', 'category', 'pack', 'price', 'old_price', 'from', 'to']),
			...offers
				.map(({ category, offer }) => [
					offer.offerId,
					productName(offer),
					category.replace(/\s+\d.*$/, ''),
					offer.unit?.replace(/\s+/g, ' ') ?? '',
					offer.price,
					euros(offer.formattedOldPrice) ?? '',
					offer.dateFrom,
					offer.dateTo
				])
				.sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'sk'))
				.map(csvRow)
		].join('\n') + '\n'
	);

	const mappings = parse(readFileSync('content/kaufland.yaml', 'utf8')) as Mapping[];
	const ingredients = parse(readFileSync('content/ingredients.yaml', 'utf8')) as {
		id: string;
		units?: Record<string, number>;
	}[];
	const byPiece = new Set(ingredients.filter((i) => i.units?.ks).map((i) => i.id));
	const entries: Entry[] = [];
	for (const mapping of mappings) {
		const include = new RegExp(mapping.include);
		const exclude = mapping.exclude ? new RegExp(mapping.exclude) : null;
		const before = entries.length;
		for (const { offer } of offers) {
			const name = productName(offer);
			if (!include.test(normalize(name)) || exclude?.test(normalize(name))) continue;
			const pack = packOf(offer.unit);
			// "1 ks" only means something when the ingredient knows what one piece weighs.
			if (!pack || (pack.endsWith(' ks') && !byPiece.has(mapping.ingredient))) continue;
			const found = prices(offer, today);
			if (!found) continue;
			const base = {
				ingredient: mapping.ingredient,
				store: 'kaufland' as const,
				product: name,
				pack,
				date: today,
				url: PAGE
			};
			entries.push({ ...base, price: found.regular });
			if (found.promo)
				entries.push({ ...base, price: found.promo.price, sale_until: found.promo.until });
		}
		if (entries.length === before) {
			console.warn(
				`${mapping.ingredient}: tento týždeň v ponuke nič nezodpovedá ${mapping.include}`
			);
		}
	}

	// The offers change every week: a mapped product that isn't on offer keeps its last regular
	// price, which then ages like any other.
	const previous = existsSync(PRICES_FILE)
		? ((parse(readFileSync(PRICES_FILE, 'utf8')) as { entries?: Entry[] | null }).entries ?? [])
		: [];
	const fresh = new Set(entries.map((e) => `${e.ingredient}|${e.product}`));
	const known = new Set(mappings.map((m) => m.ingredient));
	const kept = previous.filter(
		(e) => !e.sale_until && known.has(e.ingredient) && !fresh.has(`${e.ingredient}|${e.product}`)
	);
	const all = [...entries, ...kept].sort(
		(a, b) =>
			a.ingredient.localeCompare(b.ingredient) ||
			a.product.localeCompare(b.product, 'sk') ||
			(a.sale_until ? 1 : 0) - (b.sale_until ? 1 : 0)
	);
	await writeFormatted(
		PRICES_FILE,
		'# GENEROVANÉ – neupravuj ručne. Ceny z týždennej ponuky Kauflandu, obnov cez\n' +
			'# `pnpm prices:kaufland`; mapovanie je v kaufland.yaml.\n' +
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
		`${offers.length} ponúk potravín, ${entries.length} cien pre ${new Set(entries.map((e) => e.ingredient)).size} surovín (${sales} v akcii).`
	);
}

if (import.meta.main) await main();
