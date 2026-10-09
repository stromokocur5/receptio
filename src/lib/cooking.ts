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
const WORD_NUMBERS: Record<string, number> = {
	pol: 0.5,
	jeden: 1,
	jedna: 1,
	jednu: 1,
	jedným: 1,
	jednou: 1,
	dve: 2,
	dva: 2,
	dvoma: 2,
	tri: 3,
	troma: 3,
	tromi: 3,
	štyri: 4,
	štyroch: 4,
	päť: 5,
	šesť: 6
};
const NUMBER = String.raw`\d+(?:[.,]\d+)?(?:\/\d+)?|[½¼¾⅓⅔]|${Object.keys(WORD_NUMBERS).join('|')}`;
/**
 * Amounts written in steps ("2 PL oleja", "½ čl soli", "v 1 litri vody", "štyri lyžice nálevu",
 * "3 strúčiky cesnaku"); times, °C, sizes and counts of shapes ("8 guliek") don't match.
 */
const STEP_AMOUNT_RE = new RegExp(
	String.raw`(?<![\p{L}\d,.])(${NUMBER})(?:\s*[–-]\s*(${NUMBER}))?\s*(kg|g|dl|ml|l|PL|ČL|pl|čl|hrnček(?:och|mi|a|y|ov|u)?|lit(?:er|ra|re|ri|rov|rom|rami|roch)|lyžic(?:a|u|e|ou|ami|iach|i)|lyžíc|lyžičk(?:a|u|y|ou|ami|ách|e)|lyžičiek|(?:(?:prelisovan|pretlačen|nasekan)\p{L}*\s+)?strúčik(?:y|ov|mi|om|och|u)?)(?![\p{L}])`,
	'gu'
);
const STEP_UNITS: Record<string, Unit> = { kg: 'kg', g: 'g', ml: 'ml', l: 'l', pl: 'pl', čl: 'čl' };
/** "Na každú tortillu 2 lyžice", "do každého hrnca 1 kg ryže": amounts per piece stay as they are. */
const PER_PIECE_RE = /každ\p{L}*\s[^.,;:]*$|\bpo\s+$/u;

function stepNumber(text: string): number {
	if (text in WORD_NUMBERS) return WORD_NUMBERS[text];
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

/** Garlic cloves keep the case they were written in: "s 2 strúčikmi" → "s 1 strúčikom". */
function cloveWord(written: string, count: number): string {
	const [, adjective = ''] = /^(\p{L}+)\s/u.exec(written) ?? [];
	const prefix = adjective ? `${clovesAdjective(adjective, written, count)} ` : '';
	if (/mi$|om$/.test(written)) return prefix + (count === 1 ? 'strúčikom' : 'strúčikmi');
	if (/och$|u$/.test(written)) return prefix + (count === 1 ? 'strúčiku' : 'strúčikoch');
	if (count === 1) return `${prefix}strúčik`;
	return prefix + (count < 5 ? 'strúčiky' : 'strúčikov');
}

/** "prelisované" → "prelisovaný" / "prelisovaných", agreeing with the new count. */
function clovesAdjective(adjective: string, written: string, count: number): string {
	const stem = adjective.replace(/(ý|é|ých|ými|ým)$/, '');
	if (/mi$|om$/.test(written)) return stem + (count === 1 ? 'ým' : 'ými');
	if (/och$|u$/.test(written)) return stem + (count === 1 ? 'om' : 'ých');
	if (count === 1) return `${stem}ý`;
	return stem + (count < 5 ? 'é' : 'ých');
}

/** Shapes a batch is divided into: twice the batch makes twice the balls. [1, 2–4, 5+] */
const PIECE_FORMS: string[][] = [
	['guľu', 'gule', 'gúľ'],
	['guľku', 'guľky', 'guliek'],
	['kus', 'kusy', 'kusov'],
	['guličku', 'guličky', 'guličiek'],
	['kúsok', 'kúsky', 'kúskov'],
	['placku', 'placky', 'placiek'],
	['fašírku', 'fašírky', 'fašírok'],
	['kôpku', 'kôpky', 'kôpok'],
	['formu', 'formy', 'foriem'],
	['košíček', 'košíčky', 'košíčkov'],
	['tyčinku', 'tyčinky', 'tyčiniek'],
	['plátok', 'plátky', 'plátkov'],
	['časť', 'časti', 'častí']
];
const PIECE_WORDS = new Map(PIECE_FORMS.flatMap((forms) => forms.map((f) => [f, forms] as const)));
const PIECES_RE = new RegExp(
	String.raw`(?<![\p{L}\d,.])(\d+)(?:\s*[–-]\s*(\d+))?\s+(${[...PIECE_WORDS.keys()].join('|')})(?![\p{L}])`,
	'gu'
);

function pieceWord(forms: string[], count: number): string {
	return count === 1 ? forms[0] : count < 5 ? forms[1] : forms[2];
}

function scalePieces(step: string, factor: number): string {
	return step.replace(PIECES_RE, (match, from, to: string | undefined, word: string, offset) => {
		// "Po 2–3 placky na panvicu", "každú rolku na 8 kúskov": per pan or per piece, not per batch.
		if (/\b[Pp]o\s+$/u.test(step.slice(0, offset)) || PER_PIECE_RE.test(step.slice(0, offset))) {
			return match;
		}
		const forms = PIECE_WORDS.get(word)!;
		const a = Math.max(1, Math.round(Number(from) * factor));
		if (to === undefined) return `${a} ${pieceWord(forms, a)}`;
		const b = Math.max(a, Math.round(Number(to) * factor));
		return a === b ? `${a} ${pieceWord(forms, a)}` : `${a}–${b} ${pieceWord(forms, b)}`;
	});
}

/** The number part only: "1½", "250", "0,3". */
function scaledNumber(amount: number, unit: Unit): string {
	const formatted = formatAmount(amount, unit);
	return formatted.slice(0, formatted.lastIndexOf(' '));
}

function unitOf(written: string): Unit | 'strúčik' {
	const lower = written.toLowerCase();
	if (lower.startsWith('hrnček')) return 'hrnček';
	if (lower.startsWith('lit')) return 'l';
	if (lower.startsWith('lyžič')) return 'čl';
	if (lower.startsWith('lyžic') || lower === 'lyžíc') return 'pl';
	if (lower.includes('strúčik')) return 'strúčik';
	if (lower === 'dl') return 'ml';
	return STEP_UNITS[lower];
}

/**
 * Rescales amounts in a step's text for a different number of servings, so "na 2 PL oleja"
 * reads "na 1 PL oleja" when cooking half. Times, temperatures and counts stay as written, and
 * so do spoons per piece ("na každú placku 2 lyžice").
 */
export function scaleStep(step: string, factor: number): string {
	if (factor === 1) return step;
	return scalePieces(step, factor).replace(
		STEP_AMOUNT_RE,
		(match, from: string, to: string | undefined, written: string, offset: number) => {
			const unit = unitOf(written);
			// "Do každého pohára 1 PL šťavy", "po 2 lyžiciach": per jar or pan, not per batch.
			if (PER_PIECE_RE.test(step.slice(0, offset))) return match;
			// Decilitres are rewritten as millilitres, so they round like any other liquid.
			const perUnit = written === 'dl' ? 100 : 1;
			const low = stepNumber(from) * factor * perUnit;
			const high = to === undefined ? low : stepNumber(to) * factor * perUnit;
			if (!(low > 0) || !(high > 0)) return match;
			if (unit === 'strúčik') {
				const a = Math.max(1, Math.round(low));
				const b = Math.max(1, Math.round(high));
				return `${a === b ? a : `${a}–${b}`} ${cloveWord(written, b)}`;
			}
			const number =
				to === undefined
					? scaledNumber(low, unit)
					: `${scaledNumber(low, unit)}–${scaledNumber(high, unit)}`;
			// Nominative-like forms follow the number; "v 2 hrnčekoch" / "v 1 hrnčeku" keep their case.
			let word: string = written;
			if (/^hrnček(a|y|ov)?$/.test(written)) word = cupWord(high);
			else if (written === 'hrnčekoch' || written === 'hrnčeku')
				word = high === 1 ? 'hrnčeku' : 'hrnčekoch';
			// Spelled-out spoons and liters change their ending with the number; the short form doesn't.
			else if (unit === 'pl' || unit === 'čl') word = unit.toUpperCase();
			else if (unit === 'l' || written === 'dl') word = written === 'dl' ? 'ml' : 'l';
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
const MOVABLE_VOWEL = /^(\p{L}*[^aeiouy])[oe]([^aeiouy])$/u;
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
	return (nouns.length ? nouns : all).flatMap((w) => {
		const word = normalizeSearch(w);
		const forms = [{ word, stem: stem(word), penalty }];
		// Slovak drops the last vowel when declining: cukor → cukrom, ocot → octom, kôpor → kôprom.
		const dropped = MOVABLE_VOWEL.exec(word);
		if (dropped) {
			const short = dropped[1] + dropped[2];
			forms.push({ word: short, stem: short, penalty });
		}
		return forms;
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

/**
 * Nouns of an ingredient name, including the parenthesized alias ("Rasca rímska (kmín)") and the
 * other names it goes by ("Sójový nápoj" is "mlieko" in the steps).
 */
function ingredientWords(ingredient: Ingredient | undefined): NameWord[] {
	if (!ingredient) return [];
	const [main, ...inParens] = ingredient.name.split('(');
	return [
		...nameWords(main, 0),
		...nameWords([...inParens, ...(ingredient.aliases ?? [])].join(' '), 0.5)
	];
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
		names: ingredientWords(byId.get(line.ingredientId))
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
	],
	[/\brur|\bplech(?!ov)/, 'rura'],
	[/nadrobno|na (kocky|platky|kolieska|mesiacik|polkolies|pruzky|tenke)/, 'krajanie'],
	[/\bwok/, 'liatina-wok'],
	[/\btlakov/, 'tlakovy-hrniec'],
	[/\bzamraz/, 'mrazenie']
];

/** Guides for techniques a step names, whatever ingredients it uses. */
export function techniqueGuides(step: string): string[] {
	const text = normalizeSearch(step);
	return TECHNIQUE_GUIDES.filter(([re]) => re.test(text)).map(([, slug]) => slug);
}

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
	const fromIngredients = needed.flatMap((line) => byId.get(line.ingredientId)?.howto ?? []);
	const wanted = new Set([
		...fromIngredients.filter((slug) => recipeGuides.includes(slug)),
		...techniqueGuides(step)
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
