import type { IconName } from './components/Icon.svelte';
import type { Choice, Dish, Part, PartKind, Style } from './dish';

export interface BuilderSlot {
	/** One of the four spots on the plate (see SPOTS in plate-art). */
	id: string;
	label: string;
	kinds: PartKind[];
	/** Shown on an empty spot of the plate. */
	hint: string;
	icon: IconName;
	/** A plate is fine without it; Prekvap ma leaves it out now and then. */
	extra: boolean;
}

export const BUILDER_MODES = ['slane', 'sladke'] as const;
export type BuilderMode = (typeof BUILDER_MODES)[number];

export const MODE_LABELS: Record<BuilderMode, string> = { slane: 'Slané', sladke: 'Sladké' };

/** The four spots of each kind of plate, in the order they're usually picked. */
export const BUILDER_SLOTS: Record<BuilderMode, BuilderSlot[]> = {
	slane: [
		{
			id: 'hlavne',
			label: 'Hlavná časť',
			kinds: ['hlavne', 'bielkovina'],
			hint: 'tofu, strukoviny, kari',
			icon: 'bean',
			extra: false
		},
		{
			id: 'zaklad',
			label: 'Základ',
			kinds: ['priloha', 'pecivo'],
			hint: 'ryža, zemiaky, chlieb',
			icon: 'wheat',
			extra: false
		},
		{
			id: 'zelenina',
			label: 'Zelenina',
			kinds: ['zelenina'],
			hint: 'šalát, pečená',
			icon: 'salad',
			extra: true
		},
		{
			id: 'omacka',
			label: 'Omáčka',
			kinds: ['omacka', 'navrch'],
			hint: 'dip, navrch',
			icon: 'drop',
			extra: true
		}
	],
	sladke: [
		{
			id: 'hlavne',
			label: 'Základ',
			kinds: ['hlavne', 'priloha'],
			hint: 'kaša, palacinky, jogurt',
			icon: 'bowl',
			extra: false
		},
		{
			id: 'zelenina',
			label: 'Ovocie',
			kinds: ['ovocie'],
			hint: 'čerstvé, teplé',
			icon: 'heart',
			extra: false
		},
		{
			id: 'zaklad',
			label: 'Navrch',
			kinds: ['navrch'],
			hint: 'orechy, vločky',
			icon: 'seed',
			extra: true
		},
		{
			id: 'omacka',
			label: 'Poleva',
			kinds: ['omacka'],
			hint: 'čokoláda, karamel',
			icon: 'drop',
			extra: true
		}
	]
};

export const FREE_DISH_IDS: Record<BuilderMode, string> = {
	slane: 'vlastne',
	sladke: 'vlastne-sladke'
};
/** The savoury free plate, the one most links go to. */
export const FREE_DISH_ID = FREE_DISH_IDS.slane;

/** Sweet parts only on a sweet plate, savoury ones only on a savoury plate. */
const inMode = (part: Part, mode: BuilderMode) =>
	part.style.includes('sladke') === (mode === 'sladke');

/** A dish whose slots hold every part of their kinds, all empty to start with. */
export function freeDish(parts: Part[], mode: BuilderMode = 'slane'): Dish {
	return {
		id: FREE_DISH_IDS[mode],
		name: mode === 'sladke' ? 'Vlastná sladká misa' : 'Vlastný tanier',
		description: 'Poskladané z častí podľa teba.',
		meals: mode === 'sladke' ? ['ranajky', 'dezert'] : ['obed', 'vecera'],
		servings: 2,
		free: true,
		slots: BUILDER_SLOTS[mode].map((slot) => ({
			id: slot.id,
			label: slot.label,
			options: parts
				.filter((p) => slot.kinds.includes(p.kind) && inMode(p, mode))
				.sort((a, b) => a.name.localeCompare(b.name, 'sk'))
				.map((p) => p.id),
			optional: true
		})),
		finish: [
			{
				text:
					mode === 'sladke'
						? 'Do misky daj základ, navrch ovocie, posyp a polej polevou.'
						: 'Všetko nalož na tanier vedľa seba, omáčku navrch alebo do misky bokom.',
				min: 2,
				free: false,
				pause: false
			}
		],
		tips: []
	};
}

/** "Chrumkavé tofu · jazmínová ryža · arašidová omáčka". */
export function plateName(parts: Part[]): string {
	return parts.map((p, i) => (i === 0 ? p.name : p.name.toLowerCase())).join(' · ');
}

/**
 * The styles a plate leans to: what all of its styled parts share, or if they share nothing,
 * everything any of them has. Parts that go with anything don't count.
 */
export function plateStyles(picked: Part[]): Set<Style> {
	const styled = picked.filter((p) => p.style.length);
	if (!styled.length) return new Set();
	const shared = styled[0].style.filter((s) => styled.every((p) => p.style.includes(s)));
	return new Set(shared.length ? shared : styled.flatMap((p) => p.style));
}

/** Sweet goes with sweet only; otherwise a shared style, or a part that goes with anything. */
export function fits(part: Part, styles: Set<Style>): boolean {
	if (!styles.size || !part.style.length) return true;
	if (styles.has('sladke') !== part.style.includes('sladke')) return false;
	return part.style.some((s) => styles.has(s));
}

/** A curated dish that holds exactly these parts, so the plate counts as tried and tested. */
export function verifiedDish(picked: Part[], dishes: Dish[]): Dish | undefined {
	if (!picked.length) return undefined;
	return dishes.find((dish) => {
		const used = new Set<string>();
		for (const part of picked) {
			const slot = dish.slots.find((s) => !used.has(s.id) && s.options.includes(part.id));
			if (!slot) return false;
			used.add(slot.id);
		}
		return dish.slots.every((s) => s.optional || used.has(s.id));
	});
}

export interface Candidate {
	part: Part;
	/** Ingredients still to buy (0 = cookable from the pantry). */
	missing: number;
	cookable: boolean;
}

/**
 * A random plate that hangs together: a main part first, then whatever fits it, preferring what
 * can be cooked from the pantry. Vegetables and sauce are left out now and then.
 */
export function surprise(
	candidates: Record<string, Candidate[]>,
	slots: BuilderSlot[] = BUILDER_SLOTS.slane,
	random: () => number = Math.random
): Choice {
	const choice: Choice = {};
	const picked: Part[] = [];
	const pick = (list: Candidate[]) => {
		if (!list.length) return undefined;
		const best = Math.min(...list.map((c) => c.missing));
		const near = list.filter((c) => c.missing <= best + 1);
		return near[Math.floor(random() * near.length)];
	};
	for (const slot of slots) {
		const optional = slot.extra;
		const styles = plateStyles(picked);
		const list = (candidates[slot.id] ?? []).filter((c) => c.cookable && fits(c.part, styles));
		// A soup or a curry is a meal of its own: a base or a salad is a bonus, not a must.
		const complete =
			slot.extra === false &&
			picked.some((p) => p.kind === 'hlavne' && !p.style.includes('sladke'));
		const chosen = (optional || complete) && random() < 0.3 ? undefined : pick(list);
		choice[slot.id] = chosen?.part.id ?? null;
		if (chosen) picked.push(chosen.part);
	}
	return choice;
}
