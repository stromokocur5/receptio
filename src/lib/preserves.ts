/** Home-made preserves – jars in the cellar, bags in the freezer – and how old they are. */

export const PRESERVE_PLACES = ['pivnica', 'mraznicka', 'chladnicka'] as const;
export type PreservePlace = (typeof PRESERVE_PLACES)[number];

export const PRESERVE_PLACE_LABELS: Record<PreservePlace, string> = {
	pivnica: 'Pivnica a špajza',
	mraznicka: 'Mraznička',
	chladnicka: 'Chladnička'
};

/** Months after which a preserve is past its best (safe canning, freezing and fridge advice). */
const BEST_MONTHS: Record<PreservePlace, number> = { pivnica: 12, mraznicka: 10, chladnicka: 1 };

export interface Preserve {
	id: string;
	name: string;
	count: number;
	/** ISO date it was made. */
	made: string;
	place: PreservePlace;
	recipeId?: string;
}

export type PreserveAge = 'fresh' | 'soon' | 'old';

/** Whole months between two ISO dates (the day of month counts, like a person would). */
export function monthsBetween(from: string, to: string): number {
	const [fy, fm, fd] = from.split('-').map(Number);
	const [ty, tm, td] = to.split('-').map(Number);
	return (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0);
}

/** fresh, soon (the last month or two of its best time) or old (past it – check before eating). */
export function preserveAge(p: Pick<Preserve, 'made' | 'place'>, today: string): PreserveAge {
	const months = monthsBetween(p.made, today);
	const best = BEST_MONTHS[p.place];
	if (months >= best) return 'old';
	if (months >= best - (p.place === 'chladnicka' ? 0 : 2)) return 'soon';
	return 'fresh';
}

/** Oldest first within each place, so what should be eaten first is on top. */
export function sortPreserves(list: Preserve[]): Preserve[] {
	return [...list].sort(
		(a, b) =>
			PRESERVE_PLACES.indexOf(a.place) - PRESERVE_PLACES.indexOf(b.place) ||
			a.made.localeCompare(b.made)
	);
}

/** "cca 8 pohárov po 0,5 l" → 8; a recipe that doesn't say gets 1. */
export function jarsFromYield(yields: string | undefined): number {
	const match = yields?.match(/(\d+)\s*(pohár|fľaš|vreck|porci)/i);
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
				: {})
		}));
}
