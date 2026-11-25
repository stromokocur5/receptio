import type { Appliance, Kitchen, PartStep } from './dish';

export interface TimelinePart {
	id: string;
	name: string;
	/** Can be made any time before the meal; see Part.early. */
	early: boolean;
	steps: PartStep[];
}

export interface TimedStep {
	/** null for putting the plate together. */
	partId: string | null;
	partName: string;
	text: string;
	/** Minutes from the start of cooking. */
	start: number;
	end: number;
	on?: Appliance;
	temp?: number;
	free: boolean;
	/** Added by the planner: switching the oven on in time. */
	preheat?: boolean;
}

export interface Timeline {
	total: number;
	steps: TimedStep[];
}

export const PREHEAT_MIN = 10;
/** Two trays fit in one oven, as long as they want the same temperature. */
const OVEN_TRAYS = 2;
const HORIZON = 24 * 60;

interface Usage {
	hands: number;
	platna: number;
	rura: number;
	ruraTemp: number | null;
	airfryer: number;
	mikrovlnka: number;
	mixer: number;
}

const emptyUsage = (): Usage => ({
	hands: 0,
	platna: 0,
	rura: 0,
	ruraTemp: null,
	airfryer: 0,
	mikrovlnka: 0,
	mixer: 0
});

interface Planned extends PartStep {
	partId: string | null;
	partName: string;
	preheat?: boolean;
}

/** A run of steps that must follow each other without a break. */
type Segment = Planned[];

function withPreheat(part: TimelinePart): Planned[] {
	const out: Planned[] = [];
	let heated = false;
	for (const step of part.steps) {
		if (step.on === 'rura' && !heated) {
			heated = true;
			out.push({
				text: `Zapni rúru na ${step.temp} °C, nech sa zohreje.`,
				min: PREHEAT_MIN,
				on: 'rura',
				temp: step.temp,
				free: true,
				pause: step.pause,
				partId: part.id,
				partName: part.name,
				preheat: true
			});
			out.push({ ...step, pause: false, partId: part.id, partName: part.name });
			continue;
		}
		out.push({ ...step, partId: part.id, partName: part.name });
	}
	return out;
}

/**
 * Splits a part where a break does no harm: before a step marked `pause`, and after any step that
 * leaves nothing cooking (cut vegetables or a marinating tofu can wait, a boiling pot can't).
 */
function segments(steps: Planned[]): Segment[] {
	const out: Segment[] = [];
	steps.forEach((step, i) => {
		const prev = steps[i - 1];
		if (!out.length || step.pause || (!prev.on && !step.preheat)) out.push([step]);
		else out[out.length - 1].push(step);
	});
	return out;
}

const duration = (segment: Segment) => segment.reduce((sum, s) => sum + s.min, 0);

/**
 * Schedules backwards from the moment the food is served, so warm parts finish as late as the
 * kitchen allows and nothing waits going cold. One cook (hands), `burners` burners, one oven at
 * one temperature, one of every other appliance.
 */
/** Every order of a short list; long lists keep theirs, the search would be too slow. */
function orders<T>(items: T[]): T[][] {
	if (items.length <= 1 || items.length > MAX_PERMUTED) return [items];
	return items.flatMap((item, i) =>
		orders([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest])
	);
}

const MAX_PERMUTED = 5;
/** A minute of warm food waiting counts this much against a minute of total time. */
const WAIT_WEIGHT = 0.5;

/**
 * Schedules backwards from the moment the food is served, so warm parts finish as late as the
 * kitchen allows and nothing waits going cold. One cook (hands), `burners` burners, one oven at
 * one temperature, one of every other appliance. Which warm part gets the last slots matters a
 * lot, so every order is tried and the shortest plan with the least waiting wins.
 */
export function planTimeline(
	parts: TimelinePart[],
	finish: PartStep[],
	kitchen: Kitchen
): Timeline {
	const chains = parts.map((p) => ({ part: p, segments: segments(withPreheat(p)) }));
	const length = (c: (typeof chains)[number]) => c.segments.reduce((s, g) => s + duration(g), 0);
	const warm = chains.filter((c) => !c.part.early).sort((a, b) => length(b) - length(a));
	const cold = chains.filter((c) => c.part.early).sort((a, b) => length(b) - length(a));

	let best: { placed: Placed[]; total: number; score: number } | undefined;
	for (const order of orders(warm)) {
		const run = schedule(
			[...order, ...cold].map((c) => ({ chain: c.segments, warm: !c.part.early })),
			finish,
			kitchen
		);
		const score = run.total + WAIT_WEIGHT * run.waiting;
		if (!best || score < best.score) best = { ...run, score };
	}
	const { placed, total } = best ?? schedule([], finish, kitchen);

	const steps: TimedStep[] = placed.map(({ step, from }) => ({
		partId: step.partId,
		partName: step.partName,
		text: step.text,
		start: total - from - step.min,
		end: total - from,
		...(step.on && { on: step.on }),
		...(step.temp !== undefined && { temp: step.temp }),
		free: step.free,
		...(step.preheat && { preheat: true })
	}));

	return {
		total,
		steps: dropRedundantPreheats(steps).sort((a, b) => a.start - b.start || a.end - b.end)
	};
}

interface Placed {
	step: Planned;
	/** Minutes before serving that the step ends. */
	from: number;
}

function schedule(
	chains: { chain: Segment[]; warm: boolean }[],
	finish: PartStep[],
	kitchen: Kitchen
): { placed: Placed[]; total: number; waiting: number } {
	const burners = Math.max(1, kitchen.burners);
	/** Usage per minute counted backwards from serving. */
	const usage: Usage[] = [];
	const at = (minute: number) => (usage[minute] ??= emptyUsage());

	/** In reverse time a step's first minutes are its last ones. */
	const needsHands = (step: Planned, from: number, m: number) =>
		!step.free || m >= from + step.min - (step.hands ?? 0);

	const fits = (step: Planned, from: number): boolean => {
		for (let m = from; m < from + step.min; m++) {
			const u = at(m);
			if (needsHands(step, from, m) && u.hands >= 1) return false;
			switch (step.on) {
				case 'platna':
					if (u.platna >= burners) return false;
					break;
				case 'rura':
					if (u.rura >= OVEN_TRAYS || (u.ruraTemp !== null && u.ruraTemp !== step.temp)) {
						return false;
					}
					break;
				case 'airfryer':
				case 'mikrovlnka':
				case 'mixer':
					if (u[step.on] >= 1) return false;
					break;
			}
		}
		return true;
	};

	const take = (step: Planned, from: number) => {
		for (let m = from; m < from + step.min; m++) {
			const u = at(m);
			if (needsHands(step, from, m)) u.hands++;
			if (step.on === 'rura') {
				u.rura++;
				u.ruraTemp = step.temp ?? null;
			} else if (step.on) u[step.on]++;
		}
	};

	const placed: Placed[] = [];

	/** Earliest reverse time from `lowest` where the whole segment fits, last step first. */
	const place = (segment: Segment, lowest: number): number => {
		for (let r = lowest; r < HORIZON; r++) {
			let offset = r;
			let ok = true;
			for (let i = segment.length - 1; i >= 0 && ok; i--) {
				ok = fits(segment[i], offset);
				offset += segment[i].min;
			}
			if (!ok) continue;
			offset = r;
			for (let i = segment.length - 1; i >= 0; i--) {
				take(segment[i], offset);
				placed.push({ step: segment[i], from: offset });
				offset += segment[i].min;
			}
			return r;
		}
		throw new Error('timeline: kroky sa nezmestili do 24 hodín');
	};

	const finishSteps = finish.map((s) => ({
		...s,
		pause: false,
		partId: null,
		partName: 'Na tanier'
	}));
	const finishLength = finishSteps.length ? place(finishSteps, 0) + duration(finishSteps) : 0;

	let waiting = 0;
	for (const { chain, warm } of chains) {
		let lowest = finishLength;
		for (let i = chain.length - 1; i >= 0; i--) {
			const r = place(chain[i], lowest);
			if (warm && i === chain.length - 1) waiting += r - finishLength;
			lowest = r + duration(chain[i]);
		}
	}

	const total = placed.reduce((max, p) => Math.max(max, p.from + p.step.min), 0);
	return { placed, total, waiting };
}

/** A second part baking at the same temperature finds the oven already hot. */
function dropRedundantPreheats(steps: TimedStep[]): TimedStep[] {
	return steps.filter(
		(s, i) =>
			!s.preheat ||
			!steps.some(
				(o, j) =>
					o.partId !== s.partId &&
					o.on === 'rura' &&
					o.temp === s.temp &&
					(o.start < s.start || (o.start === s.start && o.preheat && j < i)) &&
					o.end > s.start
			)
	);
}

/** Minutes the cook is busy, the rest is waiting. */
export function activeMinutes(timeline: Timeline): number {
	return timeline.steps.filter((s) => !s.free).reduce((sum, s) => sum + s.end - s.start, 0);
}
