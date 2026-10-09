import { planLines, type PlanEntry } from './shopping';
import type { Ingredient, RecipeSummary } from './types';

/** One recipe in a cooking session: when to start it, counted from the moment you begin. */
export interface PrepSlot {
	entry: PlanEntry;
	recipe: RecipeSummary;
	/** Minutes from the start of the session. */
	start: number;
	end: number;
}

export interface PrepSchedule {
	slots: PrepSlot[];
	/** Minutes for everything, cooked in this order. */
	total: number;
	/** Minutes when cooked one after another. */
	oneByOne: number;
}

/** The recipe as the planned variant is cooked: its own time and preparation ahead, when it has them. */
export function asPlanned(recipe: RecipeSummary, variantName?: string): RecipeSummary {
	const variant = variantName ? recipe.variants.find((v) => v.name === variantName) : undefined;
	if (!variant) return recipe;
	return {
		...recipe,
		time: variant.time ?? recipe.time,
		activeTime: variant.activeTime ?? recipe.activeTime,
		ahead: variant.ahead === undefined ? recipe.ahead : (variant.ahead ?? undefined)
	};
}

/** Hands-off minutes: simmering, baking, resting. */
const passive = (r: RecipeSummary) => r.time - r.activeTime;

/**
 * Orders recipes so the long hands-off ones (a stew that simmers an hour) start first and the
 * quick ones fill that waiting time. The cook works on one thing at a time, so each recipe starts
 * when the hands-on part of the previous one is done.
 */
export function prepSchedule(items: { entry: PlanEntry; recipe: RecipeSummary }[]): PrepSchedule {
	const ordered = [...items].sort(
		(a, b) => passive(b.recipe) - passive(a.recipe) || b.recipe.time - a.recipe.time
	);
	let busyUntil = 0;
	const slots = ordered.map(({ entry, recipe }) => {
		const start = busyUntil;
		busyUntil += recipe.activeTime;
		return { entry, recipe, start, end: start + recipe.time };
	});
	return {
		slots,
		total: Math.max(0, ...slots.map((s) => s.end)),
		oneByOne: items.reduce((sum, { recipe }) => sum + recipe.time, 0)
	};
}

export interface PrepItem {
	ingredient: Ingredient;
	grams: number;
	/** Titles of the recipes that use it. */
	usedIn: string[];
}

/** Vegetables, fruit and herbs are what gets washed and chopped – do it once for everything. */
const CHOPPED = new Set(['zelenina', 'ovocie']);

export function prepList(
	items: { entry: PlanEntry; recipe: RecipeSummary }[],
	byId: Map<string, Ingredient>
): PrepItem[] {
	const found = new Map<string, PrepItem>();
	for (const { entry, recipe } of items) {
		const factor = entry.servings / recipe.servings;
		for (const line of planLines(recipe, entry.variant)) {
			const ingredient = byId.get(line.ingredientId);
			if (!ingredient || !CHOPPED.has(ingredient.category) || line.grams <= 0) continue;
			const item = found.get(ingredient.id) ?? { ingredient, grams: 0, usedIn: [] };
			item.grams += line.grams * factor;
			if (!item.usedIn.includes(recipe.title)) item.usedIn.push(recipe.title);
			found.set(ingredient.id, item);
		}
	}
	// What several recipes share first – that's where cooking together saves the most.
	return [...found.values()].sort(
		(a, b) =>
			b.usedIn.length - a.usedIn.length || a.ingredient.name.localeCompare(b.ingredient.name, 'sk')
	);
}

/** "1 h 25 min", "40 min". */
export function formatMinutes(minutes: number): string {
	const h = Math.floor(minutes / 60);
	const m = Math.round(minutes % 60);
	if (!h) return `${m} min`;
	return m ? `${h} h ${m} min` : `${h} h`;
}

/** One day of eating a batch: where that day's boxes come from. */
export interface BatchDay {
	/** 0 = the day you cook. */
	day: number;
	from: 'fridge' | 'freezer';
	/** Starts a new batch: cooked that day, because the last one wouldn't keep. */
	cook: boolean;
}

export interface BatchPlan {
	days: BatchDay[];
	/** Portions to cook in each session, in order. */
	batches: number[];
	fridge: number;
	freezer: number;
}

/**
 * How a recipe cooked once covers several days: the first days from the fridge as long as it
 * keeps there, the rest frozen – or, when it doesn't freeze, cooked again. Null when it has to
 * be eaten fresh.
 */
export function batchPlan(
	keeps: { fridge: number; freezer: number } | undefined,
	days: number,
	perDay: number
): BatchPlan | null {
	if (!keeps || keeps.fridge < 1 || days < 1 || perDay < 1) return null;
	const out: BatchDay[] = [];
	const batches: number[] = [];
	let cookedOn = 0;
	for (let day = 0; day < days; day++) {
		const fresh = day - cookedOn < keeps.fridge;
		if (fresh || keeps.freezer > 0) {
			out.push({ day, from: fresh ? 'fridge' : 'freezer', cook: day === 0 });
		} else {
			cookedOn = day;
			out.push({ day, from: 'fridge', cook: true });
		}
		if (out[day].cook) batches.push(0);
		batches[batches.length - 1] += perDay;
	}
	const frozenDays = out.filter((d) => d.from === 'freezer').length;
	return {
		days: out,
		batches,
		fridge: (days - frozenDays) * perDay,
		freezer: frozenDays * perDay
	};
}

const FRESH_HERBS = new Set([
	'bylinky-koriander',
	'bylinky-mata',
	'petrzlenova-vnat',
	'kopor',
	'bazalka',
	'pazitka'
]);
const TORTILLAS = new Set(['kukuricne-tortilly', 'psenicne-tortilly']);
/** Dishes with a sauce or broth that would soak into rice or pasta packed with them. */
const SAUCY = ['polievky/', 'hlavne/kari', 'hlavne/strukoviny', 'omacky/omacky'];
const CRISPY = ['comfort/vyprazane', 'hlavne/tofu', 'comfort/kebab'];

/**
 * How to pack this dish into boxes so it's still good on day three: what to keep apart, what to
 * add only when eating, how to freeze it. The most specific advice first.
 */
export function packingTips(
	recipe: Pick<RecipeSummary, 'categories' | 'lines' | 'keeps' | 'title'>,
	byId: Map<string, Ingredient>
): string[] {
	const has = (prefixes: string[]) =>
		recipe.categories.some((c) => prefixes.some((p) => c.startsWith(p)));
	const ids = new Set(recipe.lines.map((l) => l.ingredientId));
	const grains = recipe.lines.some((l) => byId.get(l.ingredientId)?.category === 'obilniny');
	const tips: string[] = [];

	if (has(['salaty/'])) {
		tips.push(
			'Dresing na dno pohára alebo do malej nádobky, naň strukoviny a obilniny, listy úplne navrch. Premiešaš až pri jedle – listy nezvädnú.'
		);
	}
	if (has(SAUCY) && grains) {
		tips.push(
			'Prílohu (ryžu, cestoviny) daj do inej krabičky alebo do dózy s prepážkou – v omáčke napučí a rozvarí sa.'
		);
	} else if (has(SAUCY)) {
		tips.push(
			'Do dóz s pevným vekom, ktoré netečú – omáčka a polievka sa v taške vylejú najľahšie.'
		);
	}
	if (has(CRISPY) || /chrumkav|vyprážan|falafel/i.test(recipe.title)) {
		tips.push(
			'Chrumkavé kúsky zabaľ zvlášť a nezatváraj ich, kým sú teplé – para ich zmäkčí. Zohrej ich v rúre alebo na suchej panvici, nie v mikrovlnke.'
		);
	}
	if ([...TORTILLAS].some((id) => ids.has(id))) {
		tips.push(
			'Tortilly zabaľ zvlášť (do papiera alebo utierky) a plň ich až pri jedle, inak premoknú.'
		);
	}
	if (ids.has('avokado'))
		tips.push('Avokádo krájaj až pri jedle – v krabičke zhnedne za pár hodín.');
	if ([...FRESH_HERBS].some((id) => ids.has(id)) || ids.has('citron') || ids.has('limetka')) {
		tips.push('Čerstvé bylinky a šťavu z citróna pridaj až pri jedle, vydržia tak voňavé.');
	}
	if (recipe.categories.some((c) => c.startsWith('ranajky/kase'))) {
		tips.push('Kašu na noc rob rovno v pohári s vekom; ovocie a orechy navrch až ráno.');
	}
	if ((recipe.keeps?.freezer ?? 0) > 0) {
		tips.push(
			has(SAUCY)
				? 'Do mrazničky nechaj v dóze 2 cm voľného miesta (tekutina zamrznutím zväčší objem), alebo mraz naplocho vo vrecku – rozmrazí sa rýchlejšie.'
				: 'Do mrazničky po porciách, každú zvlášť – vyberieš len toľko, koľko zješ.'
		);
	}
	tips.push(
		'Do práce: ak budeš na ceste viac ako 2 hodiny, daj krabičku do chladiacej tašky s vreckom ľadu.'
	);
	return tips;
}
