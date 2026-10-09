/** A saved garden and its diary, as stored on the phone and shared with a household. */

import type { GrowPlace, GrowSun } from './types';

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);
const inRange = (v: unknown, min: number, max: number): v is number =>
	typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/** A saved garden plan and its diary. */
export interface GardenDiary {
	/** Stable handle, so a garden keeps its diary when it is renamed. */
	id: string;
	/** What the grower calls it: "Balkón", "Záhrada u babky". */
	name: string;
	place: GrowPlace;
	area: number;
	sun: GrowSun;
	level: 1 | 2 | 3;
	/** Polycultures chosen by the planner and how many modules of each. */
	combos: { id: string; modules: number }[];
	plants: { ingredientId: string; count: number }[];
	/** Finished tasks: `2026-5-sow-mrkva` → date done. */
	done: Record<string, string>;
	harvests: { ingredientId: string; grams: number; date: string }[];
	/** Hand-drawn beds from the garden editor. */
	beds: {
		id: string;
		name: string;
		width: number;
		depth: number;
		cells: Record<string, string>;
		past: { year: number; families: string[] }[];
	}[];
	savedAt: string;
}

const PLACES = ['parapet', 'balkon', 'zahrada'];
const SUNS = ['slnko', 'polotien', 'tien'];
const MAX_HARVESTS = 1000;
export const MAX_GARDENS = 12;
export const MAX_GARDEN_NAME = 40;
export const GARDEN_NAMES: Record<GrowPlace, string> = {
	parapet: 'Okno',
	balkon: 'Balkón',
	zahrada: 'Záhrada'
};
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

export const newGardenId = () => crypto.randomUUID().slice(0, 8);

/** "Balkón", or "Balkón 2" when there already is one. */
export function gardenName(place: GrowPlace, existing: { name: string }[]): string {
	const base = GARDEN_NAMES[place];
	const taken = new Set(existing.map((g) => g.name));
	for (let n = 1; ; n++) {
		const name = n === 1 ? base : `${base} ${n}`;
		if (!taken.has(name)) return name;
	}
}

/** Gardens saved before there could be several have no id or name; they get them here. */
export function validateGarden(raw: unknown): GardenDiary | undefined {
	if (!isRecord(raw)) return undefined;
	const { id, name, place, area, sun, level, combos, plants, done, harvests, beds, savedAt } = raw;
	if (typeof place !== 'string' || !PLACES.includes(place)) return undefined;
	if (typeof sun !== 'string' || !SUNS.includes(sun)) return undefined;
	if (typeof area !== 'number' || !(area > 0) || area > 100_000) return undefined;
	if (level !== 1 && level !== 2 && level !== 3) return undefined;
	if (!Array.isArray(combos) || !Array.isArray(plants) || !Array.isArray(harvests))
		return undefined;
	return {
		id: typeof id === 'string' && /^[a-z0-9-]{1,40}$/.test(id) ? id : newGardenId(),
		name:
			typeof name === 'string' && name.trim()
				? name.trim().slice(0, MAX_GARDEN_NAME)
				: GARDEN_NAMES[place as GrowPlace],
		place: place as GrowPlace,
		area,
		sun: sun as GrowSun,
		level,
		combos: combos.filter(
			(c): c is { id: string; modules: number } =>
				isRecord(c) && typeof c.id === 'string' && inRange(c.modules, 1, 10_000)
		),
		plants: plants.filter(
			(p): p is { ingredientId: string; count: number } =>
				isRecord(p) && typeof p.ingredientId === 'string' && inRange(p.count, 1, 1_000_000)
		),
		done: isRecord(done)
			? (Object.fromEntries(Object.entries(done).filter(([, v]) => isDate(v))) as Record<
					string,
					string
				>)
			: {},
		harvests: harvests
			.filter(
				(h): h is GardenDiary['harvests'][number] =>
					isRecord(h) &&
					typeof h.ingredientId === 'string' &&
					typeof h.grams === 'number' &&
					h.grams > 0 &&
					h.grams <= 1_000_000 &&
					isDate(h.date)
			)
			.slice(-MAX_HARVESTS),
		beds: validateBeds(beds),
		savedAt: isDate(savedAt) ? savedAt : new Date().toISOString().slice(0, 10)
	};
}

const MAX_BEDS = 30;
const MAX_BED_M = 50;

function validateBeds(raw: unknown): GardenDiary['beds'] {
	if (!Array.isArray(raw)) return [];
	return raw
		.filter(
			(b): b is Record<string, unknown> =>
				isRecord(b) &&
				typeof b.id === 'string' &&
				typeof b.name === 'string' &&
				typeof b.width === 'number' &&
				typeof b.depth === 'number' &&
				b.width > 0 &&
				b.width <= MAX_BED_M &&
				b.depth > 0 &&
				b.depth <= MAX_BED_M &&
				isRecord(b.cells)
		)
		.slice(0, MAX_BEDS)
		.map((b) => ({
			id: (b.id as string).slice(0, 40),
			name: (b.name as string).slice(0, 60),
			width: b.width as number,
			depth: b.depth as number,
			cells: Object.fromEntries(
				Object.entries(b.cells as Record<string, unknown>).filter(
					([k, v]) => /^\d+,\d+$/.test(k) && typeof v === 'string' && /^[a-z0-9-]{1,60}$/.test(v)
				)
			) as Record<string, string>,
			past: Array.isArray(b.past)
				? b.past
						.filter(
							(p): p is { year: number; families: string[] } =>
								isRecord(p) &&
								inRange(p.year, 2000, 2200) &&
								Array.isArray(p.families) &&
								p.families.every((f) => typeof f === 'string')
						)
						.slice(-5)
				: []
		}));
}

export function validateGardens(raw: unknown): GardenDiary[] | undefined {
	if (!Array.isArray(raw)) return undefined;
	const byId = new Map(raw.flatMap((g) => validateGarden(g) ?? []).map((g) => [g.id, g]));
	return [...byId.values()].slice(0, MAX_GARDENS);
}
