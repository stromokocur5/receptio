import type { GrowCombo, GrowForm, GrowGuide, GrowPlace, GrowSun } from './types';

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
	/** Wanted crops no combination brought in, planted on their own. */
	extras: { ingredientId: string; name: string; count: number; area: number; level: 1 | 2 | 3 }[];
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

export const PLACE_LABELS: Record<GrowPlace, string> = {
	parapet: 'byt',
	balkon: 'balkón',
	zahrada: 'záhrada'
};
export const SUN_LABELS: Record<GrowSun, string> = {
	slnko: 'slnko',
	polotien: 'polotieň',
	tien: 'tieň'
};
export const FORM_LABELS: Record<GrowForm, string> = {
	strom: 'strom',
	ker: 'ker',
	popinava: 'popínavá',
	huba: 'huba'
};

/** "o rok", "o 3 roky", "o 6 rokov" – when a tree or shrub first bears fruit. */
export function yearsPhrase(years: number): string {
	if (years <= 1) return 'o rok';
	return `o ${years} ${years < 5 ? 'roky' : 'rokov'}`;
}

/** Indexed by `GrowGuide.level`. */
export const LEVEL_LABELS = ['', 'ľahké', 'treba sa starať', 'pre pokročilých'];

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

const wantedHits = (c: GrowCombo, wanted: Set<string>) =>
	c.members.filter((m) => wanted.has(m.ingredientId)).length;

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
	guides: GrowGuide[],
	/** Crops the grower wants (from chosen recipes); combinations with more of them go first. */
	wanted: Set<string> = new Set()
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
		// Wanted crops first, then easy, then small modules (a windowsill gets several things).
		.sort(
			(a, b) =>
				wantedHits(b, wanted) - wantedHits(a, wanted) || a.level - b.level || a.area - b.area
		);

	const modules = new Map<string, number>();
	const addModule = (c: GrowCombo) => {
		const count = modules.get(c.id) ?? 0;
		if (c.area > free + 1e-9 || (c.max !== undefined && count >= c.max)) return false;
		modules.set(c.id, count + 1);
		free -= c.area;
		return true;
	};

	// 1. One module of every combination with a wanted crop.
	for (const c of fitting) if (wantedHits(c, wanted)) addModule(c);

	// 2. Wanted crops no combination brought in: a small patch each, if they grow here.
	const byGuide = new Map(guides.map((g) => [g.ingredientId, g]));
	const inCombos = new Set(
		fitting.filter((c) => modules.has(c.id)).flatMap((c) => c.members.map((m) => m.ingredientId))
	);
	const extras: GardenPlan['extras'] = [];
	for (const id of wanted) {
		const g = byGuide.get(id);
		if (!g || inCombos.has(id) || !g.where.includes(input.place)) continue;
		if (Math.min(...g.sun.map((l) => LIGHT[l])) > LIGHT[input.sun]) continue;
		const patch = input.place === 'parapet' ? 0.1 : input.place === 'balkon' ? 0.3 : 0.5;
		if (patch > free + 1e-9) continue;
		const perPlant = Math.max(0.01, (Math.max(g.spacing, 5) / 100) ** 2);
		extras.push({
			ingredientId: id,
			name: g.name,
			count: Math.max(1, Math.floor(patch / perPlant)),
			area: patch,
			level: g.level
		});
		free -= patch;
	}

	// 3. The rest of the space, round-robin so the plan stays varied.
	for (let added = true; added;) {
		added = false;
		for (const c of fitting) if (addModule(c)) added = true;
	}

	const planned = fitting
		.filter((c) => modules.has(c.id))
		.map((c) => ({ combo: c, modules: modules.get(c.id)!, area: c.area * modules.get(c.id)! }));

	const counts = new Map<string, { ingredientId: string; name: string; count: number }>();
	for (const e of extras)
		counts.set(e.ingredientId, { ingredientId: e.ingredientId, name: e.name, count: e.count });
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
		extras,
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

export type TaskKind = 'indoor' | 'sow' | 'harvest';

export interface GardenTask {
	/** Stable per year and month, so the checkbox remembers it: `2026-5-sow-mrkva`. */
	key: string;
	kind: TaskKind;
	ingredientId: string;
	name: string;
}

/** What a saved garden asks for in a given month. Perennials are planted once, not every year. */
export function monthTasks(
	plants: { ingredientId: string }[],
	guides: GrowGuide[],
	done: Record<string, string>,
	year: number,
	month: number
): GardenTask[] {
	const byId = new Map(guides.map((g) => [g.ingredientId, g]));
	const planted = (id: string) => Object.keys(done).some((k) => k.endsWith(`-sow-${id}`));
	const tasks: GardenTask[] = [];
	for (const kind of ['indoor', 'sow', 'harvest'] as const) {
		for (const { ingredientId } of plants) {
			const g = byId.get(ingredientId);
			if (!g || !g[kind].includes(month)) continue;
			if (g.perennial && kind !== 'harvest' && planted(ingredientId)) continue;
			tasks.push({
				key: `${year}-${month}-${kind}-${ingredientId}`,
				kind,
				ingredientId,
				name: g.name
			});
		}
	}
	return tasks;
}

/** Grams harvested per crop in a year, biggest first. */
export function harvestTotals(
	harvests: { ingredientId: string; grams: number; date: string }[],
	year: number
): { ingredientId: string; grams: number }[] {
	const totals = new Map<string, number>();
	for (const h of harvests) {
		if (!h.date.startsWith(`${year}-`)) continue;
		totals.set(h.ingredientId, (totals.get(h.ingredientId) ?? 0) + h.grams);
	}
	return [...totals]
		.map(([ingredientId, grams]) => ({ ingredientId, grams }))
		.sort((a, b) => b.grams - a.grams);
}

/** Recipes that use the most of what's being harvested, for "cook from the garden". */
export function harvestRecipes<R extends { id: string; lines: { ingredientId: string }[] }>(
	recipes: R[],
	ingredientIds: string[],
	limit = 6
): R[] {
	const wanted = new Set(ingredientIds);
	return recipes
		.map((r) => ({
			r,
			hits: new Set(r.lines.map((l) => l.ingredientId).filter((id) => wanted.has(id))).size
		}))
		.filter((x) => x.hits > 0)
		.sort((a, b) => b.hits - a.hits || a.r.lines.length - b.r.lines.length)
		.slice(0, limit)
		.map((x) => x.r);
}

/** Tall crops go to the north (back) edge so they don't shade the rest. */
const TALL = new Set([
	'kukurica-klas',
	'slnecnicove-semienka',
	'topinambur',
	'cirok',
	'amarant',
	'maliny',
	'paradajky',
	'hrasok',
	'fazula-biela',
	'bob-suchy',
	'ruzickovy-kel',
	'kel',
	'rozmarin'
]);

export interface LayoutDot {
	ingredientId: string;
	/** Metres from the west and north edges. */
	x: number;
	y: number;
}

/**
 * A schematic plan of one module: tall plants in the north band, low ones to the south, each crop
 * in a band sized by how much room its plants need. `mix` plantings (three sisters) interleave.
 */
export function comboLayout(
	combo: GrowCombo,
	guides: GrowGuide[]
): { width: number; depth: number; dots: LayoutDot[] } {
	const depth = combo.depth ?? (combo.area >= 1 ? 1 : combo.area);
	const width = combo.area / depth;
	const spacing = new Map(guides.map((g) => [g.ingredientId, Math.max(g.spacing, 5) / 100]));
	const members = [...combo.members].sort(
		(a, b) => Number(TALL.has(b.ingredientId)) - Number(TALL.has(a.ingredientId))
	);

	const grid = (count: number, x0: number, y0: number, w: number, h: number) => {
		const cols = Math.min(count, Math.max(1, Math.round(Math.sqrt((count * w) / h))));
		const rows = Math.ceil(count / cols);
		return Array.from({ length: count }, (_, i) => ({
			x: x0 + ((i % cols) + 0.5) * (w / cols),
			y: y0 + (Math.floor(i / cols) + 0.5) * (h / rows)
		}));
	};

	if (combo.layout === 'kruh') {
		// The tree in the centre; everything else interleaved on rings, more on the outer ones.
		const [center, ...rest] = combo.members;
		const cx = width / 2;
		const cy = depth / 2;
		const reach = Math.min(width, depth) / 2;
		const order: string[] = [];
		const left = new Map(rest.map((m) => [m.ingredientId, m.count]));
		while (order.length < rest.reduce((n, m) => n + m.count, 0)) {
			for (const m of rest) {
				if ((left.get(m.ingredientId) ?? 0) > 0) {
					order.push(m.ingredientId);
					left.set(m.ingredientId, left.get(m.ingredientId)! - 1);
				}
			}
		}
		const radii = [0.45, 0.68, 0.88].map((f) => f * reach);
		const weight = radii.reduce((a, b) => a + b, 0);
		const dots: LayoutDot[] = [{ x: cx, y: cy, ingredientId: center.ingredientId }];
		let placed = 0;
		radii.forEach((r, ring) => {
			const n =
				ring === radii.length - 1 ? order.length - placed : Math.round((order.length * r) / weight);
			for (let i = 0; i < n; i++) {
				const angle = (2 * Math.PI * i) / n + ring * 0.4;
				dots.push({
					x: cx + r * Math.cos(angle),
					y: cy + r * Math.sin(angle),
					ingredientId: order[placed + i]
				});
			}
			placed += n;
		});
		return { width, depth, dots };
	}

	if (combo.layout === 'mix') {
		const total = members.reduce((n, m) => n + m.count, 0);
		const order: string[] = [];
		const left = new Map(members.map((m) => [m.ingredientId, m.count]));
		while (order.length < total) {
			for (const m of members) {
				if ((left.get(m.ingredientId) ?? 0) > 0) {
					order.push(m.ingredientId);
					left.set(m.ingredientId, left.get(m.ingredientId)! - 1);
				}
			}
		}
		return {
			width,
			depth,
			dots: grid(total, 0, 0, width, depth).map((p, i) => ({ ...p, ingredientId: order[i] }))
		};
	}

	const need = members.map((m) => m.count * (spacing.get(m.ingredientId) ?? 0.2) ** 2);
	const totalNeed = need.reduce((a, b) => a + b, 0);
	const share = (i: number) => need[i] / totalNeed;
	const dots: LayoutDot[] = [];
	// Rows from north to south, unless a row would be shallower than its plants need – then the
	// crops sit side by side (a narrow windowsill box with one herb of each kind).
	const rows = members.every(
		(m, i) => depth * share(i) >= 0.6 * (spacing.get(m.ingredientId) ?? 0.2)
	);
	let offset = 0;
	members.forEach((m, i) => {
		const band = (rows ? depth : width) * share(i);
		const cells = rows
			? grid(m.count, 0, offset, width, band)
			: grid(m.count, offset, 0, band, depth);
		for (const p of cells) dots.push({ ...p, ingredientId: m.ingredientId });
		offset += band;
	});
	return { width, depth, dots };
}

export interface GrowLocation {
	name: string;
	lat: number;
	lon: number;
	/** Metres above sea level – the main thing that moves the season in Slovakia. */
	elevation: number;
}

/** The crop calendars are written for the lowlands (Podunajsko, Východoslovenská nížina, ~150 m). */
const BASE_ELEVATION = 200;

/** How many weeks later spring comes (and earlier autumn) than in the lowlands. */
export function seasonDelayWeeks(elevation: number): number {
	return Math.min(5, Math.max(0, Math.round((elevation - BASE_ELEVATION) / 150)));
}

/** Typical last spring and first autumn frost for a place – averages, a cold year can differ. */
export function frostDates(
	elevation: number,
	year: number
): { lastSpring: Date; firstAutumn: Date } {
	const weeks = seasonDelayWeeks(elevation);
	const day = 24 * 60 * 60 * 1000;
	return {
		lastSpring: new Date(Date.UTC(year, 3, 20) + weeks * 7 * day),
		firstAutumn: new Date(Date.UTC(year, 9, 20) - weeks * 7 * day)
	};
}

const clampMonth = (m: number) => Math.min(12, Math.max(1, m));
const uniqueSorted = (months: number[]) => [...new Set(months)].sort((a, b) => a - b);

/**
 * Moves a crop's calendar to a colder place: spring work and summer harvests later, autumn
 * sowing earlier. Month resolution, so less than two weeks' delay changes nothing.
 */
export function localizeGuide(guide: GrowGuide, delayWeeks: number): GrowGuide {
	const shift = Math.round(delayWeeks / 4);
	if (!shift) return guide;
	const work = (months: number[]) =>
		uniqueSorted(months.map((m) => clampMonth(m <= 7 ? m + shift : m - shift)));
	return {
		...guide,
		indoor: work(guide.indoor),
		sow: work(guide.sow),
		// Crops picked through the winter (kel, pór) stay; summer and autumn harvests come later.
		harvest: uniqueSorted(guide.harvest.map((m) => (m >= 4 && m <= 9 ? clampMonth(m + shift) : m)))
	};
}

/** Crops worth sowing on the same spot after this one is harvested (a different family). */
export function successors(guide: GrowGuide, guides: GrowGuide[], place: GrowPlace): GrowGuide[] {
	const lastSummer = Math.max(...guide.harvest.filter((m) => m <= 8));
	if (!Number.isFinite(lastSummer) || guide.perennial) return [];
	const next = lastSummer + 1;
	return guides.filter(
		(g) =>
			g.ingredientId !== guide.ingredientId &&
			!g.perennial &&
			g.family !== guide.family &&
			g.where.includes(place) &&
			g.sow.includes(next) &&
			!g.indoor.length
	);
}

/** Expected harvest per crop in kg and what it would cost in the shop (€/kg supplied by caller). */
export function yieldEstimate(
	plants: { ingredientId: string; count: number }[],
	guides: GrowGuide[],
	pricePerKg: (ingredientId: string) => number | null
): { kg: number; eur: number; perCrop: { ingredientId: string; kg: number; eur: number }[] } {
	const byId = new Map(guides.map((g) => [g.ingredientId, g]));
	const perCrop = plants.flatMap(({ ingredientId, count }) => {
		const g = byId.get(ingredientId);
		if (!g) return [];
		const kg = g.yieldKg * count;
		return [{ ingredientId, kg, eur: kg * (pricePerKg(ingredientId) ?? 0) }];
	});
	return {
		kg: perCrop.reduce((a, c) => a + c.kg, 0),
		eur: perCrop.reduce((a, c) => a + c.eur, 0),
		perCrop: perCrop.sort((a, b) => b.eur - a.eur)
	};
}

/** A plan in a link: `/pestuj#zahradka=…`, readable by anyone who gets it, nothing on a server. */
export interface SharedGarden {
	place: GrowPlace;
	area: number;
	sun: GrowSun;
	level: 1 | 2 | 3;
	beds?: { name: string; width: number; depth: number; cells: Record<string, string> }[];
}

export function encodeShared(plan: SharedGarden): string {
	const bytes = new TextEncoder().encode(JSON.stringify(plan));
	let binary = '';
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeShared(text: string): SharedGarden | null {
	try {
		const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
		const raw = JSON.parse(
			new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)))
		);
		const places = ['parapet', 'balkon', 'zahrada'];
		const suns = ['slnko', 'polotien', 'tien'];
		if (
			!places.includes(raw?.place) ||
			!suns.includes(raw?.sun) ||
			![1, 2, 3].includes(raw?.level) ||
			typeof raw?.area !== 'number' ||
			!(raw.area > 0 && raw.area <= 100_000)
		) {
			return null;
		}
		const beds = Array.isArray(raw.beds)
			? raw.beds
					.filter(
						(b: Record<string, unknown>) =>
							typeof b?.name === 'string' &&
							typeof b.width === 'number' &&
							typeof b.depth === 'number' &&
							b.width > 0 &&
							b.width <= 50 &&
							b.depth > 0 &&
							b.depth <= 50 &&
							typeof b.cells === 'object' &&
							b.cells !== null
					)
					.slice(0, 30)
					.map(
						(b: {
							name: string;
							width: number;
							depth: number;
							cells: Record<string, unknown>;
						}) => ({
							name: b.name.slice(0, 60),
							width: b.width,
							depth: b.depth,
							cells: Object.fromEntries(
								Object.entries(b.cells).filter(
									([k, v]) =>
										/^\d+,\d+$/.test(k) && typeof v === 'string' && /^[a-z0-9-]{1,60}$/.test(v)
								)
							) as Record<string, string>
						})
					)
			: undefined;
		return {
			place: raw.place,
			area: raw.area,
			sun: raw.sun,
			level: raw.level,
			...(beds && { beds })
		};
	} catch {
		return null;
	}
}

/** Beds are drawn on a grid of 30 cm squares (square-foot gardening). */
export const CELL_M = 0.3;

export interface Bed {
	id: string;
	name: string;
	width: number;
	depth: number;
	/** "col,row" → ingredient id. */
	cells: Record<string, string>;
	/** Families grown here in earlier years, newest last – for rotation. */
	past: { year: number; families: string[] }[];
}

export function bedSize(bed: Pick<Bed, 'width' | 'depth'>): { cols: number; rows: number } {
	return {
		cols: Math.max(1, Math.round(bed.width / CELL_M)),
		rows: Math.max(1, Math.round(bed.depth / CELL_M))
	};
}

/** How many plants of a crop fit in one square: 16 radishes, 1 kale, ⅑ of a courgette. */
export function plantsPerCell(spacingCm: number): number {
	if (spacingCm <= 0) return 16;
	return Math.min(16, (CELL_M * 100) ** 2 / spacingCm ** 2);
}

export function bedPlants(
	bed: Pick<Bed, 'cells'>,
	guides: GrowGuide[]
): { ingredientId: string; cells: number; count: number; cellsPerPlant: number }[] {
	const byId = new Map(guides.map((g) => [g.ingredientId, g]));
	const cells = new Map<string, number>();
	for (const id of Object.values(bed.cells)) cells.set(id, (cells.get(id) ?? 0) + 1);
	return [...cells].map(([ingredientId, n]) => {
		const ppc = plantsPerCell(byId.get(ingredientId)?.spacing ?? 30);
		return {
			ingredientId,
			cells: n,
			count: Math.floor(n * ppc + 1e-9),
			cellsPerPlant: Math.ceil(1 / ppc - 1e-9)
		};
	});
}

export interface BedWarning {
	kind: 'neighbours' | 'rotation' | 'space';
	text: string;
	cells: string[];
}

/** Bad neighbours side by side, the same family as last year, and big plants without room. */
export function bedWarnings(bed: Bed, guides: GrowGuide[]): BedWarning[] {
	const byId = new Map(guides.map((g) => [g.ingredientId, g]));
	const warnings: BedWarning[] = [];
	const clash = new Map<string, Set<string>>();
	for (const [key, id] of Object.entries(bed.cells)) {
		const [c, r] = key.split(',').map(Number);
		for (const [dc, dr] of [
			[1, 0],
			[0, 1]
		]) {
			const other = bed.cells[`${c + dc},${r + dr}`];
			if (!other || other === id) continue;
			const bad = byId.get(id)?.avoid.includes(other) || byId.get(other)?.avoid.includes(id);
			if (!bad) continue;
			const pair = [id, other].sort().join('|');
			if (!clash.has(pair)) clash.set(pair, new Set());
			clash
				.get(pair)!
				.add(key)
				.add(`${c + dc},${r + dr}`);
		}
	}
	for (const [pair, cells] of clash) {
		const [a, b] = pair.split('|').map((id) => byId.get(id)?.name ?? id);
		warnings.push({
			kind: 'neighbours',
			text: `${a} a ${b} vedľa seba sa neznášajú.`,
			cells: [...cells]
		});
	}

	const last = bed.past.at(-1);
	if (last) {
		const repeated = new Map<string, string[]>();
		for (const [key, id] of Object.entries(bed.cells)) {
			const family = byId.get(id)?.family;
			if (family && last.families.includes(family) && !byId.get(id)?.perennial) {
				repeated.set(family, [...(repeated.get(family) ?? []), key]);
			}
		}
		for (const [family, cells] of repeated) {
			warnings.push({
				kind: 'rotation',
				text: `Čeľaď ${family} tu rástla aj v roku ${last.year} – daj ju radšej na iný záhon.`,
				cells
			});
		}
	}

	for (const p of bedPlants(bed, guides)) {
		if (p.count === 0) {
			warnings.push({
				kind: 'space',
				text: `${byId.get(p.ingredientId)?.name ?? p.ingredientId} potrebuje aspoň ${p.cellsPerPlant} políčok na jednu rastlinu.`,
				cells: Object.entries(bed.cells)
					.filter(([, id]) => id === p.ingredientId)
					.map(([k]) => k)
			});
		}
	}
	return warnings;
}

/** Drops a planner combination into the free squares: tall crops in the northern rows first. */
export function fillWithCombo(bed: Bed, combo: GrowCombo, guides: GrowGuide[]): Bed {
	const { cols, rows } = bedSize(bed);
	const spacing = new Map(guides.map((g) => [g.ingredientId, g.spacing]));
	const free: string[] = [];
	for (let r = 0; r < rows; r++)
		for (let c = 0; c < cols; c++) if (!bed.cells[`${c},${r}`]) free.push(`${c},${r}`);
	const members = [...combo.members].sort(
		(a, b) => Number(TALL.has(b.ingredientId)) - Number(TALL.has(a.ingredientId))
	);
	const cells = { ...bed.cells };
	for (const m of members) {
		const need = Math.ceil(m.count / plantsPerCell(spacing.get(m.ingredientId) ?? 30) - 1e-9);
		for (const key of free.splice(0, need)) cells[key] = m.ingredientId;
	}
	return { ...bed, cells };
}

/** Starts a new season: remembers which families grew here and clears the squares. */
export function newSeason(bed: Bed, guides: GrowGuide[], year: number): Bed {
	const byId = new Map(guides.map((g) => [g.ingredientId, g]));
	const families = [
		...new Set(
			Object.values(bed.cells)
				.map((id) => byId.get(id)?.family)
				.filter((f) => f !== undefined)
		)
	];
	const kept = Object.fromEntries(
		Object.entries(bed.cells).filter(([, id]) => byId.get(id)?.perennial)
	);
	return { ...bed, cells: kept, past: [...bed.past, { year, families }].slice(-5) };
}
