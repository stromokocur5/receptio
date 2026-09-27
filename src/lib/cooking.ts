import { normalizeSearch } from './labels';
import type { Ingredient, RecipeLine } from './types';

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
