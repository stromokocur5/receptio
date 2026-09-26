import type { Ingredient, RecipeLine } from './types';

export function hashString(text: string): number {
	let h = 2166136261;
	for (let i = 0; i < text.length; i++) {
		h ^= text.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}

/** Small deterministic PRNG so every recipe always gets the same illustration. */
export function seededRandom(seed: number): () => number {
	let a = seed;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Closed organic blob through `points` jittered radii, smoothed with Catmull-Rom → cubic Béziers. */
export function blobPath(
	cx: number,
	cy: number,
	radius: number,
	rand: () => number,
	wobble = 0.18,
	points = 8,
	stretch = 1
): string {
	const pts: [number, number][] = [];
	const rotation = rand() * Math.PI * 2;
	for (let i = 0; i < points; i++) {
		const angle = rotation + (i / points) * Math.PI * 2;
		const r = radius * (1 - wobble + rand() * wobble * 2);
		pts.push([cx + Math.cos(angle) * r * stretch, cy + Math.sin(angle) * r]);
	}
	const f = (n: number) => n.toFixed(1);
	let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
	for (let i = 0; i < points; i++) {
		const p0 = pts[(i - 1 + points) % points];
		const p1 = pts[i];
		const p2 = pts[(i + 1) % points];
		const p3 = pts[(i + 2) % points];
		const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
		const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
		d += `C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`;
	}
	return `${d}Z`;
}

export interface PlateLayer {
	kind: 'base' | 'side' | 'grain' | 'chunk' | 'herb' | 'speck';
	d: string;
	color: string;
	delay: number;
}

const BASE_CATEGORIES = new Set(['rastlinne-mlieka', 'omacky-pasty']);
const SIDE_CATEGORIES = new Set(['obilniny']);

/**
 * Builds a top-down plate: a sauce base, a grain side (rice, quinoa…), chunks sized by
 * each ingredient's share of the recipe, herbs as little leaves and spices as specks.
 */
export function plateLayers(
	seedText: string,
	lines: RecipeLine[],
	byId: Map<string, Ingredient>,
	/** Lite mode (cards, thumbnails) drops fine texture to keep list pages small. */
	detail = true
): PlateLayer[] {
	const rand = seededRandom(hashString(seedText));
	const totals = new Map<string, number>();
	for (const line of lines) {
		const ingredient = byId.get(line.ingredientId);
		if (!ingredient || ingredient.id === 'voda' || line.grams <= 0) continue;
		totals.set(ingredient.id, (totals.get(ingredient.id) ?? 0) + line.grams);
	}
	const items = [...totals]
		.map(([id, grams]) => ({ ingredient: byId.get(id)!, grams }))
		.sort((a, b) => b.grams - a.grams);
	const sum = items.reduce((s, i) => s + i.grams, 0) || 1;

	const layers: PlateLayer[] = [];
	const side = items.find((i) => SIDE_CATEGORIES.has(i.ingredient.category));
	const base =
		items.find((i) => BASE_CATEGORIES.has(i.ingredient.category)) ??
		items.find((i) => i !== side && i.ingredient.category !== 'koreniny');

	const sideAngle = rand() * Math.PI * 2;
	if (side) {
		const sx = 100 + Math.cos(sideAngle) * 26;
		const sy = 100 + Math.sin(sideAngle) * 26;
		layers.push({
			kind: 'side',
			d: blobPath(sx, sy, 40, rand, 0.1, 9),
			color: side.ingredient.color,
			delay: 0
		});
		for (let g = 0; g < 26; g++) {
			const a = rand() * Math.PI * 2;
			const r = Math.sqrt(rand()) * 32;
			const gx = sx + Math.cos(a) * r;
			const gy = sy + Math.sin(a) * r;
			layers.push({
				kind: 'grain',
				d: blobPath(gx, gy, 2.4, rand, 0.3, 5, 1.8),
				color: 'rgba(0,0,0,0.07)',
				delay: 0.05
			});
		}
	}

	const cx = side ? 100 - Math.cos(sideAngle) * 16 : 100;
	const cy = side ? 100 - Math.sin(sideAngle) * 16 : 100;
	if (base) {
		layers.push({
			kind: 'base',
			d: blobPath(cx, cy, side ? 50 : 60, rand, 0.12, 10),
			color: base.ingredient.color,
			delay: 0.08
		});
	}

	let index = 0;
	for (const { ingredient, grams } of items) {
		if (ingredient === side?.ingredient || ingredient === base?.ingredient) continue;
		const share = grams / sum;
		if (ingredient.category === 'koreniny') {
			const count = 6 + Math.round(rand() * 6);
			for (let s = 0; s < count; s++) {
				const a = rand() * Math.PI * 2;
				const r = Math.sqrt(rand()) * 44;
				layers.push({
					kind: 'speck',
					d: blobPath(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1.3, rand, 0.3, 5),
					color: ingredient.color,
					delay: 0.5 + index * 0.05
				});
			}
		} else if (share < 0.02 && ingredient.category === 'zelenina') {
			const count = 4 + Math.round(rand() * 4);
			for (let s = 0; s < count; s++) {
				const a = rand() * Math.PI * 2;
				const r = Math.sqrt(rand()) * 42;
				const x = cx + Math.cos(a) * r;
				const y = cy + Math.sin(a) * r;
				const tilt = rand() * Math.PI;
				const dx = Math.cos(tilt) * 4.5;
				const dy = Math.sin(tilt) * 4.5;
				layers.push({
					kind: 'herb',
					d: `M${(x - dx).toFixed(1)},${(y - dy).toFixed(1)}Q${(x + dy).toFixed(1)},${(y - dx).toFixed(1)} ${(x + dx).toFixed(1)},${(y + dy).toFixed(1)}Q${(x - dy).toFixed(1)},${(y + dx).toFixed(1)} ${(x - dx).toFixed(1)},${(y - dy).toFixed(1)}Z`,
					color: ingredient.color,
					delay: 0.6 + index * 0.05
				});
			}
		} else if (share >= 0.01) {
			const pieces = Math.min(9, Math.max(2, Math.round(share * 30)));
			const size = 5 + Math.min(9, share * 40);
			for (let p = 0; p < pieces; p++) {
				const a = rand() * Math.PI * 2;
				const r = Math.sqrt(rand()) * (side ? 36 : 46);
				layers.push({
					kind: 'chunk',
					d: blobPath(
						cx + Math.cos(a) * r,
						cy + Math.sin(a) * r,
						size * (0.75 + rand() * 0.5),
						rand,
						0.22,
						7
					),
					color: ingredient.color,
					delay: 0.2 + index * 0.07 + p * 0.02
				});
			}
		}
		index++;
	}
	// Filter after generating so both modes consume the PRNG identically and look the same.
	if (detail) return layers;
	return layers.filter((l, i) => l.kind !== 'grain' && (l.kind !== 'speck' || i % 3 === 0));
}
