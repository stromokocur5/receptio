import { json } from '@sveltejs/kit';
import type { DishCatalogPayload } from '$lib/dish-catalog';
import { bestPrice } from '$lib/pricing';
import { getContent } from '$lib/server/content';

export const prerender = true;

/** What the plate pages need: parts, dishes, the composer and the prices of what they use. */
export function GET() {
	const { ingredients, parts, dishes, prices, composer } = getContent();
	const today = new Date();
	const used = new Set(
		parts.flatMap((p) => p.methods.flatMap((m) => m.lines.map((l) => l.ingredientId)))
	);
	const payload: DishCatalogPayload = {
		ingredients: ingredients.map(
			({ id, name, aliases, category, group, groupFactor, staple, color, units, piece }) => ({
				id,
				name,
				...(aliases && { aliases }),
				category,
				group,
				groupFactor,
				staple,
				color,
				units,
				...(piece && { piece })
			})
		),
		parts,
		dishes,
		prices: Object.fromEntries(
			ingredients
				.filter((i) => used.has(i.id))
				.map((i) => {
					const best = bestPrice(i, prices, today);
					return [i.id, { perKg: Math.round(best.perKg * 100) / 100, estimate: best.isEstimate }];
				})
		),
		composer,
		builtAt: today.toISOString().slice(0, 10)
	};
	return json(payload);
}
