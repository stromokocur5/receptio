import { describe, expect, it } from 'vitest';
import {
	composePart,
	decodeComposition,
	encodeComposition,
	suits,
	TECHNIQUES,
	type Composition
} from '$lib/composer';
import { KITCHEN_TOOLS } from '$lib/dish';
import { planTimeline } from '$lib/timeline';
import { bestPrice } from '$lib/pricing';
import { getContent } from './content';

describe('composer', () => {
	const content = getContent();
	const data = content.composer;
	const byId = new Map(content.ingredients.map((i) => [i.id, i]));
	const prices = Object.fromEntries(
		content.ingredients.map((i) => {
			const b = bestPrice(i, content.prices, new Date());
			return [i.id, { perKg: b.perKg, estimate: b.isEstimate }];
		})
	);
	const kitchen = { burners: 4, tools: [...KITCHEN_TOOLS] };

	/** A typical plate for each technique: a protein, three vegetables, the aromatics. */
	const sample = (technique: Composition['technique']): Composition => {
		const fit = Object.values(data.ingredients).filter((i) => suits(i, technique));
		const pick = (group: string, n: number) =>
			fit
				.filter((i) => i.group === group)
				.slice(0, n)
				.map((i) => i.id);
		const base = Object.values(data.bases).find((b) => b.techniques.includes(technique))!.id;
		return {
			technique,
			items: [
				...pick('bielkovina', 1),
				...pick('zelenina', 3),
				...pick('listy', 1),
				...pick('aroma', 2)
			],
			base,
			toppings: ['sezam']
		};
	};

	it('round-trips a composition through its id', () => {
		const c = sample('wok');
		expect(decodeComposition(encodeComposition(c), data)).toEqual(c);
		expect(decodeComposition('x.wok.neexistuje.tofu-natural.-', data)).toBeNull();
		expect(decodeComposition('x.salat.citronovy-dresing.zemiaky.-', data)).toBeNull();
	});

	for (const technique of TECHNIQUES) {
		it(`makes a cookable, sensible ${technique}`, () => {
			const part = composePart(sample(technique), data, byId, prices);
			const m = part.methods[0];
			expect(m.steps.length).toBeGreaterThan(1);
			expect(m.perServing.kcal).toBeGreaterThan(120);
			expect(m.perServing.kcal).toBeLessThan(900);
			expect(m.perServing.salt).toBeLessThan(4);
			expect(m.costPerServing).toBeGreaterThan(0);
			const t = planTimeline(
				[{ id: part.id, name: part.name, early: part.early, steps: m.steps }],
				[],
				kitchen
			);
			expect(t.total).toBeGreaterThan(0);
			expect(t.total).toBeLessThan(90);
			for (const s of m.steps) expect(s.text).not.toMatch(/undefined|NaN|\s\s/);
		});
	}

	it('every ingredient and base can be cooked in each technique it claims', () => {
		for (const technique of TECHNIQUES) {
			for (const base of Object.values(data.bases).filter((b) =>
				b.techniques.includes(technique)
			)) {
				for (const i of Object.values(data.ingredients).filter((x) => suits(x, technique))) {
					const part = composePart(
						{ technique, items: [i.id], base: base.id, toppings: [] },
						data,
						byId,
						prices
					);
					expect(part.methods[0].steps.length, `${technique} ${base.id} ${i.id}`).toBeGreaterThan(
						0
					);
				}
			}
		}
	});
});
