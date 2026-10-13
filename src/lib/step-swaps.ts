/**
 * Rewrites recipe steps for a version where ingredients were swapped (onion → green onion tops,
 * garlic → garlic oil), so the steps don't tell you to fry an onion the list no longer has.
 * Slovak inflects, so each rule maps the case endings it meets in the recipes.
 */

interface Rule {
	pattern: RegExp;
	replace: (match: string, ...groups: string[]) => string;
}

const L = '\\p{L}';
const word = (body: string) => new RegExp(`(?<!${L})${body}(?!${L})`, 'giu');
/** Only the start has to be a word boundary (the match ends inside a phrase). */
const start = (body: string) => new RegExp(`(?<!${L})${body}`, 'giu');
/** "so sójovým" but "s kokosovým": the vowel was there only for the s- or z- that follows. */
const looseVowel = (before: string): Rule => ({
	pattern: start(`([sz])o (?=${before})`),
	replace: (_m, p) => `${p} `
});
const byEnding =
	(forms: Record<string, string>) =>
	(_match: string, ending = '') =>
		forms[ending.toLowerCase()] ?? forms[''];

const GREEN_ONION: Record<string, string> = {
	'': 'zelenú cibuľku',
	a: 'zelená cibuľka',
	// "cibule"/"cibuľky" is mostly "speň cibule" (accusative); genitives are caught first.
	e: 'zelenú cibuľku',
	i: 'zelenej cibuľke',
	u: 'zelenú cibuľku',
	ou: 'zelenou cibuľkou',
	y: 'zelenú cibuľku',
	om: 'zelenou cibuľkou'
};

const ONION_RULES: Rule[] = [
	// The white part is exactly what has to go.
	{
		pattern: start(`biel${L}* čas${L}* (?:jarn${L}* )?cibu${L}*`),
		replace: () => 'zelenú cibuľku'
	},
	// "polovicu cibule", "bez cibule": these stay in the genitive.
	{
		pattern: start(
			`((?:z|zo|bez|do|od|polovic${L}|štvrť|kúsok|kúsky|čas${L}*|trochu|zvyš${L}*|vrstv${L}*)\\s+)(?:jarn${L}{1,3}\\s+)?cibu(?:ľk|ľ|l)(?:e|y)(?!${L})`
		),
		replace: (_m, before) => `${before}zelenej cibuľky`
	},
	// "jarnú cibuľku" → "zelenú cibuľku".
	{ pattern: start(`jarn(á|ej|ú|ou)( cibuľk)`), replace: (_m, e, rest) => `zelen${e}${rest}` },
	// The colour of the onion doesn't carry over to the green tops.
	{ pattern: start(`(?:červen|biel|žlt)${L}{1,3} (?=cibu)`), replace: () => '' },
	{ pattern: word(`(?<!zelen${L}{1,3} )cibuľk(a|y|e|u|ou)`), replace: byEnding(GREEN_ONION) },
	{ pattern: word(`cibu(?:ľ|l)(a|e|i|u|ou)`), replace: byEnding(GREEN_ONION) }
];

const FRY = '(?:speň|opeč|opekaj|orestuj|restuj|opraž|dus)';
const FRY_TIME =
	'\\s\\d+(?:–\\d+)?\\s+minút\\p{L}*(?:\\s+(?:dozlatista|do zlatista|do sklovita|do mäkka|dotmava))?';
/**
 * Green tops burn in the minutes an onion needs to soften, so where they're fried on their own
 * the time goes down to a minute. With other vegetables in the pan the time stays theirs.
 */
const GREEN_ONION_COOKING: Rule[] = [
	{ pattern: start(`([sz]) (?=zelen${L}{1,3} cibuľk)`), replace: (_m, p) => `${p}o ` },
	// "…dozlatista, trvá to asi 8 minút a je to základ chuti" was about the onion.
	{
		pattern: new RegExp(
			`(zelen${L}{1,3} cibuľk${L}*[^.]*?),\\s*trvá to (?:asi |aspoň |zhruba )?\\d+(?:–\\d+)? minút[^.]*`,
			'giu'
		),
		replace: (_m, before) => before
	},
	{
		pattern: start(`(pridaj zelenú cibuľku a )\\d+(?:–\\d+)?\\s+minút${L}*`),
		replace: (_m, before) => `${before}1 minútu`
	},
	{
		pattern: start(`(${FRY}\\s+zelenú cibuľku)(?! a)(?!,)([^,.]*?)${FRY_TIME}`),
		replace: (_m, verb, rest) => `${verb}${rest} 1 minútu`
	},
	{
		pattern: new RegExp(
			`(?<=^|[.!?]\\s+)(zelenú cibuľku)(?! a)([^,.]*?\\s${FRY}(?!${L})[^,.]*?)${FRY_TIME}`,
			'giu'
		),
		replace: (_m, onion, rest) => `${onion}${rest} 1 minútu`
	},
	{
		pattern: start(
			`(zelen${L}{1,3} cibuľk${L}*[^.,]*?)(?<!minút${L}{0,2})\\s(?:dozlatista|do zlatista|dotmava)`
		),
		replace: (_m, rest) => `${rest} krátko`
	}
];

const BEANS_TO_CHICKPEAS: Rule[] = [
	{ pattern: start(`biel${L}{1,3} (?=fazu)`), replace: () => '' },
	// Beans are feminine, chickpeas masculine: "namočenú fazuľu" → "namočený cícer".
	{
		pattern: start(`(?!čiern)(${L}+)[úá] (?=fazu(?:ľ|l)[ua](?!${L}))`),
		replace: (_m, stem) => `${stem}ý `
	},
	// Black beans next to the white ones stay what they are.
	{
		pattern: word(`(?<!čiern${L}{1,3} )fazu(?:ľ|l)(a|e|i|u|ou)`),
		replace: byEnding({ a: 'cícer', e: 'cíceru', i: 'cíceri', u: 'cícer', ou: 'cícerom' })
	},
	// …and so do the pronouns after it in the sentence: "pridaj cícer, roztlač ju".
	{
		pattern: new RegExp(`(cícer[^.]*?)(?<!${L})(ju|sama|nej)(?!${L})`, 'giu'),
		replace: (_m, before, pronoun) =>
			before +
			({ ju: 'ho', sama: 'sám', nej: 'neho' } as Record<string, string>)[pronoun.toLowerCase()]
	}
];

const SWAP_RULES: Record<string, Rule[]> = {
	cibula: [...ONION_RULES, ...GREEN_ONION_COOKING],
	'cibula-cervena': [...ONION_RULES, ...GREEN_ONION_COOKING],
	'jarna-cibulka': [...ONION_RULES, ...GREEN_ONION_COOKING],
	por: [{ pattern: word(`pór(u|om|e)?`), replace: byEnding(GREEN_ONION) }, ...GREEN_ONION_COOKING],
	cesnak: [
		looseVowel('strúčik'),
		{
			pattern: word(`strúčik(y|ov|om|mi)? cesnaku`),
			replace: byEnding({
				'': 'cesnak',
				y: 'cesnak',
				ov: 'cesnaku',
				om: 'cesnakom',
				mi: 'cesnakom'
			})
		},
		// Garlic oil isn't pressed, chopped, counted or fried golden – it's warmed and added.
		{
			pattern: start(
				`(?:prelisovan|pretlačen|nakrájan|nasekan|nastrúhan|rozdrven|rozpolen|rozpučen|olúpan|roztlačen)${L}{1,4} (?=cesnak)`
			),
			replace: () => ''
		},
		{
			pattern: start(
				`(?:\\d+|jeden|jedným|jednu|dva|dvoma|dvomi|tri|troma|štyri|pár)\\s+(?=cesnak(?:u|om)?(?!${L}))`
			),
			replace: () => ''
		},
		{
			pattern: start(
				`(?:prelisuj|nasekaj|nakrájaj|pretlač|nastrúhaj|rozdrv|ošúp)(?=\\s+cesnak(?!${L}))`
			),
			replace: () => 'pridaj'
		},
		{
			pattern: start(`(cesnak(?:${L}{0,2})?\\s+)(?:pretlač|prelisuj|nasekaj)(?=[,.;]|$)`),
			replace: (_m, garlic) => `${garlic}pridaj`
		},
		{
			pattern: start(`(?:opeč|opraž|speň|orestuj|osmaž)(?=\\s+cesnak(?!${L}))`),
			replace: () => 'zohrej'
		},
		// "druhý strúčik" was one of several; the oil is just what's left.
		{
			pattern: start(`(?:druh|posledn)(ý|ým|ého)(?= cesnak)`),
			replace: (_m, ending) => `zvyšn${ending}`
		},
		{
			pattern: word(`cesnak(u|om)?`),
			replace: byEnding({ '': 'cesnakový olej', u: 'cesnakového oleja', om: 'cesnakovým olejom' })
		}
	],
	sampinony: [
		looseVowel('šampiň'),
		{
			pattern: word(`šampiňón(y|ov|mi|och|om|u)?`),
			replace: byEnding({
				'': 'hlivu',
				y: 'hlivu',
				ov: 'hlivy',
				mi: 'hlivou',
				och: 'hlive',
				om: 'hlivou',
				u: 'hlivu'
			})
		}
	],
	'sojove-mlieko': [
		looseVowel(`sójov${L}{1,3} (?:mliek|nápoj)`),
		{
			pattern: word(`sójov(é|ého|ým|om) mliek(o|a|om|u)`),
			replace: byEnding({
				'': 'ryžový nápoj',
				é: 'ryžový nápoj',
				ého: 'ryžového nápoja',
				ým: 'ryžovým nápojom',
				om: 'ryžovom nápoji'
			})
		},
		{ pattern: start(`sójov(${L}{1,3} nápoj)`), replace: (_m, rest) => `ryžov${rest}` }
	],
	// The beans that aren't fine in any amount give way to ones that are in a small one.
	'fazula-cervena': [
		{ pattern: start(`červen(${L}{1,3} fazu)`), replace: (_m, rest) => `čiern${rest}` }
	],
	'fazula-cervena-sucha': [
		{ pattern: start(`červen(${L}{1,3} fazu)`), replace: (_m, rest) => `čiern${rest}` }
	],
	'fazula-biela': BEANS_TO_CHICKPEAS,
	'fazula-biela-sucha': BEANS_TO_CHICKPEAS,
	// Cashews don't decline, so the case comes from the word before them.
	kesu: [
		{
			pattern: start(`so? ((?:${L}+ými )?)kešu(?: orech${L}*)?(?!${L})`),
			replace: (_m, adjective) => `so ${adjective}slnečnicovými semienkami`
		},
		{
			pattern: start(`(zo?|bez|do|od|zrnk${L}*|kúsk${L}*) kešu(?: orech${L}*)?(?!${L})`),
			replace: (_m, before) => `${/^zo?$/i.test(before) ? 'zo' : before} slnečnicových semienok`
		},
		{ pattern: word(`kešu(?: orech${L}*)?`), replace: () => 'slnečnicové semienka' }
	],
	'sojove-granule': [
		{
			pattern: word(`(?:sójov${L}{1,3} )?gran(?:ul|úl)(e|ami|iach|ách)?`),
			replace: byEnding({
				'': 'rozdrobeného tofu',
				e: 'rozdrobené tofu',
				ami: 'rozdrobeným tofu',
				iach: 'rozdrobenom tofu',
				ách: 'rozdrobenom tofu'
			})
		}
	],
	'sojovy-jogurt': [
		looseVowel(`sójov${L}{1,3} jogurt`),
		{ pattern: start(`sójov(${L}{1,3} jogurt)`), replace: (_m, rest) => `kokosov${rest}` }
	],
	'rastlinna-smotana': [
		{
			pattern: word(`smotan(a|y|u|ou|e)`),
			replace: byEnding({
				a: 'kokosové mlieko',
				y: 'kokosového mlieka',
				u: 'kokosové mlieko',
				ou: 'kokosovým mliekom',
				e: 'kokosovom mlieku'
			})
		}
	]
};

const capitalize = (text: string) => (text ? text[0].toUpperCase() + text.slice(1) : text);
const matchCase = (original: string, replacement: string) =>
	original[0] !== original[0].toLowerCase() ? capitalize(replacement) : replacement;

/** The step with every mention of a swapped ingredient (by id) put in the replacement's words. */
export function rewriteStep(step: string, swapped: Iterable<string>): string {
	let text = step;
	for (const id of swapped) {
		for (const rule of SWAP_RULES[id] ?? []) {
			text = text.replace(rule.pattern, (match, ...args) => {
				const groups = args.slice(0, -2).map((g) => (typeof g === 'string' ? g : ''));
				return matchCase(match, rule.replace(match, ...groups));
			});
		}
	}
	// A dropped "Prelisovaný" at the start of a sentence leaves it starting in lower case.
	return text === step
		? text
		: text.replace(/(^|[.!?]\s+)(\p{Ll})/gu, (_m, gap, c) => gap + c.toUpperCase());
}
