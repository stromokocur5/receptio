import { formatAmount } from './amounts';
import { normalizeSearch } from './labels';
import type { Ingredient, RecipeLine, Unit } from './types';

export interface StepTimer {
	/** As written in the step, e.g. "8–10 minút". */
	label: string;
	/** Shortest duration of a range: check early rather than burn it. */
	seconds: number;
}

export type StepSegment = { text: string } | { text: string; timer: StepTimer };

/** Longer waits (soaking, fermenting) aren't something to watch on a phone. */
export const MAX_TIMER_SECONDS = 3 * 60 * 60;

const UNIT_SECONDS: [RegExp, number][] = [
	[/^sek/, 1],
	[/^min/, 60],
	[/^hod/, 3600]
];

const TIME_RE =
	/(\d+(?:[.,]\d+)?)(?:\s*[–-]\s*(\d+(?:[.,]\d+)?))?\s*(sekúnd|sekundy|sekundu|minút(?:ach|y|u)?|min|hodín|hodiny|hodinu|hodinách|hod)(?![\p{L}])|pol\s+(minúty|minútu|hodiny|hodinu)(?![\p{L}])/giu;

function unitSeconds(unit: string): number {
	const lower = unit.toLowerCase();
	return UNIT_SECONDS.find(([re]) => re.test(lower))?.[1] ?? 60;
}

/** Splits a step into plain text and durations that can start a timer ("duste 20 minút"). */
export function splitStep(step: string): StepSegment[] {
	const segments: StepSegment[] = [];
	let last = 0;
	for (const match of step.matchAll(TIME_RE)) {
		const [label, from, , unit, halfUnit] = match;
		const seconds = halfUnit
			? unitSeconds(halfUnit) / 2
			: Number(from.replace(',', '.')) * unitSeconds(unit);
		if (!(seconds > 0) || seconds > MAX_TIMER_SECONDS) continue;
		if (match.index > last) segments.push({ text: step.slice(last, match.index) });
		segments.push({ text: label, timer: { label, seconds: Math.round(seconds) } });
		last = match.index + label.length;
	}
	if (last < step.length) segments.push({ text: step.slice(last) });
	return segments;
}

const GLYPHS: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };
const NUMBER = String.raw`\d+(?:[.,]\d+)?(?:\/\d+)?|[½¼¾⅓⅔]|pol`;
/** Amounts written in steps ("2 PL oleja", "½ ČL soli", "v 500 ml vody"); times and °C don't match. */
const STEP_AMOUNT_RE = new RegExp(
	String.raw`(?<![\p{L}\d,.])(${NUMBER})(?:\s*[–-]\s*(${NUMBER}))?\s*(kg|g|ml|l|PL|ČL|hrnček(?:och|mi|a|y|ov|u)?)(?![\p{L}])`,
	'gu'
);
const STEP_UNITS: Record<string, Unit> = { kg: 'kg', g: 'g', ml: 'ml', l: 'l', PL: 'pl', ČL: 'čl' };

function stepNumber(text: string): number {
	if (text === 'pol') return 0.5;
	if (text in GLYPHS) return GLYPHS[text];
	if (text.includes('/')) {
		const [a, b] = text.split('/').map(Number);
		return a / b;
	}
	return Number(text.replace(',', '.'));
}

/** "1,5 hrnčeka", "3 hrnčeky", "5 hrnčekov". */
function cupWord(amount: number): string {
	if (!Number.isInteger(Math.round(amount * 100) / 100)) return 'hrnčeka';
	if (amount === 1) return 'hrnček';
	return amount < 5 ? 'hrnčeky' : 'hrnčekov';
}

/** The number part only: "1½", "250", "0,3". */
function scaledNumber(amount: number, unit: string): string {
	const formatted = formatAmount(amount, unit.startsWith('hrnček') ? 'hrnček' : STEP_UNITS[unit]);
	return formatted.slice(0, formatted.lastIndexOf(' '));
}

/**
 * Rescales amounts in a step's text for a different number of servings, so "na 2 PL oleja"
 * reads "na 1 PL oleja" when cooking half. Times, temperatures and counts stay as written.
 */
export function scaleStep(step: string, factor: number): string {
	if (factor === 1) return step;
	return step.replace(
		STEP_AMOUNT_RE,
		(match, from: string, to: string | undefined, unit: string) => {
			const low = stepNumber(from) * factor;
			const high = to === undefined ? low : stepNumber(to) * factor;
			if (!(low > 0) || !(high > 0)) return match;
			const number =
				to === undefined
					? scaledNumber(low, unit)
					: `${scaledNumber(low, unit)}–${scaledNumber(high, unit)}`;
			// Nominative-like forms follow the number; "v 2 hrnčekoch" / "v 1 hrnčeku" keep their case.
			let word = unit;
			if (/^hrnček(a|y|ov)?$/.test(unit)) word = cupWord(high);
			else if (unit === 'hrnčekoch' || unit === 'hrnčeku')
				word = high === 1 ? 'hrnčeku' : 'hrnčekoch';
			return `${number} ${word}`;
		}
	);
}

/**
 * Slovak inflects nouns (cibuľa → cibuľu, cícer → cíceru), so match on a stem: short words
 * lose their last letter, longer ones two, never going below three letters.
 */
function stem(word: string): string {
	if (word.length <= 3) return word;
	return word.slice(0, Math.max(3, word.length - (word.length <= 5 ? 1 : 2)));
}

const WORD_RE = /[\p{L}]+/gu;
/** Adjectives (olivový, sušené, čerstvá…) describe many ingredients, so they don't identify one. */
const ADJECTIVE_END = /[ýáéíú]$/;

function words(text: string): string[] {
	return normalizeSearch(text).match(WORD_RE) ?? [];
}

interface NameWord {
	word: string;
	stem: string;
	/** Words in parentheses count a bit less than the name itself. */
	penalty: number;
}

function nameWords(text: string, penalty: number): NameWord[] {
	const all = (text.toLowerCase().match(WORD_RE) ?? []).filter((w) => w.length >= 3);
	const nouns = all.filter((w) => !ADJECTIVE_END.test(w));
	// "Sójové zrná": when every word looks like an adjective, keep them all.
	return (nouns.length ? nouns : all).map((w) => {
		const word = normalizeSearch(w);
		return { word, stem: stem(word), penalty };
	});
}

function commonPrefix(a: string, b: string): number {
	let i = 0;
	while (i < a.length && i < b.length && a[i] === b[i]) i++;
	return i;
}

/**
 * How well a step word matches a name word: 0 when the stem doesn't match, otherwise the
 * shared prefix, with ties going to the closer word length (cibuľu → cibuľa, cibuľky → cibuľka).
 */
function matchWeight(stepWord: string, name: NameWord): number {
	if (!stepWord.startsWith(name.stem)) return 0;
	const lengthGap = Math.abs(stepWord.length - name.word.length);
	return commonPrefix(stepWord, name.word) - name.penalty - Math.min(lengthGap, 9) * 0.01;
}

/** Nouns of an ingredient name, including the parenthesized alias ("Rasca rímska (kmín)"). */
function ingredientWords(name: string): NameWord[] {
	const [main, ...aliases] = name.split('(');
	return [...nameWords(main, 0), ...nameWords(aliases.join(' '), 0.5)];
}

/**
 * Recipe lines an instruction mentions. Each word of the step goes to the ingredient that
 * matches it most closely (ties keep all, e.g. "papriky" → sladká and údená paprika).
 */
export function stepLines(
	step: string,
	lines: RecipeLine[],
	byId: Map<string, Ingredient>
): RecipeLine[] {
	const candidates = lines.map((line) => ({
		line,
		names: ingredientWords(byId.get(line.ingredientId)?.name ?? '')
	}));
	const found = new Set<RecipeLine>();
	for (const word of words(step)) {
		let best = 0;
		let matches: RecipeLine[] = [];
		for (const { line, names } of candidates) {
			const weight = Math.max(0, ...names.map((n) => matchWeight(word, n)));
			if (weight === 0 || weight < best) continue;
			if (weight > best) matches = [];
			best = weight;
			matches.push(line);
		}
		for (const line of matches) found.add(line);
	}
	return lines.filter((line) => found.has(line));
}

/**
 * Guides for techniques a step names without a telling ingredient. Guides tied to ingredients
 * (ryža, strukoviny, cibuľa…) come from the ingredients the step mentions.
 */
const TECHNIQUE_GUIDES: [RegExp, string][] = [
	[/\bvyprazaj|\bvyprazanie/, 'vyprazanie'],
	[/\bkysnut|\bpodkysn/, 'kysnute-cesto'],
	[/skrob\w* rozmiesan|rozmiesan\w* .*skrob|zapraz/, 'zahustovanie'],
	[/\bolup|\bosup/, 'supanie'],
	[/\bdochut/, 'dochucovanie'],
	[/\bzavar|\bvyparen\w* pohar/, 'zavaranie'],
	[/\bblansir/, 'mrazenie-urody'],
	[/\bsus\w* .*(v rure|v susick|pri \d+ °c)/, 'susenie'],
	[/\bnalev/, 'nakladana-zelenina'],
	[/\bkvas(i|ia|it|enie)\b/, 'fermentacia'],
	[/\bpec\w* .*na \d+ °c/, 'pecenie-zeleniny'],
	[
		/\b(spen|restuj|orestuj|dus|sced|spar|zredukuj|odstav|prived\w* do varu|prelisuj|vyslahaj|dotiah)/,
		'slovnik'
	]
];

/**
 * Guides that help with one step: those of the ingredients it mentions (when the recipe links
 * them) plus technique guides whose words appear in it. Returns guide slugs in a stable order.
 */
export function stepGuides(
	step: string,
	needed: RecipeLine[],
	byId: Map<string, Ingredient>,
	recipeGuides: string[]
): string[] {
	const text = normalizeSearch(step);
	const fromIngredients = needed.flatMap((line) => byId.get(line.ingredientId)?.howto ?? []);
	const fromTechnique = TECHNIQUE_GUIDES.filter(([re]) => re.test(text)).map(([, slug]) => slug);
	const wanted = new Set([
		...fromIngredients.filter((slug) => recipeGuides.includes(slug)),
		...fromTechnique
	]);
	return [...wanted];
}

export function formatDuration(totalSeconds: number): string {
	const s = Math.max(0, Math.ceil(totalSeconds));
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const sec = String(s % 60).padStart(2, '0');
	return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

export const STEP_ACTIVITIES = [
	'namacanie',
	'krajanie',
	'strukanie',
	'mixovanie',
	'miesenie',
	'restovanie',
	'pecenie',
	'varenie',
	'miesanie',
	'chladenie',
	'podavanie'
] as const;
export type StepActivity = (typeof STEP_ACTIVITIES)[number];

/**
 * What the cook is doing in a step, for the little animated scene in cook mode. The first
 * match in this order wins, so "restuj a potom varte" shows the pan, the thing done first.
 */
const ACTIVITY_PATTERNS: [StepActivity, RegExp][] = [
	['namacanie', /\bnamo[čc]|zalej .*vodou a nechaj/i],
	['mixovanie', /mix(uj|ér|eri)|rozmixuj|tyčov/i],
	['strukanie', /nastr[úu]haj|strúhadl|nastrúhan/i],
	['miesenie', /\bmies\b|vymies|vyvaľkaj|valčekom|cesto .*(rozvaľ|vykrajuj)/i],
	['restovanie', /restuj|orestuj|opekaj|opeč|osmaž|zapeč na panvici|panvic|wok|vypráž/i],
	['pecenie', /\bpeč|upeč|rúr[ey]|plech/i],
	['varenie', /\bvar(te|i|)\b|uvar|povar|prived do varu|duste|dus |zovri|vriac/i],
	['krajanie', /nakrájaj|nasekaj|pokrájaj|na kocky|na plátky|nadrobno|prekroj/i],
	['chladenie', /chladničk|vychlaď|vychladnúť|stuhn|zamraz/i],
	['miesanie', /zmiešaj|premiešaj|vmiešaj|rozmiešaj|šľahaj|primiešaj|spoj/i],
	['podavanie', /podávaj|posyp|ozdob|dochuť|servíruj/i]
];

export function stepActivity(step: string): StepActivity {
	return ACTIVITY_PATTERNS.find(([, re]) => re.test(step))?.[0] ?? 'miesanie';
}
