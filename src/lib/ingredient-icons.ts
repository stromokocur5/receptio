import type { IconName } from './components/Icon.svelte';
import type { IngredientCategory } from './types';

export const CATEGORY_ICONS: Record<IngredientCategory, IconName> = {
	zelenina: 'leaf',
	ovocie: 'heart',
	strukoviny: 'bean',
	bielkoviny: 'cube',
	obilniny: 'wheat',
	'orechy-semienka': 'spoon',
	'rastlinne-mlieka': 'drop',
	'omacky-pasty': 'jar',
	koreniny: 'spice',
	oleje: 'drop',
	nahrady: 'package',
	ine: 'package'
};
