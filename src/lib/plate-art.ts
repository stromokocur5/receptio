import { blobPath, hashString, seededRandom } from './art';
import type { Part, PartMethod } from './dish';
import type { IngredientLite } from './types';

/** Where each spot of the built plate sits, in a 300 × 300 drawing. */
export const SPOTS: Record<string, { x: number; y: number; r: number }> = {
	hlavne: { x: 184, y: 130, r: 52 },
	zaklad: { x: 110, y: 152, r: 54 },
	zelenina: { x: 170, y: 214, r: 40 },
	omacka: { x: 238, y: 66, r: 30 }
};

export type Texture =
	| 'grains'
	| 'pasta'
	| 'potato'
	| 'fries'
	| 'mash'
	| 'bread'
	| 'cubes'
	| 'patties'
	| 'beans'
	| 'stew'
	| 'soup'
	| 'porridge'
	| 'leaves'
	| 'roast'
	| 'sauce'
	| 'toppings'
	| 'crepes'
	| 'scoops'
	| 'fruit'
	| 'berries';

const BY_ID: [RegExp, Texture][] = [
	[/palacinky/, 'crepes'],
	[/zmrzlina/, 'scoops'],
	[/lesne-ovocie/, 'berries'],
	[/puding|jogurt/, 'porridge'],
	[/polievka|pasta-e-ceci/, 'soup'],
	[/kasa$|^ovsena/, 'porridge'],
	[/zemiakova-kasa/, 'mash'],
	[/kari|gulas|leco|masala|bolonsk|prazenica|fazula-v|napln|wok/, 'stew'],
	[/rezance|cestoviny/, 'pasta'],
	[/ryza|quinoa|bulgur/, 'grains'],
	[/hranolky/, 'fries'],
	[/zemiaky/, 'potato'],
	[/chlieb|hrianky|pita|tortilly/, 'bread'],
	[/falafel|burgre|sampinony|rezne/, 'patties'],
	[/tofu/, 'cubes'],
	[/cicer/, 'beans'],
	[/pecena-zelenina/, 'roast']
];

export function textureOf(part: Part): Texture {
	const hit = BY_ID.find(([re]) => re.test(part.id));
	if (hit) return hit[1];
	if (part.kind === 'omacka') return 'sauce';
	if (part.kind === 'navrch') return 'toppings';
	if (part.kind === 'zelenina') return 'leaves';
	if (part.kind === 'ovocie') return 'fruit';
	return 'stew';
}

/** The colours that show: ingredients by weight, without water, salt, oil and spices. */
export function partColors(method: PartMethod, byId: Map<string, IngredientLite>): string[] {
	const seen = new Set<string>();
	return [...method.lines]
		.filter((l) => !l.notEaten && l.grams > 0)
		.sort((a, b) => b.grams - a.grams)
		.map((l) => byId.get(l.ingredientId))
		.filter(
			(i): i is IngredientLite =>
				!!i && i.id !== 'voda' && !i.staple && i.category !== 'oleje' && i.category !== 'koreniny'
		)
		.map((i) => i.color)
		.filter((c) => !seen.has(c) && !!seen.add(c));
}

export type Shape =
	| { type: 'path'; d: string; fill: string; opacity?: number; stroke?: string }
	| { type: 'ellipse'; cx: number; cy: number; rx: number; ry: number; rot: number; fill: string }
	| {
			type: 'rect';
			x: number;
			y: number;
			w: number;
			h: number;
			rot: number;
			fill: string;
			rx: number;
	  }
	| { type: 'circle'; cx: number; cy: number; r: number; fill: string; opacity?: number };

/** Points spread over a disc, so bits don't pile up in the middle. */
function scatter(
	rand: () => number,
	x: number,
	y: number,
	r: number,
	n: number
): [number, number][] {
	return Array.from({ length: n }, (_, i) => {
		const angle = i * 2.39996 + rand() * 0.6;
		const dist = Math.sqrt((i + 0.5) / n) * r * (0.85 + rand() * 0.15);
		return [x + Math.cos(angle) * dist, y + Math.sin(angle) * dist];
	});
}

/** The drawing of one part in its spot: a base and the bits that tell what it is. */
export function partShapes(
	part: Part,
	method: PartMethod,
	byId: Map<string, IngredientLite>,
	spot: { x: number; y: number; r: number }
): { texture: Texture; shapes: Shape[]; bowl: boolean } {
	const rand = seededRandom(hashString(part.id));
	const colors = partColors(method, byId);
	const main = colors[0] ?? '#d9c9a5';
	const accents = colors.slice(1, 5);
	const accent = (i: number) => accents[i % Math.max(1, accents.length)] ?? main;
	const { x, y, r } = spot;
	const texture = textureOf(part);
	const shapes: Shape[] = [];
	const base = (fill: string, radius = r, wobble = 0.14) =>
		shapes.push({ type: 'path', d: blobPath(x, y, radius, rand, wobble, 9), fill });

	switch (texture) {
		case 'grains': {
			base(main, r * 0.95, 0.1);
			for (const [gx, gy] of scatter(rand, x, y, r * 0.82, 46)) {
				shapes.push({
					type: 'ellipse',
					cx: gx,
					cy: gy,
					rx: 4.2,
					ry: 1.9,
					rot: rand() * 180,
					fill: '#fffaf0'
				});
			}
			break;
		}
		case 'pasta': {
			base(main, r * 0.92, 0.12);
			for (let i = 0; i < 9; i++) {
				const [px, py] = scatter(rand, x, y, r * 0.6, 9)[i];
				const d = `M${px - 18},${py}c6,-12 12,12 18,0s12,12 18,0`;
				shapes.push({ type: 'path', d, fill: 'none', stroke: '#f6dc9c' });
			}
			break;
		}
		case 'potato':
		case 'roast': {
			for (const [px, py] of scatter(rand, x, y, r * 0.7, texture === 'roast' ? 10 : 8)) {
				const fill = texture === 'roast' ? accent(Math.floor(rand() * 4)) : main;
				shapes.push({ type: 'path', d: blobPath(px, py, r * 0.24, rand, 0.25, 6), fill });
			}
			break;
		}
		case 'fries': {
			for (const [fx, fy] of scatter(rand, x, y, r * 0.6, 14)) {
				shapes.push({
					type: 'rect',
					x: fx - 3.5,
					y: fy - 16,
					w: 7,
					h: 32,
					rot: 45 + rand() * 50,
					fill: '#e8b64c',
					rx: 2
				});
			}
			break;
		}
		case 'mash': {
			base(main, r * 0.9, 0.2);
			shapes.push({
				type: 'path',
				d: `M${x - r * 0.4},${y}q${r * 0.2},-${r * 0.25} ${r * 0.4},0t${r * 0.4},0`,
				fill: 'none',
				stroke: '#fff7e6'
			});
			shapes.push({ type: 'circle', cx: x + 6, cy: y - 4, r: 7, fill: '#e8c65a', opacity: 0.8 });
			break;
		}
		case 'bread': {
			for (let i = 0; i < 2; i++) {
				const bx = x - 14 + i * 26;
				const by = y - 10 + i * 18;
				const d = `M${bx - 24},${by + 18}v-22a20 20 0 0 1 12-16a14 14 0 0 1 24 0a20 20 0 0 1 12 16v22z`;
				shapes.push({ type: 'path', d, fill: '#c98a45' });
				shapes.push({
					type: 'path',
					d: `M${bx - 19},${by + 14}v-18a16 16 0 0 1 9-12a11 11 0 0 1 20 0a16 16 0 0 1 9 12v18z`,
					fill: main
				});
			}
			break;
		}
		case 'cubes': {
			for (const [cx, cy] of scatter(rand, x, y, r * 0.66, 9)) {
				shapes.push({
					type: 'rect',
					x: cx - 10,
					y: cy - 10,
					w: 20,
					h: 20,
					rot: rand() * 60 - 30,
					fill: '#e3b768',
					rx: 4
				});
				shapes.push({
					type: 'rect',
					x: cx - 6,
					y: cy - 6,
					w: 12,
					h: 12,
					rot: rand() * 60 - 30,
					fill: '#f4dca6',
					rx: 3
				});
			}
			break;
		}
		case 'patties': {
			for (const [px, py] of scatter(rand, x, y, r * 0.55, 5)) {
				shapes.push({ type: 'circle', cx: px, cy: py, r: r * 0.3, fill: '#b9792f' });
				shapes.push({
					type: 'circle',
					cx: px - 3,
					cy: py - 3,
					r: r * 0.2,
					fill: '#d79a4b',
					opacity: 0.85
				});
			}
			break;
		}
		case 'beans': {
			for (const [bx, by] of scatter(rand, x, y, r * 0.75, 26)) {
				shapes.push({ type: 'circle', cx: bx, cy: by, r: 5.5, fill: main });
				shapes.push({
					type: 'circle',
					cx: bx - 1.5,
					cy: by - 1.5,
					r: 2,
					fill: '#fff',
					opacity: 0.35
				});
			}
			break;
		}
		case 'stew':
		case 'soup':
		case 'porridge': {
			base(main, r * (texture === 'stew' ? 0.95 : 0.85), texture === 'stew' ? 0.16 : 0.05);
			const bits = texture === 'porridge' ? 0 : texture === 'soup' ? 6 : 14;
			for (const [sx, sy] of scatter(rand, x, y, r * 0.65, bits)) {
				shapes.push({
					type: 'path',
					d: blobPath(sx, sy, 5 + rand() * 5, rand, 0.3, 5),
					fill: accent(Math.floor(rand() * 4))
				});
			}
			shapes.push({
				type: 'path',
				d: `M${x - r * 0.45},${y - r * 0.35}q${r * 0.25},-${r * 0.18} ${r * 0.5},-${r * 0.05}`,
				fill: 'none',
				stroke: 'rgba(255,255,255,0.45)'
			});
			break;
		}
		case 'leaves': {
			for (const [lx, ly] of scatter(rand, x, y, r * 0.7, 9)) {
				const a = rand() * Math.PI * 2;
				const dx = Math.cos(a) * 14;
				const dy = Math.sin(a) * 14;
				const d = `M${lx - dx},${ly - dy}Q${lx + dy * 0.7},${ly - dx * 0.7} ${lx + dx},${ly + dy}Q${lx - dy * 0.7},${ly + dx * 0.7} ${lx - dx},${ly - dy}Z`;
				shapes.push({ type: 'path', d, fill: accent(Math.floor(rand() * 4)) || main });
			}
			for (const [sx, sy] of scatter(rand, x, y, r * 0.5, 4)) {
				shapes.push({ type: 'circle', cx: sx, cy: sy, r: 7, fill: main, opacity: 0.95 });
			}
			break;
		}
		case 'sauce': {
			shapes.push({ type: 'circle', cx: x, cy: y, r: r * 0.72, fill: main });
			shapes.push({
				type: 'path',
				d: `M${x - r * 0.4},${y - r * 0.2}q${r * 0.2},-${r * 0.25} ${r * 0.45},-${r * 0.15}`,
				fill: 'none',
				stroke: 'rgba(255,255,255,0.55)'
			});
			for (const [dx, dy] of scatter(rand, x, y, r * 0.45, Math.min(5, accents.length * 2))) {
				shapes.push({
					type: 'circle',
					cx: dx,
					cy: dy,
					r: 2.6,
					fill: accent(Math.floor(rand() * 4))
				});
			}
			break;
		}
		case 'crepes': {
			for (let i = 0; i < 3; i++) {
				const cy = y - r * 0.45 + i * r * 0.42;
				shapes.push({
					type: 'rect',
					x: x - r * 0.8,
					y: cy - 9,
					w: r * 1.6,
					h: 20,
					rot: -12 + i * 6,
					fill: '#e9c27a',
					rx: 10
				});
				shapes.push({
					type: 'path',
					d: `M${x - r * 0.6},${cy}h${r * 1.2}`,
					fill: 'none',
					stroke: '#d6a24f'
				});
			}
			break;
		}
		case 'scoops': {
			for (const [sx, sy] of scatter(rand, x, y, r * 0.45, 3)) {
				shapes.push({ type: 'path', d: blobPath(sx, sy, r * 0.42, rand, 0.12, 9), fill: main });
				shapes.push({ type: 'circle', cx: sx - 6, cy: sy - 7, r: 5, fill: '#fff', opacity: 0.35 });
			}
			break;
		}
		case 'fruit': {
			for (const [fx, fy] of scatter(rand, x, y, r * 0.7, 9)) {
				const c = colors[Math.floor(rand() * Math.max(1, colors.length))] ?? main;
				shapes.push({ type: 'circle', cx: fx, cy: fy, r: 9, fill: c });
				shapes.push({ type: 'circle', cx: fx, cy: fy, r: 4, fill: '#fff8e8', opacity: 0.55 });
			}
			break;
		}
		case 'berries': {
			base(main, r * 0.75, 0.2);
			for (const [bx, by] of scatter(rand, x, y, r * 0.65, 16)) {
				shapes.push({
					type: 'circle',
					cx: bx,
					cy: by,
					r: 5,
					fill: rand() > 0.5 ? '#5b2a6e' : '#b8314a'
				});
				shapes.push({
					type: 'circle',
					cx: bx - 1.5,
					cy: by - 1.5,
					r: 1.6,
					fill: '#fff',
					opacity: 0.45
				});
			}
			break;
		}
		case 'toppings': {
			for (const [tx, ty] of scatter(rand, x, y, r * 0.7, 12)) {
				shapes.push({
					type: 'path',
					d: blobPath(tx, ty, 5, rand, 0.3, 5),
					fill: accent(Math.floor(rand() * 4)) || main
				});
			}
			break;
		}
	}
	return {
		texture,
		shapes,
		bowl: texture === 'soup' || texture === 'porridge' || texture === 'sauce'
	};
}

const SPOT_PREFERENCE: Record<Part['kind'], string[]> = {
	hlavne: ['hlavne', 'zaklad', 'zelenina'],
	bielkovina: ['hlavne', 'zelenina', 'zaklad'],
	priloha: ['zaklad', 'zelenina', 'hlavne'],
	pecivo: ['zaklad', 'zelenina', 'hlavne'],
	zelenina: ['zelenina', 'zaklad', 'hlavne'],
	ovocie: ['zelenina', 'zaklad', 'omacka'],
	omacka: ['omacka', 'zelenina'],
	navrch: ['omacka', 'zelenina']
};

/** Places the parts of any dish on the four spots by what they are; extras that don't fit are left off. */
export function placeParts<T extends { part: Part; method: PartMethod }>(
	parts: T[]
): (T & { slot: string })[] {
	const taken = new Set<string>();
	return parts.flatMap((p) => {
		const slot = SPOT_PREFERENCE[p.part.kind].find((s) => !taken.has(s));
		if (!slot) return [];
		taken.add(slot);
		return [{ ...p, slot }];
	});
}
