import { describe, expect, it } from 'vitest';
import {
	chosenParts,
	combineFacts,
	defaultChoice,
	KITCHEN_TOOLS,
	usableMethods,
	type Kitchen
} from '$lib/dish';
import { planTimeline } from '$lib/timeline';
import { getContent } from './content';

const FULL: Kitchen = { burners: 4, tools: [...KITCHEN_TOOLS] };
const BARE: Kitchen = { burners: 2, tools: [] };

describe('content', () => {
	const content = getContent();
	const partsById = new Map(content.parts.map((p) => [p.id, p]));

	it('compiles parts and dishes', () => {
		expect(content.parts.length).toBeGreaterThan(20);
		expect(content.dishes.length).toBeGreaterThan(10);
	});

	it('gives every method plausible nutrition and a price', () => {
		for (const part of content.parts) {
			for (const m of part.methods) {
				const where = `${part.id} / ${m.label}`;
				expect(m.costPerServing, where).toBeGreaterThan(0);
				expect(m.perServing.kcal, where).toBeGreaterThan(0);
				expect(m.perServing.kcal, where).toBeLessThan(1100);
				expect(m.perServing.salt, where).toBeLessThan(4);
			}
		}
	});

	it('makes whole plates of a sensible size', () => {
		for (const dish of content.dishes) {
			const parts = chosenParts(dish, defaultChoice(dish), {}, partsById, FULL);
			const facts = combineFacts(parts.map((p) => p.method));
			expect(facts.perServing.kcal, dish.id).toBeGreaterThan(250);
			expect(facts.perServing.kcal, dish.id).toBeLessThan(1400);
			expect(facts.perServing.salt, dish.id).toBeLessThan(5);
		}
	});

	it('bakes everything at one oven temperature, so parts share the oven', () => {
		const temps = new Set(
			content.parts.flatMap((p) =>
				p.methods.flatMap((m) => m.steps.filter((s) => s.on === 'rura').map((s) => s.temp))
			)
		);
		expect([...temps]).toEqual([220]);
	});

	it('labels frying, not baking', () => {
		const mushrooms = partsById.get('obalene-sampinony')!;
		expect(mushrooms.methods[0].treat).toContain('vyprazane');
		expect(mushrooms.methods[1].treat).not.toContain('vyprazane');
	});

	it('plans every option of every dish in any kitchen that can cook it', () => {
		for (const kitchen of [FULL, BARE]) {
			for (const dish of content.dishes) {
				for (const slot of dish.slots) {
					for (const option of slot.options) {
						const choice = { ...defaultChoice(dish), [slot.id]: option };
						const parts = chosenParts(dish, choice, {}, partsById, kitchen);
						const timeline = planTimeline(
							parts.map(({ part, method }) => ({
								id: part.id,
								name: part.name,
								early: part.early,
								steps: method.steps
							})),
							dish.finish,
							kitchen
						);
						expect(timeline.total, `${dish.id} ${option}`).toBeGreaterThan(0);
						expect(timeline.total, `${dish.id} ${option}`).toBeLessThan(150);
					}
				}
			}
		}
	});

	it('keeps warm sides warm: potatoes finish with the mushrooms, not half an hour before', () => {
		const dish = content.dishes.find((d) => d.id === 'vyprazane-sampinony')!;
		const parts = chosenParts(dish, defaultChoice(dish), {}, partsById, FULL);
		const timeline = planTimeline(
			parts.map(({ part, method }) => ({
				id: part.id,
				name: part.name,
				early: part.early,
				steps: method.steps
			})),
			dish.finish,
			FULL
		);
		const end = (id: string) =>
			Math.max(...timeline.steps.filter((s) => s.partId === id).map((s) => s.end));
		expect(Math.abs(end('varene-zemiaky') - end('obalene-sampinony'))).toBeLessThanOrEqual(5);
		expect(timeline.total).toBeLessThan(56);
	});

	it('can cook most dishes without an oven or gadgets', () => {
		const cookable = content.dishes.filter((dish) =>
			dish.slots.every(
				(s) => s.optional || s.options.some((id) => usableMethods(partsById.get(id)!, BARE).length)
			)
		);
		expect(cookable.length / content.dishes.length).toBeGreaterThan(0.6);
	});
});
