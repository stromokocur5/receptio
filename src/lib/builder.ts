import type { IconName } from './components/Icon.svelte';
import type { Choice, Dish, Part, PartKind, Style } from './dish';

export interface BuilderSlot {
	id: string;
	label: string;
	kinds: PartKind[];
	/** Shown on an empty spot of the plate. */
	hint: string;
	icon: IconName;
}

/** The four spots of the plate, in the order they're usually picked. */
export const BUILDER_SLOTS: BuilderSlot[] = [
	{
		id: 'hlavne',
		label: 'Hlavná časť',
		kinds: ['hlavne', 'bielkovina'],
		hint: 'tofu, strukoviny, kari',
		icon: 'bean'
	},
	{
		id: 'zaklad',
		label: 'Základ',
		kinds: ['priloha', 'pecivo'],
		hint: 'ryža, zemiaky, chlieb',
		icon: 'wheat'
	},
	{ id: 'zelenina', label: 'Zelenina', kinds: ['zelenina'], hint: 'šalát, pečená', icon: 'salad' },
	{ id: 'omacka', label: 'Omáčka', kinds: ['omacka', 'navrch'], hint: 'dip, navrch', icon: 'drop' }
];

export const FREE_DISH_ID = 'vlastne';

/** A dish whose slots hold every part of their kinds, all empty to start with. */
export function freeDish(parts: Part[]): Dish {
	return {
		id: FREE_DISH_ID,
		name: 'Vlastný tanier',
		description: 'Poskladané z častí podľa teba.',
		meals: ['obed', 'vecera'],
		servings: 2,
		free: true,
		slots: BUILDER_SLOTS.map((slot) => ({
			id: slot.id,
			label: slot.label,
			options: parts
				.filter((p) => slot.kinds.includes(p.kind))
				.sort((a, b) => a.name.localeCompare(b.name, 'sk'))
				.map((p) => p.id),
			optional: true
		})),
		finish: [
			{
				text: 'Všetko nalož na tanier vedľa seba, omáčku navrch alebo do misky bokom.',
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
	for (const slot of BUILDER_SLOTS) {
		const optional = slot.id === 'zelenina' || slot.id === 'omacka';
		const styles = plateStyles(picked);
		const list = (candidates[slot.id] ?? []).filter((c) => c.cookable && fits(c.part, styles));
		// A soup or a curry is a meal of its own: a base or a salad is a bonus, not a must.
		const complete = picked.some((p) => p.kind === 'hlavne');
		const chosen = (optional || complete) && random() < 0.3 ? undefined : pick(list);
		choice[slot.id] = chosen?.part.id ?? null;
		if (chosen) picked.push(chosen.part);
	}
	return choice;
}
