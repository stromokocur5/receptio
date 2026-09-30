import { describe, expect, it } from 'vitest';
import { CATEGORY_IDS, inCategory } from '$lib/categories';
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

	it('compiles variants and an automatic gluten-free version', () => {
		const masala = content.recipeDetails.get('tofu-butter-masala')!;
		expect(masala.usesSubstitutes).toBe(true);
		expect(masala.substitutes).toBe('optional');
		const plain = masala.variants.find((v) => v.name === 'Bez náhrad')!;
		expect(plain.usesSubstitutes).toBe(false);
		expect(plain.lines.some((l) => l.ingredientId === 'kesu')).toBe(true);
		const oil = plain.lines.filter((l) => l.ingredientId === 'olej');
		expect(oil).toHaveLength(1);
		expect(oil[0].amount).toBe(4);

		const teriyaki = content.recipeDetails.get('teriyaki-tofu')!;
		const gf = teriyaki.variants.find((v) => v.name === 'Bezlepková verzia')!;
		expect(gf.gluten).toBe('free');
		expect(gf.lines.some((l) => l.ingredientId === 'tamari')).toBe(true);

		expect(content.recipeDetails.get('pizza')!.variants.map((v) => v.name)).not.toContain(
			'Bezlepková verzia'
		);
	});

	it('offers a low-salt version of salty recipes', () => {
		const soup = content.recipeDetails.get('bun-hue-chay')!;
		const low = soup.variants.find((v) => v.name === 'Menej soli')!;
		expect(low.perServing.salt).toBeLessThan(soup.perServing.salt * 0.8);
		expect(low.description).toContain('Polovicu vývaru nahraď vodou');
		expect(low.lines.some((l) => l.ingredientId === 'voda')).toBe(true);
		expect(content.recipeDetails.get('hummus')!.variants.map((v) => v.name)).not.toContain(
			'Menej soli'
		);
	});

	it('labels comfort food "na občas" and clears it for lighter versions', () => {
		const falafel = content.recipeDetails.get('falafel')!;
		expect(falafel.treat).toContain('vyprazane');
		expect(falafel.variants.find((v) => v.name === 'Pečený v rúre')!.treat).toEqual([]);
		expect(content.recipeDetails.get('brownies')!.treat).toContain('cukor');
		expect(content.recipeDetails.get('hummus')!.treat).toEqual([]);
		// Olive oil in a slow-cooked vegetable dish isn't "added fat".
		expect(content.recipeDetails.get('imam-bayildi')!.treat).toEqual([]);
		for (const r of content.recipes.filter((r) => r.categories[0].startsWith('comfort/'))) {
			const everyday = r.treat.length === 0 || r.variants.some((v) => v.treat.length === 0);
			expect(everyday, `${r.id}: pridaj Ľahšiu verziu`).toBe(true);
		}
	});

	it('leaves not-eaten lines out of nutrition', () => {
		const seitan = content.recipeDetails.get('seitan')!;
		expect(seitan.lines.find((l) => l.ingredientId === 'zeleninovy-vyvar')?.notEaten).toBe(true);
		expect(seitan.perServing.salt).toBeLessThan(2);
	});

	it('resolves related recipes', () => {
		const milk = content.recipeDetails.get('domace-sojove-mlieko')!;
		expect(milk.related.map((r) => r.id)).toContain('domace-tofu');
		expect(milk.related.every((r) => r.title.length > 0)).toBe(true);
	});

	it('links beginner guides from ingredients', () => {
		const dal = content.recipeDetails.get('kokosovy-dal')!;
		expect(dal.howto.map((h) => h.slug)).toContain('ryza');
		expect(dal.howto.map((h) => h.slug)).toContain('strukoviny');
	});

	it('detects equipment from the steps, with per-recipe overrides', () => {
		const tools = (id: string) => content.recipeDetails.get(id)!.equipment;
		expect(tools('hummus')).toContain('mixer');
		expect(tools('granola')).toEqual(expect.arrayContaining(['rura', 'plech']));
		// "Opeč cibuľu" in a one-pot dish doesn't add a pan…
		expect(tools('minestrone')).not.toContain('panvica');
		// …and "prikry utierkou" (rising dough) isn't a lid.
		expect(tools('pizza')).not.toContain('pokrievka');
		expect(tools('falafel')).toEqual(expect.arrayContaining(['hrniec', 'teplomer']));
		expect(tools('falafel')).not.toContain('panvica');
		for (const r of content.recipeDetails.values()) {
			for (const e of r.equipmentDetail)
				expect(e.alternatives.length, `${r.id}/${e.id}`).toBeGreaterThan(0);
		}
	});

	it('uses only known cuisines and has wiki pages in every section', () => {
		const ids = new Set(content.cuisines.map((c) => c.id));
		for (const r of content.recipes) expect(ids.has(r.cuisine), r.id).toBe(true);
		const sections = new Set(content.wiki.map((w) => w.section));
		expect([...sections].sort()).toEqual([
			'navody',
			'pestovanie',
			'pohyb',
			'suplementy',
			'svet',
			'zaklady'
		]);
	});

	it('fills every recipe category with several recipes', () => {
		for (const id of CATEGORY_IDS) {
			const count = content.recipes.filter((r) => inCategory(r.categories, id)).length;
			expect(count, id).toBeGreaterThanOrEqual(10);
		}
	});

	it('draws the growing-technique diagrams into their guides', () => {
		const guide = content.wiki.find((w) => w.slug === 'vyvysene-zahony')!;
		expect(guide.art).toBe('hugelkultura');
		expect(guide.html.match(/<figure class="tech-art">/g)).toHaveLength(2);
		for (const page of content.wiki) expect(page.html, page.slug).not.toContain('{{art:');
	});
});
