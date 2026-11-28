import { formatAmount, toGrams } from './amounts';
import { emptyNutrients } from './nutrition';
import type { Part, PartFacts, PartKind, PartStep, Style } from './dish';
import type { UnitPrice } from './plate-shopping';
import type {
	Allergen,
	GlutenStatus,
	Ingredient,
	IngredientLite,
	Nutrients,
	RecipeLine,
	Unit
} from './types';

export const TECHNIQUES = ['wok', 'plech', 'hrniec', 'polievka', 'salat'] as const;
export type Technique = (typeof TECHNIQUES)[number];

export const GROUPS = ['bielkovina', 'zelenina', 'listy', 'aroma'] as const;
export type Group = (typeof GROUPS)[number];

export interface Amount {
	amount: number;
	unit: Unit;
}

export interface ComposerIngredient {
	id: string;
	group: Group;
	/** Per person; missing = a share of the vegetables. */
	portion?: Amount;
	cut: string;
	prepMin: number;
	/** Soaks in soy sauce before cooking (tofu, tempeh). */
	season: boolean;
	/** Extra liquid it drinks up while cooking, per person (lentils). */
	liquid?: Amount;
	/** Minutes per technique; absent = doesn't suit it. */
	times: Partial<Record<Exclude<Technique, 'salat'>, number>>;
	/** How it's cut for a salad, or null when it doesn't go raw. */
	raw: string | null;
}

export interface FlavorBase {
	id: string;
	name: string;
	/** How a step mentions it, amounts for two: "2 PL sójovej omáčky, … a 3 PL vody". */
	text: string;
	techniques: Technique[];
	style: Style[];
	/** The soup is blended smooth at the end. */
	blend: boolean;
	/** Per person. */
	lines: { ingredientId: string; amount: Amount | null }[];
}

/** What the browser needs of an ingredient to price and weigh a composed recipe. */
export interface ComposerNutrition {
	per100g: Nutrients;
	density: number;
	gluten: GlutenStatus;
	allergens: Allergen[];
}

export interface ComposerData {
	techniques: Record<Technique, { name: string; about: string }>;
	ingredients: Record<string, ComposerIngredient>;
	bases: Record<string, FlavorBase>;
	toppings: Record<string, Amount>;
	nutrition: Record<string, ComposerNutrition>;
}

export interface Composition {
	technique: Technique;
	items: string[];
	base: string;
	toppings: string[];
}

/** Grams of vegetables per person, shared by however many were picked. */
const VEG_PER_PERSON = 220;
const MIN_VEG = 50;
const SERVINGS = 2;
const ID_PREFIX = 'x';

/** "x.wok.sojovo-zazvorova.tofu-natural+mrkva.sezam": fits a URL and names the recipe. */
export function encodeComposition(c: Composition): string {
	return [ID_PREFIX, c.technique, c.base, c.items.join('+'), c.toppings.join('+') || '-'].join('.');
}

export function isComposedId(id: string): boolean {
	return id.startsWith(`${ID_PREFIX}.`);
}

/** Back from an id, keeping only what the data still knows. */
export function decodeComposition(id: string, data: ComposerData): Composition | null {
	const [prefix, technique, base, items = '', toppings = ''] = id.split('.');
	if (prefix !== ID_PREFIX || !(TECHNIQUES as readonly string[]).includes(technique)) return null;
	const t = technique as Technique;
	if (!data.bases[base]?.techniques.includes(t)) return null;
	const okItems = items
		.split('+')
		.filter((i) => data.ingredients[i] && suits(data.ingredients[i], t))
		.slice(0, 12);
	if (!okItems.length) return null;
	const okToppings = toppings
		.split('+')
		.filter((i) => data.toppings[i])
		.slice(0, 5);
	return { technique: t, items: okItems, base, toppings: okToppings };
}

export function suits(ingredient: ComposerIngredient, technique: Technique): boolean {
	return technique === 'salat'
		? ingredient.raw !== null
		: ingredient.times[technique] !== undefined;
}

/** "Červená fazuľa sterilizovaná (scedená)" → "červená fazuľa". */
export function shortName(name: string): string {
	return name
		.replace(/\s*\(.*?\)/g, '')
		.replace(
			/\s+(sterilizovan\S*|čerstv\S*|mrazen\S*|natural|such\S*|mlet\S*|sušen\S*|jódovan\S*|plnotučn\S*|šalátov\S*)/gi,
			''
		)
		.trim()
		.toLowerCase();
}

/** Plural neuters that look feminine ("semienka", "tekvicové semienka"). */
const NOT_FEMININE = /(semienka|vajcia)$/;

/** Accusative for the steps ("opekaj papriku"): feminine -a → -u, -á → -ú. */
export function accusative(name: string): string {
	if (NOT_FEMININE.test(name)) return name;
	return name
		.split(' ')
		.map((w) => (/á$/.test(w) ? w.replace(/á$/, 'ú') : /[^i]a$/.test(w) ? w.replace(/a$/, 'u') : w))
		.join(' ');
}

/** "1 minútu", "3 minúty", "8 minút". */
export function minutesText(n: number): string {
	return `${n} ${n === 1 ? 'minútu' : n < 5 ? 'minúty' : 'minút'}`;
}

const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const list = (names: string[]) =>
	names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} a ${names.at(-1)}`;

function grams(id: string, amount: Amount, lite: IngredientLite, n: ComposerNutrition): number {
	return toGrams(amount.amount, amount.unit, {
		...lite,
		density: n.density
	} as unknown as Ingredient);
}

/** Steps in the order they're done, with times, burners and the oven. */
function stepsFor(c: Composition, data: ComposerData, name: (id: string) => string): PartStep[] {
	const step = (text: string, min: number, extra: Partial<PartStep> = {}): PartStep => ({
		text,
		min: Math.max(1, Math.round(min)),
		free: false,
		pause: false,
		...extra
	});
	const ing = (id: string) => data.ingredients[id];
	const base = data.bases[c.base];
	const items = c.items.map(ing);
	const protein = items.filter((i) => i.group === 'bielkovina');
	const aroma = items.filter((i) => i.group === 'aroma');
	const veg = items.filter((i) => i.group === 'zelenina' || i.group === 'listy');
	const seasoned = protein.filter(
		(p) => p.season && c.technique !== 'hrniec' && c.technique !== 'polievka'
	);
	const steps: PartStep[] = [];

	// Cutting, all in one go.
	const cuts = items.map((i) => {
		const cut = c.technique === 'salat' && i.raw ? i.raw : i.cut;
		return `${name(i.id)} ${cut}`;
	});
	const prepMin = items.reduce((s, i) => s + i.prepMin, 0);
	steps.push(step(`Priprav suroviny: ${cuts.join('; ')}.`, Math.max(2, prepMin)));

	if (seasoned.length) {
		steps.push(
			step(
				`${cap(list(seasoned.map((p) => name(p.id))))} premiešaj s 1 PL sójovej omáčky a nechaj 10 minút nasiaknuť – inak ostane vnútri bez chuti.`,
				1
			),
			step('Nechaj postáť.', 9, { free: true })
		);
	}

	const toppingText = c.toppings.length
		? ` Posyp ${list(c.toppings.map((t) => accusative(shortName(name(t)))))}.`
		: '';
	const minutes = (i: ComposerIngredient) =>
		c.technique === 'salat' ? 0 : (i.times[c.technique as Exclude<Technique, 'salat'>] ?? 0);

	/** "Pridaj mrkvu. Po 1 minúte pridaj papriku…": longest first, all done together. */
	function staged(group: ComposerIngredient[], verb: string, total: number): string {
		const sorted = [...group].sort((a, b) => minutes(b) - minutes(a));
		let text = '';
		let elapsed = 0;
		sorted.forEach((g, i) => {
			const wait = total - minutes(g) - elapsed;
			const n = accusative(name(g.id));
			if (i === 0) text += `${verb} ${n}`;
			else if (wait <= 0) text += `, hneď aj ${n}`;
			else {
				text += `. Po ${wait} ${wait === 1 ? 'minúte' : 'minútach'} pridaj ${n}`;
				elapsed += wait;
			}
		});
		return text;
	}

	switch (c.technique) {
		case 'wok': {
			steps.push(step(`V miske zmiešaj omáčku: ${base.text}.`, 2));
			const crisp = protein.filter((p) => (p.times.wok ?? 0) >= 5);
			const tossed = [...protein.filter((p) => !crisp.includes(p)), ...veg];
			if (crisp.length) {
				steps.push(
					step(
						`Vo woku alebo veľkej panvici rozohrej 1 PL oleja na veľkom ohni a ${list(crisp.map((p) => accusative(name(p.id))))} opekaj ${minutesText(Math.max(...crisp.map(minutes)))}, kým nie je dozlatista. Vyber na tanier.`,
						Math.max(...crisp.map(minutes)),
						{ on: 'platna', pause: true }
					)
				);
			}
			const onion = aroma.filter((a) => a.id === 'cibula');
			const quick = aroma.filter((a) => a.id !== 'cibula');
			const vegTime = Math.max(0, ...tossed.map(minutes), ...onion.map(minutes));
			if (vegTime) {
				steps.push(
					step(
						`${staged([...onion, ...tossed], crisp.length ? 'Pridaj ešte 1 PL oleja a' : 'Vo woku rozohrej 1 PL oleja na veľkom ohni a pridaj', vegTime)} a opekaj spolu ${minutesText(vegTime)} bez veľkého miešania, nech chytí farbu, ale ostane chrumkavá.`,
						vegTime,
						{ on: 'platna', pause: !crisp.length }
					)
				);
			}
			if (quick.length) {
				steps.push(
					step(
						`Pridaj ${list(quick.map((a) => accusative(name(a.id))))} a 30 sekúnd miešaj, kým nezavonia.`,
						1,
						{ on: 'platna' }
					)
				);
			}
			steps.push(
				step(
					`${crisp.length ? `Vráť ${list(crisp.map((p) => accusative(name(p.id))))}, omáčku` : 'Omáčku'} v miske premiešaj (škrob klesne ku dnu), vlej do woku a minútu prehadzuj, kým nezhustne a nezaleskne sa.${toppingText}`,
					2,
					{ on: 'platna' }
				)
			);
			break;
		}
		case 'plech': {
			const all = [...protein, ...veg, ...aroma.filter((a) => a.id === 'cibula')];
			const garlic = aroma.some((a) => a.id === 'cesnak');
			const spice = base.text;
			// Longest first; the rest join the tray when their own time is left.
			const times = [...new Set(all.map(minutes))].sort((a, b) => b - a);
			times.forEach((t, k) => {
				const group = list(all.filter((x) => minutes(x) === t).map((x) => accusative(name(x.id))));
				const until = t - (times[k + 1] ?? 0);
				const text =
					k === 0
						? `${cap(group)} premiešaj na plechu s papierom na pečenie s olejom${garlic ? ', prelisovaným cesnakom' : ''} a ${spice} a peč v rúre na 220 °C ${minutesText(until)}.`
						: `Pridaj na plech ${group}, premiešaj s olejom na plechu a peč ďalších ${minutesText(until)}.`;
				steps.push(step(text, until, { on: 'rura', temp: 220, free: true, hands: 1 }));
			});
			steps[steps.length - 1].text += ` Hotové je, keď má zelenina hnedé okraje.${toppingText}`;
			break;
		}
		case 'hrniec':
		case 'polievka': {
			const onion = aroma.filter((a) => a.id === 'cibula');
			const quick = aroma.filter((a) => a.id !== 'cibula');
			const fat = base.lines.find((l) => /olej/.test(l.ingredientId));
			steps.push(
				step(
					onion.length
						? `V hrnci rozohrej ${fat ? 'olej' : 'trochu oleja'} na strednom ohni a cibuľu opekaj 6 minút, kým nezmäkne.`
						: `V hrnci rozohrej ${fat ? 'olej' : 'trochu oleja'} na strednom ohni.`,
					onion.length ? 6 : 1,
					{ on: 'platna', pause: true }
				)
			);
			const spices = base.lines
				.map((l) => l.ingredientId)
				.filter((id) =>
					/korenie|kurkuma|kmin|koriander|garam|paprika|rasca|pretlak|oregano|majoranka/.test(id)
				);
			if (quick.length || spices.length) {
				steps.push(
					step(
						`Pridaj ${list([...quick.map((a) => accusative(name(a.id))), ...spices.map((s) => accusative(shortName(name(s))))])} a minútu miešaj – korenie nesmie zhorknúť.`,
						1,
						{ on: 'platna' }
					)
				);
			}
			const liquids = [base.text];
			const extraWater = protein.some((p) => p.liquid);
			const cooked = [...protein, ...veg].sort((a, b) => minutes(b) - minutes(a));
			const total = Math.max(...cooked.map(minutes));
			const first = cooked.filter((x) => minutes(x) === total);
			steps.push(
				step(
					`Prilej ${list([...liquids, ...(extraWater ? ['vodu na šošovicu'] : [])])}, pridaj ${list(first.map((f) => accusative(name(f.id))))}, priveď do varu a var prikryté na miernom ohni.`,
					2,
					{ on: 'platna' }
				)
			);
			let done = 0;
			const later = cooked.filter((x) => !first.includes(x));
			const times = [...new Set(later.map(minutes))].sort((a, b) => b - a);
			for (const t of times) {
				const wait = total - t - done;
				if (wait > 0)
					steps.push(
						step(`Var ${wait} ${wait === 1 ? 'minútu' : 'minút'}.`, wait, {
							on: 'platna',
							free: true
						})
					);
				done += Math.max(0, wait);
				const group = later.filter((x) => minutes(x) === t);
				steps.push(
					step(`Pridaj ${list(group.map((g) => accusative(name(g.id))))} a premiešaj.`, 1, {
						on: 'platna'
					})
				);
				done += 1;
			}
			const rest = total - done;
			if (rest > 0)
				steps.push(
					step(`Var ešte ${rest} ${rest === 1 ? 'minútu' : 'minút'}, kým všetko nezmäkne.`, rest, {
						on: 'platna',
						free: true
					})
				);
			if (base.blend) {
				steps.push(
					step('Polievku rozmixuj tyčovým mixérom dohladka. Ak je hustá, prilej vodu.', 3, {
						on: 'mixer'
					})
				);
			}
			const sour = base.lines.find((l) => /citron|limetka/.test(l.ingredientId));
			const juice = sour
				? ` a ${sour.ingredientId === 'limetka' ? 'limetkovou' : 'citrónovou'} šťavou`
				: '';
			const salty =
				c.technique === 'polievka' ? 'vývar je slaný, preto najprv ochutnaj' : 'najprv ochutnaj';
			steps.push(step(`Dochuť soľou${juice} – ${salty}.${toppingText}`, 1));
			break;
		}
		case 'salat': {
			steps.push(step(`V miske vyšľahaj dresing: ${base.text}.`, 2));
			steps.push(
				step(
					`Všetko premiešaj s dresingom tesne pred jedením, nech zelenina nepustí vodu.${toppingText}`,
					2
				)
			);
			break;
		}
	}
	return steps;
}

/**
 * A recipe put together from ingredients: amounts per person, the steps in order with their
 * times, and the facts a serving gives – a part like any other on the plate.
 */
export function composePart(
	c: Composition,
	data: ComposerData,
	byId: Map<string, IngredientLite>,
	prices: Record<string, UnitPrice>,
	kind: PartKind = 'hlavne'
): Part {
	const base = data.bases[c.base];
	const name = (id: string) => shortName(byId.get(id)?.name ?? id);
	const items = c.items.map((i) => data.ingredients[i]);
	const vegCount = items.filter((i) => i.group === 'zelenina' && !i.portion).length;
	const vegShare = Math.max(MIN_VEG, Math.round(VEG_PER_PERSON / Math.max(1, vegCount) / 10) * 10);

	const lines: RecipeLine[] = [];
	const add = (id: string, amount: Amount | null, note?: string) => {
		const lite = byId.get(id);
		const n = data.nutrition[id];
		if (!lite || !n) return;
		const total = amount ? { amount: amount.amount * SERVINGS, unit: amount.unit } : null;
		lines.push({
			ingredientId: id,
			grams: total ? grams(id, total, lite, n) : 0,
			amount: total?.amount ?? null,
			unit: total?.unit ?? null,
			...(note && { note })
		});
	};
	for (const i of items) add(i.id, i.portion ?? { amount: vegShare, unit: 'g' }, i.cut);
	for (const i of items) if (i.liquid) add('voda', i.liquid, 'na šošovicu');
	for (const l of base.lines) add(l.ingredientId, l.amount);
	const seasoned = items.some(
		(i) => i.season && c.technique !== 'hrniec' && c.technique !== 'polievka'
	);
	if (seasoned) add('sojova-omacka', { amount: 0.5, unit: 'pl' }, 'na bielkovinu');
	if (c.technique === 'wok') add('olej', { amount: 1, unit: 'pl' }, 'na opekanie');
	for (const t of c.toppings) add(t, data.toppings[t], 'navrch');

	const facts = factsOf(lines, data, prices);
	const steps = stepsFor(c, data, name);
	const title = `${data.techniques[c.technique].name}: ${list(items.filter((i) => i.group !== 'aroma').map((i) => name(i.id)))}`;
	const needs =
		c.technique === 'plech'
			? ['rura' as const]
			: base.blend
				? [['tycovy-mixer', 'mixer'] as ['tycovy-mixer', 'mixer']]
				: [];
	return {
		id: encodeComposition(c),
		name: title,
		description: `${base.name}. Poskladané zo surovín podľa teba.`,
		kind,
		style: base.style,
		servings: SERVINGS,
		methods: [{ label: data.techniques[c.technique].name, needs, steps, lines, ...facts }],
		early: c.technique === 'salat',
		tips: []
	};
}

const GLUTEN_RANK: Record<GlutenStatus, number> = { free: 0, risk: 1, contains: 2 };

function factsOf(
	lines: RecipeLine[],
	data: ComposerData,
	prices: Record<string, UnitPrice>
): PartFacts {
	const perServing = emptyNutrients();
	let cost = 0;
	let estimate = false;
	let gluten: GlutenStatus = 'free';
	const allergens = new Set<Allergen>();
	for (const l of lines) {
		const n = data.nutrition[l.ingredientId];
		for (const k of Object.keys(perServing) as (keyof Nutrients)[]) {
			perServing[k] += (n.per100g[k] * l.grams) / 100 / SERVINGS;
		}
		const price = prices[l.ingredientId];
		cost += ((price?.perKg ?? 0) * l.grams) / 1000;
		if (!price || price.estimate) estimate = true;
		if (GLUTEN_RANK[n.gluten] > GLUTEN_RANK[gluten]) gluten = n.gluten;
		for (const a of n.allergens) allergens.add(a);
	}
	return {
		perServing,
		costPerServing: cost / SERVINGS,
		costIsEstimate: estimate,
		gluten,
		allergens: [...allergens].sort(),
		treat: perServing.kcal > 900 ? ['kalorie'] : []
	};
}

/** "200 g tofu" for the composer's preview list. */
export function amountText(line: RecipeLine): string {
	return formatAmount(line.amount, line.unit);
}
