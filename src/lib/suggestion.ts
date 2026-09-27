/** Length limits of the suggestion form, shared by the page and the API. */
export const SUGGESTION_LIMITS = {
	title: { min: 3, max: 120, label: 'Názov' },
	ingredients: { min: 10, max: 4000, label: 'Suroviny' },
	steps: { min: 10, max: 8000, label: 'Postup' },
	note: { min: 0, max: 2000, label: 'Poznámka' },
	author: { min: 0, max: 120, label: 'Meno' }
} as const;

export type SuggestionField = keyof typeof SUGGESTION_LIMITS;

/**
 * What's wrong with the filled-in form, in words a person can act on, or null. Browsers don't
 * enforce `minlength` reliably (Firefox on Android skips it), so the page checks this itself.
 */
export function suggestionProblem(form: Partial<Record<SuggestionField, unknown>>): string | null {
	for (const [field, { min, max, label }] of Object.entries(SUGGESTION_LIMITS)) {
		const value = form[field as SuggestionField];
		const text = typeof value === 'string' ? value.trim() : '';
		if (min > 0 && text.length === 0) return `${label}: toto pole je povinné.`;
		if (text.length < min) return `${label}: napíš aspoň ${min} znakov (teraz ${text.length}).`;
		if (text.length > max) return `${label}: najviac ${max} znakov (teraz ${text.length}).`;
	}
	return null;
}
