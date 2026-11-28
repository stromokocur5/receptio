import { formatEur, formatNumber } from './amounts';

/** A notification the service worker shows as it is. */
export interface DigestText {
	title: string;
	body: string;
	url: string;
}

/**
 * What the page leaves for the service worker: the week's summary and an overview for each of the
 * coming days, written whenever the app is open. The push itself carries nothing.
 */
export interface DigestStore {
	weekly: boolean;
	morning: boolean;
	/** For the week starting on this Monday. */
	week: { start: string; text: DigestText } | null;
	/** ISO date → that morning's overview; a day with nothing planned has none. */
	days: Record<string, DigestText>;
}

const plural = (n: number, one: string, few: string, many: string) =>
	n === 1 ? one : n > 1 && n < 5 ? few : many;

export interface WeekNumbers {
	cooked: number;
	cost: number;
	plants: number;
	plantGoal: number;
	proteinPerDay: number;
	proteinGoal: number;
	/** Spent on shopping this week and the weekly budget, when one is set. */
	spent: number | null;
	budget: number | null;
	/** On sale in the user's shops among what they usually buy: "tofu −30 % (Lidl)". */
	sales?: string[];
}

export function weeklyDigest(n: WeekNumbers): DigestText {
	const parts: string[] = [];
	if (n.cooked) {
		parts.push(
			`Uvarené ${n.cooked}× za ${formatEur(n.cost)}, ${formatNumber(n.plants, 0)} z ${n.plantGoal} rastlín`
		);
		parts.push(
			`bielkoviny ${formatNumber(n.proteinPerDay, 0)} g na deň (cieľ ${formatNumber(n.proteinGoal, 0)} g)`
		);
	} else {
		parts.push('Tento týždeň nie je nič označené ako uvarené');
	}
	if (n.budget !== null && n.spent !== null) {
		parts.push(
			n.spent <= n.budget
				? `nákupy ${formatEur(n.spent)} z ${formatEur(n.budget)}`
				: `nákupy ${formatEur(n.spent)}, nad rozpočtom o ${formatEur(n.spent - n.budget)}`
		);
	}
	// Sunday is when the next week gets planned: what's cheaper now is worth planning around.
	const sales = n.sales?.length ? `\nV akcii z toho, čo kupuješ: ${n.sales.join(', ')}` : '';
	return {
		title: 'Tvoj týždeň v Receptiu',
		body: `${parts.join(' · ')}. Naplánuj si ďalší týždeň.${sales}`,
		url: '/plan#navrh'
	};
}

export interface DayNumbers {
	/** "Obed: Chana masala (uvariť)" … */
	meals: string[];
	/** Recipes to move from the freezer to the fridge today, for tomorrow. */
	thaw: string[];
	/** Fresh food at home that should be cooked soon. */
	useSoon: string[];
	/** Their ingredient ids, for the link to recipes that use them up. */
	useSoonIds?: string[];
	/** A recipe that uses them up: one planned for the day if any, else the best match. */
	cookIt?: string | null;
	/** Planned ingredients on sale in the user's shops. */
	sales: string[];
}

/** The morning overview, or null when there's nothing worth a notification. */
export function morningDigest(d: DayNumbers): DigestText | null {
	const lines: string[] = [];
	if (d.meals.length) lines.push(d.meals.join(' · '));
	if (d.thaw.length) lines.push(`Vyber z mrazničky na zajtra: ${d.thaw.join(', ')}`);
	if (d.useSoon.length) {
		lines.push(`Minie sa: ${d.useSoon.join(', ')}${d.cookIt ? ` – čo tak ${d.cookIt}?` : ''}`);
	}
	if (d.sales.length) lines.push(`V akcii z plánu: ${d.sales.join(', ')}`);
	if (!lines.length) return null;
	const count = d.meals.length;
	if (!count && d.useSoon.length) {
		// Nothing planned: the food about to spoil is the news, and the tap finds it a recipe.
		return {
			title: `Minie sa ${d.useSoon[0]}${d.useSoon.length > 1 ? ' a ďalšie' : ''}`,
			body: lines.join('\n'),
			url: d.useSoonIds?.length ? `/zvysky?s=${d.useSoonIds.join(',')}` : '/spajza'
		};
	}
	return {
		title: count
			? `Dnes ${count} ${plural(count, 'jedlo', 'jedlá', 'jedál')} z plánu`
			: 'Dobré ráno',
		body: lines.join('\n'),
		url: '/plan#rozpis'
	};
}
