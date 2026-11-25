/** Where pages of the old app went, so old links and search results don't end on a 404. */
const SECTIONS: [RegExp, string][] = [
	[/^\/(plan|zoznam)(\/|$)/, '/tyzden'],
	[/^\/(spajza|vybavenie|suroviny)(\/|$)/, '/kuchyna'],
	[
		/^\/(recepty|kuchyne|sezona|zvysky|kurz|ceny|wiki|pestuj|moje|domacnost|navrhni|o-projekte|sukromie)(\/|$)/,
		'/'
	]
];

/** The new place of an old path, or null when the path is still served. */
export function legacyTarget(pathname: string, dishIds: Set<string>): string | null {
	const recipe = /^\/recepty\/([a-z0-9-]+)\/?$/.exec(pathname);
	if (recipe && dishIds.has(recipe[1])) return `/jedlo/${recipe[1]}`;
	return SECTIONS.find(([re]) => re.test(pathname))?.[1] ?? null;
}
