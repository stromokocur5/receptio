import { describe, expect, it } from 'vitest';
import { getContent } from './content';

describe('content', () => {
	const content = getContent();

	it('compiles every recipe with resolvable ingredients', () => {
		expect(content.recipes.length).toBeGreaterThan(0);
		for (const r of content.recipes) {
			expect(r.perServing.kcal, r.id).toBeGreaterThan(0);
			expect(r.costPerServing, r.id).toBeGreaterThan(0);
		}
	});

	it('produces plausible nutrition per serving', () => {
		for (const r of content.recipes) {
			expect(r.perServing.kcal, r.id).toBeLessThan(1500);
			expect(r.perServing.salt, r.id).toBeLessThan(6);
		}
	});

	it('derives gluten status from ingredients', () => {
		const pasta = content.recipeDetails.get('pasta-e-ceci')!;
		expect(pasta.gluten).toBe('contains');
		expect(pasta.gfSwappable).toBe(true);

		const teriyaki = content.recipeDetails.get('teriyaki-tofu')!;
		expect(teriyaki.gluten).toBe('contains');
		expect(teriyaki.gfSwappable).toBe(true);

		expect(content.recipeDetails.get('chana-masala')!.gluten).toBe('free');
	});

	it('links beginner guides from ingredients', () => {
		const dal = content.recipeDetails.get('kokosovy-dal')!;
		expect(dal.howto.map((h) => h.slug)).toContain('ryza');
		expect(dal.howto.map((h) => h.slug)).toContain('strukoviny');
	});

	it('uses only known cuisines and has wiki pages in every section', () => {
		const ids = new Set(content.cuisines.map((c) => c.id));
		for (const r of content.recipes) expect(ids.has(r.cuisine), r.id).toBe(true);
		const sections = new Set(content.wiki.map((w) => w.section));
		expect([...sections].sort()).toEqual(['navody', 'suplementy', 'zaklady']);
	});
});
