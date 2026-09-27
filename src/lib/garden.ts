import type { GrowCombo, GrowGuide, GrowPlace, GrowSun } from './types';

export interface GardenInput {
	place: GrowPlace;
	/** m² of bed, balcony floor or windowsill. */
	area: number;
	sun: GrowSun;
	/** Highest difficulty the grower wants (1 beginner … 3 experienced). */
	level: 1 | 2 | 3;
}

export interface PlannedCombo {
	combo: GrowCombo;
	modules: number;
	area: number;
}

export interface GardenPlan {
	/** Area left for paths in a garden; 0 elsewhere. */
	paths: number;
	combos: PlannedCombo[];
	used: number;
	free: number;
	plants: { ingredientId: string; name: string; count: number }[];
	/** Month (1–12) → what to do. */
	calendar: { month: number; indoor: string[]; sow: string[]; harvest: string[] }[];
	/** Plant families in the plan, to rotate beds next year. */
	families: string[];
	/** What to get: basic tools for the place plus what each combination needs. */
	gear: string[];
}

/** Tools every grower in that place needs, whatever they plant. */
export const BASE_GEAR: Record<GrowPlace, string[]> = {
	parapet: [
		'substrát pre zeleninu a bylinky (asi 10 l)',
		'malá kanva alebo fľaša s dierkami v uzávere'
	],
	balkon: [
		'substrát pre zeleninu (asi 1 vrece 50 l na 1 m² balkóna)',
		'kanva 5–10 l',
		'malá lopatka',
		'podmisky pod nádoby, aby voda netiekla susedom'
	],
	zahrada: [
		'rýľ alebo rycie vidly',
		'motyka a hrable',
		'kanva a hadica (ideálne sud na dažďovú vodu)',
		'kompost alebo zrelý hnoj',
		'mulč – slama, pokosená tráva',
		'fúrik'
	]
};

/** Light as a minimum: what copes with shade also grows in sun (salad bolts sooner, but grows). */
const LIGHT: Record<GrowSun, number> = { tien: 0, polotien: 1, slnko: 2 };

/** A garden needs about a fifth for paths between beds; pots and windowsills don't. */
export const PATH_SHARE = 0.2;

/**
 * Fills the space with polycultures that suit the place, light and experience: one module of
 * each fitting combination in turn, then another round, so the plan stays varied instead of one
 * crop over the whole plot.
 */
export function planGarden(
	input: GardenInput,
	combos: GrowCombo[],
	guides: GrowGuide[]
): GardenPlan {
	const area = Math.max(0, input.area);
	const paths = input.place === 'zahrada' ? area * PATH_SHARE : 0;
	let free = area - paths;
	const fitting = combos
		.filter(
			(c) =>
				c.where.includes(input.place) &&
				Math.min(...c.sun.map((l) => LIGHT[l])) <= LIGHT[input.sun] &&
				c.level <= input.level
		)
		// Easy first; small modules first, so a windowsill gets several things instead of one big one.
		.sort((a, b) => a.level - b.level || a.area - b.area);

	const modules = new Map<string, number>();
	for (let added = true; added;) {
		added = false;
		for (const c of fitting) {
			const count = modules.get(c.id) ?? 0;
			if (c.area > free + 1e-9 || (c.max !== undefined && count >= c.max)) continue;
			modules.set(c.id, count + 1);
			free -= c.area;
			added = true;
		}
	}

	const planned = fitting
		.filter((c) => modules.has(c.id))
		.map((c) => ({ combo: c, modules: modules.get(c.id)!, area: c.area * modules.get(c.id)! }));

	const counts = new Map<string, { ingredientId: string; name: string; count: number }>();
	for (const { combo, modules: n } of planned) {
		for (const m of combo.members) {
			const entry = counts.get(m.ingredientId) ?? {
				ingredientId: m.ingredientId,
				name: m.name,
				count: 0
			};
			entry.count += m.count * n;
			counts.set(m.ingredientId, entry);
		}
	}
	const plants = [...counts.values()].sort((a, b) => a.name.localeCompare(b.name, 'sk'));
	const byId = new Map(guides.map((g) => [g.ingredientId, g]));
	const grown = plants.map((p) => byId.get(p.ingredientId)).filter((g) => g !== undefined);

	const calendar = Array.from({ length: 12 }, (_, i) => {
		const month = i + 1;
		const names = (pick: (g: GrowGuide) => number[]) =>
			grown.filter((g) => pick(g).includes(month) && !g.perennial).map((g) => g.name);
		return {
			month,
			indoor: names((g) => g.indoor),
			sow: names((g) => g.sow),
			harvest: grown.filter((g) => g.harvest.includes(month)).map((g) => g.name)
		};
	});

	return {
		paths,
		combos: planned,
		used: area - paths - free,
		free: Math.max(0, free),
		plants,
		calendar,
		families: [...new Set(grown.map((g) => g.family))],
		gear: [
			...BASE_GEAR[input.place],
			...planned.flatMap(({ combo, modules: n }) =>
				combo.gear.map((g) => (n > 1 ? `${g} (${n}×)` : g))
			)
		]
	};
}

/** Crops worth sowing (or starting indoors) in a given month. */
export function sowNow(guides: GrowGuide[], month: number): GrowGuide[] {
	return guides.filter((g) => g.sow.includes(month) || g.indoor.includes(month));
}
