/** Home-made preserves – jars in the cellar, bags in the freezer – and how old they are. */

export const PRESERVE_PLACES = ['pivnica', 'mraznicka', 'chladnicka'] as const;
export type PreservePlace = (typeof PRESERVE_PLACES)[number];

export const PRESERVE_PLACE_LABELS: Record<PreservePlace, string> = {
	pivnica: 'Pivnica a špajza',
	mraznicka: 'Mraznička',
	chladnicka: 'Chladnička'
};

export interface Preserve {
	id: string;
	name: string;
	count: number;
	/** ISO date it was made. */
	made: string;
	place: PreservePlace;
	recipeId?: string;
	/** ISO date it came out of the freezer into the fridge. */
	thawed?: string;
	/** Cooked and not eaten yet: keeps days in the fridge, not months. */
	leftover?: boolean;
}

export type PreserveAge = 'fresh' | 'soon' | 'old';

/** Months it's at its best by kind (safe canning and freezing advice); the first match wins. */
const KINDS: { match: RegExp; months: Partial<Record<PreservePlace, number>> }[] = [
	{ match: /lekv|d[žz]em|marmel|povidl|konfit/, months: { pivnica: 24 } },
	{ match: /kompót|kompot|sirup|šťav/, months: { pivnica: 12 } },
	{ match: /kimči|kimchi|kapust|kvas|nakladan|uhor/, months: { pivnica: 12, chladnicka: 6 } },
	{ match: /chlieb|pečiv|rožk|koláč|buchty|cesto|pizz|tortil/, months: { mraznicka: 3 } },
	{ match: /pesto|bylink|pažítk|petržlen|bazalk/, months: { mraznicka: 6 } },
	{
		match: /polievk|vývar|omáčk|guláš|kari|dal|chili|ragú|lasagn|burrito|halušk|knedl|tofu/,
		months: { mraznicka: 4 }
	}
];
const DEFAULT_MONTHS: Record<PreservePlace, number> = { pivnica: 12, mraznicka: 10, chladnicka: 1 };
/** A thawed dish keeps a day or two in the fridge, however long it was frozen. */
const THAWED_DAYS = 2;
/** A cooked dish whose recipe doesn't say how long it keeps (as in the plan's schedule). */
const LEFTOVER_DAYS = 3;

/** How a recipe says it keeps, when the entry comes from one. */
export type Keeps = { fridge: number; freezer: number } | undefined;

const lower = (name: string) => name.toLocaleLowerCase('sk');
const utc = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const isoOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function addMonths(iso: string, months: number): string {
	const [y, m, d] = iso.split('-').map(Number);
	const lastDay = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
	return isoOf(Date.UTC(y, m - 1 + months, Math.min(d, lastDay)));
}

/** Months it keeps where it is now: the recipe's own word first, then its kind, then the place. */
export function bestMonths(p: Pick<Preserve, 'name' | 'place'>, keeps?: Keeps): number {
	if (p.place === 'mraznicka' && keeps?.freezer) return keeps.freezer;
	const name = lower(p.name);
	const kind = KINDS.find((k) => k.match.test(name) && k.months[p.place]);
	return kind?.months[p.place] ?? DEFAULT_MONTHS[p.place];
}

/** ISO date until which it's at its best. */
export function bestBefore(
	p: Pick<Preserve, 'name' | 'place' | 'made' | 'thawed' | 'leftover'>,
	keeps?: Keeps
) {
	if (p.place === 'chladnicka' && p.leftover)
		return isoOf(utc(p.made) + (keeps?.fridge || LEFTOVER_DAYS) * 86_400_000);
	if (p.place === 'chladnicka' && p.thawed) {
		const days = Math.min(THAWED_DAYS, keeps?.fridge || THAWED_DAYS);
		return isoOf(utc(p.thawed) + days * 86_400_000);
	}
	if (p.place === 'chladnicka' && keeps?.fridge && !KINDS.some((k) => k.match.test(lower(p.name))))
		return isoOf(utc(p.made) + keeps.fridge * 86_400_000);
	return addMonths(p.made, bestMonths(p, keeps));
}

/** Days from today to the best-before date; negative once it's past. */
export function daysLeft(
	p: Pick<Preserve, 'name' | 'place' | 'made' | 'thawed' | 'leftover'>,
	today: string,
	keeps?: Keeps
): number {
	return Math.round((utc(bestBefore(p, keeps)) - utc(today)) / 86_400_000);
}

/** fresh, soon (the last weeks of its best time; the last day in the fridge) or old (check first). */
export function preserveAge(
	p: Pick<Preserve, 'name' | 'place' | 'made' | 'thawed' | 'leftover'>,
	today: string,
	keeps?: Keeps
): PreserveAge {
	const left = daysLeft(p, today, keeps);
	if (left < 0) return 'old';
	return left <= (p.place === 'chladnicka' ? 1 : 45) ? 'soon' : 'fresh';
}

/** Within each place, what should be eaten first is on top. */
export function sortPreserves(list: Preserve[], keepsOf: (p: Preserve) => Keeps = () => undefined) {
	return [...list].sort(
		(a, b) =>
			PRESERVE_PLACES.indexOf(a.place) - PRESERVE_PLACES.indexOf(b.place) ||
			bestBefore(a, keepsOf(a)).localeCompare(bestBefore(b, keepsOf(b))) ||
			a.made.localeCompare(b.made)
	);
}

/** Common things people put up, for the name field's suggestions. */
export const PRESERVE_SUGGESTIONS = [
	'Lečo',
	'Marhuľový lekvár',
	'Slivkový lekvár',
	'Jahodový džem',
	'Kompót',
	'Kyslé uhorky',
	'Kyslá kapusta',
	'Sterilizovaná paprika',
	'Paradajková omáčka',
	'Bazový sirup',
	'Mrazená zelenina',
	'Fazuľky',
	'Hrášok',
	'Lesné ovocie',
	'Pesto',
	'Polievka',
	'Chlieb'
];

/** "cca 8 pohárov po 0,5 l" → 8; a recipe that doesn't say gets 1. */
export function jarsFromYield(yields: string | undefined): number {
	const match = yields?.match(/(\d+)\s*(pohár|fľaš|vrec|porci)/i);
	return match ? Math.min(99, Number(match[1])) : 1;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

const MAX_PRESERVES = 300;

export function validatePreserves(raw: unknown): Preserve[] | undefined {
	if (!Array.isArray(raw)) return undefined;
	return raw
		.filter(
			(p): p is Record<string, unknown> =>
				isRecord(p) &&
				typeof p.id === 'string' &&
				typeof p.name === 'string' &&
				p.name.trim().length > 0 &&
				typeof p.count === 'number' &&
				Number.isInteger(p.count) &&
				p.count >= 1 &&
				p.count <= 999 &&
				isDate(p.made) &&
				typeof p.place === 'string' &&
				(PRESERVE_PLACES as readonly string[]).includes(p.place)
		)
		.slice(0, MAX_PRESERVES)
		.map((p) => ({
			id: (p.id as string).slice(0, 40),
			name: (p.name as string).trim().slice(0, 80),
			count: p.count as number,
			made: p.made as string,
			place: p.place as PreservePlace,
			...(typeof p.recipeId === 'string' && /^[a-z0-9-]{1,80}$/.test(p.recipeId)
				? { recipeId: p.recipeId }
				: {}),
			...(p.place === 'chladnicka' && isDate(p.thawed) ? { thawed: p.thawed } : {}),
			...(p.place === 'chladnicka' && p.leftover === true ? { leftover: true as const } : {})
		}));
}
