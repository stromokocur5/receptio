import type { IconName } from './components/Icon.svelte';
import type { Taste } from './types';

export interface RecipeCategory {
	label: string;
	/** One line under the label on the category tiles. */
	blurb: string;
	icon: IconName;
	tone: string;
	subs: Record<string, string>;
}

/**
 * What kind of dish a recipe is, for browsing. `meals` stays the "when do I eat it" used by
 * the plan; a recipe lists one or more `category/sub` pairs, the first one is its home.
 */
export const RECIPE_CATEGORIES = {
	ranajky: {
		label: 'Raňajky',
		blurb: 'Kaše, palacinky aj slané',
		icon: 'sunrise',
		tone: 'var(--turmeric)',
		subs: {
			kase: 'Kaše, müsli a pudingy',
			palacinky: 'Palacinky a placky',
			slane: 'Slané raňajky'
		}
	},
	polievky: {
		label: 'Polievky',
		blurb: 'Krémové, husté aj vývary',
		icon: 'soup',
		tone: 'var(--tomato)',
		subs: {
			kremove: 'Krémové',
			zeleninove: 'Zeleninové a vývarové',
			strukovinove: 'Strukovinové, husté a guláše',
			azijske: 'Ázijské a rezancové'
		}
	},
	hlavne: {
		label: 'Hlavné jedlá',
		blurb: 'Kari, cestoviny, ryža, tofu…',
		icon: 'pot',
		tone: 'var(--leaf)',
		subs: {
			kari: 'Kari a dusené',
			strukoviny: 'Strukoviny a daly',
			cestoviny: 'Cestoviny a rezance',
			ryza: 'Ryža a obilniny',
			tofu: 'Tofu, tempeh a seitan',
			zelenina: 'Zeleninové a zemiakové',
			rura: 'Z rúry a zapekané',
			plnene: 'Tortilly, burgery a sendviče',
			cesto: 'Knedle, pirohy a cesto',
			bowly: 'Misky a bowly'
		}
	},
	comfort: {
		label: 'Fast food a comfort',
		blurb: 'Kebab, burgre, hranolky, párky',
		icon: 'flame',
		tone: 'var(--tomato)',
		subs: {
			kebab: 'Kebab, gyros a wrapy',
			burgre: 'Burgre, pizza a sendviče',
			vyprazane: 'Vyprážané a hranolky',
			bufet: 'Párky, klobásy a bufet'
		}
	},
	salaty: {
		label: 'Šaláty',
		blurb: 'Sýte aj k jedlu',
		icon: 'salad',
		tone: 'var(--leaf-2)',
		subs: {
			syte: 'Sýte šaláty',
			prilohove: 'K jedlu'
		}
	},
	prilohy: {
		label: 'Prílohy a pečivo',
		blurb: 'K hlavnému jedlu',
		icon: 'bread',
		tone: 'var(--turmeric)',
		subs: {
			prilohy: 'Prílohy',
			chlieb: 'Chlieb, placky a pečivo'
		}
	},
	snacky: {
		label: 'Snacky',
		blurb: 'Slané, sladké, na cesty',
		icon: 'cookie',
		tone: 'var(--tomato)',
		subs: {
			slane: 'Slané',
			sladke: 'Sladké',
			'na-cesty': 'Na cesty a do krabičky',
			party: 'Na párty'
		}
	},
	dezerty: {
		label: 'Dezerty a pečenie',
		blurb: 'Koláče, krémy, raw',
		icon: 'cake',
		tone: 'var(--sky)',
		subs: {
			pecene: 'Koláče a pečené',
			susienky: 'Sušienky a muffiny',
			kremy: 'Krémy a pudingy',
			nepecene: 'Bez pečenia',
			smazene: 'Šišky a vyprážané'
		}
	},
	omacky: {
		label: 'Omáčky a nátierky',
		blurb: 'Dipy, dresingy, pestá',
		icon: 'bottle',
		tone: 'var(--leaf-2)',
		subs: {
			dipy: 'Dipy a nátierky',
			omacky: 'Omáčky, pestá a pasty',
			dresingy: 'Dresingy a majonézy',
			chutney: 'Salsy, chutney a nakladané'
		}
	},
	napoje: {
		label: 'Nápoje',
		blurb: 'Smoothie, limonády, teplé',
		icon: 'glass',
		tone: 'var(--sky)',
		subs: {
			smoothie: 'Smoothie a shaky',
			limonady: 'Limonády a osviežujúce',
			teple: 'Teplé nápoje',
			fermentovane: 'Fermentované',
			mlieka: 'Rastlinné mlieka'
		}
	},
	domace: {
		label: 'Urob si sám',
		blurb: 'Tofu, mlieka, syry, kimchi',
		icon: 'jar',
		tone: 'var(--leaf)',
		subs: {
			bielkoviny: 'Tofu, tempeh a seitan',
			mlieka: 'Mlieka a jogurty',
			syry: 'Syry a maslá',
			kvasene: 'Kvasené a nakladané',
			zavarane: 'Zaváraniny, džemy a sušené',
			zaklady: 'Základy a koreniny'
		}
	}
} as const satisfies Record<string, RecipeCategory>;

export type CategoryId = keyof typeof RECIPE_CATEGORIES;
export const CATEGORY_IDS = Object.keys(RECIPE_CATEGORIES) as CategoryId[];

/** "hlavne/kari" – every valid pair, for the content schema. */
export const CATEGORY_PATHS = CATEGORY_IDS.flatMap((c) =>
	Object.keys(RECIPE_CATEGORIES[c].subs).map((s) => `${c}/${s}`)
);

export function isCategoryId(id: string): id is CategoryId {
	return id in RECIPE_CATEGORIES;
}

export function splitCategory(path: string): { category: CategoryId; sub: string } {
	const [category, sub] = path.split('/');
	return { category: category as CategoryId, sub };
}

export function subLabel(path: string): string {
	const { category, sub } = splitCategory(path);
	return (RECIPE_CATEGORIES[category].subs as Record<string, string>)[sub] ?? '';
}

/** Whether a recipe is in the category, or in the sub when one is given. */
export function inCategory(categories: string[], category: string, sub = ''): boolean {
	return categories.some((path) =>
		sub ? path === `${category}/${sub}` : path.startsWith(`${category}/`)
	);
}

export const SPICY_LABELS = ['Nepálivé', 'Jemne pálivé', 'Pálivé', 'Poriadne pálivé'] as const;

export const TASTE_LABELS: Record<Taste, string> = { sladke: 'Sladké', slane: 'Slané' };

/** `null` = neither (plain milks); drinks otherwise go by what's in them. */
const TASTE_BY_CATEGORY: Record<string, Taste | null> = {
	dezerty: 'sladke',
	'snacky/sladke': 'sladke',
	'ranajky/kase': 'sladke',
	'napoje/smoothie': 'sladke',
	'napoje/limonady': 'sladke',
	polievky: 'slane',
	hlavne: 'slane',
	comfort: 'slane',
	salaty: 'slane',
	omacky: 'slane',
	'prilohy/prilohy': 'slane',
	'snacky/slane': 'slane',
	'ranajky/slane': 'slane',
	'domace/bielkoviny': 'slane',
	'domace/kvasene': 'slane',
	'domace/mlieka': null,
	'napoje/mlieka': null
};
const SWEETENERS = new Set(['cukor', 'javorovy-sirup', 'datle', 'kakao', 'horka-cokolada']);
/** Ingredient groups that make a dish savory whatever else is in it. */
const SAVORY_MARKERS = new Set([
	'cibula',
	'cesnak',
	'sojova-omacka',
	'tamari',
	'miso',
	'zeleninovy-vyvar',
	'horcica',
	'vyzivne-drozdie',
	'cili-papricka'
]);
/** Lemon and lime season savory food as often as sweet. */
const NOT_SWEET_FRUIT = new Set(['citron', 'limetka']);
/** Sugar and fruit per serving that make it a sweet dish, not a pinch in a dough. */
const SWEET_G = 8;
/** Salt per serving above a pinch; baking powder alone gives sweet pancakes ~0.4 g. */
const SAVORY_SALT_G = 0.6;

/**
 * Sweet or savory, for the taste filter. The first category that decides it wins
 * (palacinky can go either way, so they fall through to the next one; a drink never takes
 * the taste of its DIY category); otherwise the ingredients decide. Plain milks or bread
 * stay undecided.
 */
export function guessTaste(
	categories: string[],
	ingredients: { id: string; group: string; category: string; gramsPerServing: number }[],
	saltPerServing: number
): Taste | undefined {
	for (const path of categories) {
		const taste =
			path in TASTE_BY_CATEGORY ? TASTE_BY_CATEGORY[path] : TASTE_BY_CATEGORY[path.split('/')[0]];
		if (taste === null) return undefined;
		if (taste) return taste;
		if (path.startsWith('napoje/')) break;
	}
	if (ingredients.some((i) => SAVORY_MARKERS.has(i.group))) return 'slane';
	const sweetGrams = ingredients
		.filter(
			(i) => SWEETENERS.has(i.group) || (i.category === 'ovocie' && !NOT_SWEET_FRUIT.has(i.group))
		)
		.reduce((sum, i) => sum + i.gramsPerServing, 0);
	if (sweetGrams >= SWEET_G) return 'sladke';
	return saltPerServing >= SAVORY_SALT_G ? 'slane' : undefined;
}

/** `milk` is a glass of something thick and opaque – smoothies and plant milks. */
export type Vessel = 'plate' | 'glass' | 'milk' | 'mug';

/**
 * What a dish is drawn in: hot drinks in a mug, other drinks (and DIY milks) in a glass, the
 * rest on a plate. A smoothie that's also breakfast still goes in a glass.
 */
export function vesselFor(categories: string[]): Vessel {
	const drink = categories.find((c) => c.startsWith('napoje/'));
	const main = categories[0] ?? '';
	if (!drink || !(main.startsWith('napoje/') || main.startsWith('domace/'))) return 'plate';
	if (drink === 'napoje/teple') return 'mug';
	return drink === 'napoje/smoothie' || drink === 'napoje/mlieka' ? 'milk' : 'glass';
}
