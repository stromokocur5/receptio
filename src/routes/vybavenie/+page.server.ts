import { getContent } from '$lib/server/content';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	const { equipment, recipes } = getContent();
	return {
		equipment: equipment.map((tool) => ({
			...tool,
			recipeCount: recipes.filter((r) => r.equipment.includes(tool.id)).length
		}))
	};
};
