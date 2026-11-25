import {
	chosenParts,
	combineFacts,
	dishLines,
	type Build,
	type ChosenPart,
	type Dish,
	type Kitchen,
	type Part,
	type PartFacts
} from './dish';
import { activeMinutes, planTimeline, type Timeline } from './timeline';
import type { IngredientLite, RecipeLine } from './types';

/** A dish as built: the parts, what a serving gives, what to buy and how the cooking runs. */
export interface Plate {
	parts: ChosenPart[];
	facts: PartFacts;
	lines: RecipeLine[];
	timeline: Timeline;
	/** Minutes of actual work in `timeline.total`. */
	active: number;
	/** Soaking and the like, to do the day before. */
	ahead: { part: string; text: string }[];
}

export function composePlate(
	dish: Dish,
	build: Build,
	kitchen: Kitchen,
	partsById: Map<string, Part>,
	byId: Map<string, IngredientLite>
): Plate {
	const parts = chosenParts(dish, build.choice, build.methods, partsById, kitchen);
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
	return {
		parts,
		facts: combineFacts(parts.map((p) => p.method)),
		lines: dishLines(parts, build.servings, byId),
		timeline,
		active: activeMinutes(timeline),
		ahead: parts.flatMap(({ part }) => (part.ahead ? [{ part: part.name, text: part.ahead }] : []))
	};
}
