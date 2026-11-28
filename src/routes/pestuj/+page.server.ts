import { getContent } from '$lib/server/content';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	const { grow, growCombos, notGrown } = getContent();
	return { grow, growCombos, notGrown };
};
