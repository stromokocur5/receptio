import { normalizeSearch } from './labels';

/**
 * Cooking words recipes use as if everyone knew them, with what they mean in one sentence.
 * Same wording as the wiki page /wiki/slovnik. Patterns run on the step without diacritics.
 */
export const GLOSSARY: { term: string; pattern: RegExp; text: string }[] = [
	{
		term: 'speniť',
		pattern: /\bspen(it|te)?\b/,
		text: 'Cibuľu na oleji 3–5 minút na strednom ohni, kým nezmäkne a nie je priesvitná.'
	},
	{
		term: 'restovať',
		pattern: /\b(o)?restuj|\bopraz(it|te)?\b/,
		text: 'Krátko na vyššom ohni za stáleho miešania – cesnak a korenie 30 sekúnd až minútu.'
	},
	{
		term: 'dusiť',
		pattern: /\b(po)?dus(it|te)?\b/,
		text: 'Pod pokrievkou na miernom ohni s trochou tekutiny.'
	},
	{
		term: 'priviesť do varu',
		pattern: /\bprived\w* do varu|\bzovr/,
		text: 'Zohriať, kým to nezačne bublať; potom sa oheň zvyčajne stiahne.'
	},
	{
		term: 'mierny oheň',
		pattern: /\bna miernom ohni|\bna najmiernejsom ohni/,
		text: 'Len jemné bublinky pri okraji, nie divoký var. Na sporáku zhruba tretina výkonu.'
	},
	{
		term: 'zredukovať',
		pattern: /\bzredukuj|\bredukuje/,
		text: 'Variť bez pokrievky, kým sa tekutina neodparí a omáčka nezhustne.'
	},
	{
		term: 'odstaviť',
		pattern: /\bodstav(it|)\b/,
		text: 'Vziať hrniec alebo panvicu z platne (alebo ju vypnúť).'
	},
	{
		term: 'scediť',
		pattern: /\bsced(it|)\b/,
		text: 'Vyliať cez sitko, aby tekutina odtiekla.'
	},
	{
		term: 'spariť',
		pattern: /\bspar(it|)\b|\bblansir/,
		text: 'Na chvíľu do vriacej vody a hneď von (alebo do studenej), zelenina ostane zelená a chrumkavá.'
	},
	{
		term: 'prelisovať',
		pattern: /\bprelisuj|\bprelisovan/,
		text: 'Pretlačiť cesnak cez lis. Bez lisu ho nasekaj nadrobno alebo nastrúhaj.'
	},
	{
		term: 'vyšľahať',
		pattern: /\bvyslahaj|\bzaslahaj/,
		text: 'Rýchlo miešať metličkou alebo vidličkou, kým sa to nespojí.'
	},
	{
		term: 'dochutiť',
		pattern: /\bdochut/,
		text: 'Ochutnať a pridať soľ, kyselinu (citrón, ocot) alebo korenie, kým to nechutí výrazne.'
	},
	{
		term: 'zápražka',
		pattern: /\bzapraz/,
		text: 'Múka opražená na tuku, ktorou sa zahusťuje omáčka alebo polievka.'
	},
	{
		term: 'dozlatista',
		pattern: /\bdozlatista|\bdochrumkava/,
		text: 'Kým nie je povrch zlatohnedý a pevný – nemiešaj stále, nechaj to chytiť farbu.'
	}
];

/** Glossary entries a step uses, at most `max`, in the order of the glossary. */
export function stepTerms(step: string, max = 3) {
	const text = normalizeSearch(step);
	return GLOSSARY.filter((g) => g.pattern.test(text)).slice(0, max);
}
