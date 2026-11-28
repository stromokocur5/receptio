/**
 * Searches that found no recipe are sent anonymously, so the missing recipes can be written.
 * Only plain words go: anything that could be a contact or a code (an e-mail, a phone number,
 * a long number) is never sent, and the server checks the same.
 */
export const MAX_TERM_LENGTH = 60;

export function cleanSearchTerm(raw: string): string | null {
	const term = raw.toLowerCase().replace(/\s+/g, ' ').trim();
	if (term.length < 2 || term.length > MAX_TERM_LENGTH) return null;
	if (!/^[\p{L}\p{N} '’-]+$/u.test(term)) return null;
	if ((term.match(/\d/g) ?? []).length >= 4) return null;
	return term;
}
