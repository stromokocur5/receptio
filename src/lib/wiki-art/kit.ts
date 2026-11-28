/**
 * Shared pieces for the wiki drawings: labels, plants, drops, arrows… Everything draws on a
 * 320 × 190 canvas; colours and motion come from `.tech-art` classes in app.css.
 */

export const W = 320;
export const H = 190;

export function label(
	x: number,
	y: number,
	text: string,
	anchor: 'start' | 'middle' | 'end' = 'start'
) {
	return `<text class="ta-label" x="${x}" y="${y}" text-anchor="${anchor}">${text}</text>`;
}

/** A thin pointer from a label to what it names. */
export function leader(x1: number, y1: number, x2: number, y2: number) {
	return `<path class="ta-leader" d="M${x1} ${y1}L${x2} ${y2}"/><circle class="ta-dot" cx="${x2}" cy="${y2}" r="1.8"/>`;
}

/** A leafy plant standing on (x, y), `h` tall, swaying gently. */
export function plant(
	x: number,
	y: number,
	h: number,
	d = 0,
	kind: 'leafy' | 'fruit' | 'sprout' = 'leafy'
) {
	const l = h * 0.42;
	const leaves =
		kind === 'sprout'
			? `<path class="ta-leaf" d="M${x} ${y - h}c-${l * 0.9} 0-${l * 1.2}-${l * 0.7}-${l * 1.2}-${l}c${l * 0.8} 0 ${l * 1.2} ${l * 0.4} ${l * 1.2} ${l}Zm0 0c${l * 0.9} 0 ${l * 1.2}-${l * 0.7} ${l * 1.2}-${l}c-${l * 0.8} 0-${l * 1.2} ${l * 0.4}-${l * 1.2} ${l}Z"/>`
			: `<path class="ta-leaf" d="M${x} ${y - h * 0.45}c-${l} -${l * 0.1}-${l * 1.4}-${l * 0.9}-${l * 1.4}-${l * 1.3}c${l} 0 ${l * 1.4} ${l * 0.7} ${l * 1.4} ${l * 1.3}Z"/>` +
				`<path class="ta-leaf" d="M${x} ${y - h * 0.7}c${l}-${l * 0.1} ${l * 1.4}-${l * 0.9} ${l * 1.4}-${l * 1.3}c-${l} 0-${l * 1.4} ${l * 0.7}-${l * 1.4} ${l * 1.3}Z"/>` +
				`<path class="ta-leaf" d="M${x} ${y - h}c-${l * 0.6}-${l * 0.2}-${l * 0.8}-${l * 0.8}-${l * 0.6}-${l * 1.1}c${l * 0.5} ${l * 0.2} ${l * 0.7} ${l * 0.6} ${l * 0.6} ${l * 1.1}Z"/>`;
	const fruit =
		kind === 'fruit'
			? `<circle class="ta-fruit" cx="${x + l * 0.5}" cy="${y - h * 0.35}" r="${Math.max(2.5, h * 0.08)}"/><circle class="ta-fruit" cx="${x - l * 0.6}" cy="${y - h * 0.6}" r="${Math.max(2.2, h * 0.07)}"/>`
			: '';
	return `<g class="ta-sway" style="--d:${d}s;transform-origin:${x}px ${y}px"><path class="ta-stem" d="M${x} ${y}V${y - h}"/>${leaves}${fruit}</g>`;
}

export function roots(x: number, y: number, depth: number) {
	return `<path class="ta-root" d="M${x} ${y}c-2 ${depth * 0.4}-6 ${depth * 0.6}-9 ${depth}M${x} ${y}c1 ${depth * 0.5} 0 ${depth * 0.8} 2 ${depth * 1.1}M${x} ${y}c3 ${depth * 0.3} 7 ${depth * 0.5} 9 ${depth * 0.8}"/>`;
}

export function drop(x: number, y: number, d: number, fall = 22) {
	return `<path class="ta-drop" style="--d:${d}s;--fall:${fall}px" d="M${x} ${y}c-2 3-3 4.5-3 6a3 3 0 0 0 6 0c0-1.5-1-3-3-6Z"/>`;
}

export function sun(x: number, y: number, r = 11) {
	const rays = Array.from({ length: 8 }, (_, i) => {
		const a = (i * Math.PI) / 4;
		const c = Math.cos(a);
		const s = Math.sin(a);
		return `M${(x + c * (r + 4)).toFixed(1)} ${(y + s * (r + 4)).toFixed(1)}L${(x + c * (r + 9)).toFixed(1)} ${(y + s * (r + 9)).toFixed(1)}`;
	}).join('');
	return `<g class="ta-sun"><circle cx="${x}" cy="${y}" r="${r}"/><path class="ta-rays" style="transform-origin:${x}px ${y}px" d="${rays}"/></g>`;
}

export function worm(x: number, y: number, d: number) {
	return `<path class="ta-worm" style="--d:${d}s" d="M${x} ${y}c4-4 8 4 12 0s8 4 12 0"/>`;
}

export function log(cx: number, cy: number, r: number) {
	return `<g class="ta-wood"><circle cx="${cx}" cy="${cy}" r="${r}"/><circle class="ta-ring" cx="${cx}" cy="${cy}" r="${r * 0.62}"/><circle class="ta-ring" cx="${cx}" cy="${cy}" r="${r * 0.28}"/></g>`;
}

export function arrow(x1: number, y1: number, x2: number, y2: number, bend = 0) {
	const mx = (x1 + x2) / 2;
	const my = (y1 + y2) / 2 - bend;
	const angle = Math.atan2(y2 - my, x2 - mx);
	const a1 = angle + Math.PI * 0.82;
	const a2 = angle - Math.PI * 0.82;
	const head = `M${(x2 + Math.cos(a1) * 6).toFixed(1)} ${(y2 + Math.sin(a1) * 6).toFixed(1)}L${x2} ${y2}L${(x2 + Math.cos(a2) * 6).toFixed(1)} ${(y2 + Math.sin(a2) * 6).toFixed(1)}`;
	return `<path class="ta-arrow" d="M${x1} ${y1}Q${mx} ${my} ${x2} ${y2}${head}"/>`;
}

export function snow(x: number, y: number, d: number) {
	return `<path class="ta-snow" style="--d:${d}s" d="M${x} ${y - 4}v8M${x - 3.5} ${y - 2}l7 4M${x - 3.5} ${y + 2}l7-4"/>`;
}

export function ground(y: number, depth = H - y) {
	return `<rect class="ta-soil" x="0" y="${y}" width="${W}" height="${depth}"/><path class="ta-ground" d="M0 ${y}H${W}"/>`;
}

/** Soil crumbs, scattered but always the same. */
export function crumbs(y1: number, y2: number, count: number, seed = 1) {
	let s = seed;
	const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
	return Array.from(
		{ length: count },
		() =>
			`<circle class="ta-crumb" cx="${(rnd() * W).toFixed(0)}" cy="${(y1 + rnd() * (y2 - y1)).toFixed(0)}" r="${(0.8 + rnd() * 1.4).toFixed(1)}"/>`
	).join('');
}

/** A tree standing on (x, y): trunk `h` tall and a round crown of radius `r`, swaying. */
export function tree(x: number, y: number, h: number, r: number, d = 0, fruit = '') {
	const top = y - h;
	const fruits = fruit
		? [
				[-0.4, 0.1],
				[0.35, -0.2],
				[0.1, 0.4],
				[-0.15, -0.45]
			]
				.map(
					([fx, fy]) =>
						`<circle class="ta-fruit" style="fill:${fruit}" cx="${(x + fx * r).toFixed(1)}" cy="${(top + fy * r).toFixed(1)}" r="${Math.max(2, r * 0.12).toFixed(1)}"/>`
				)
				.join('')
		: '';
	return (
		`<g class="ta-sway" style="--d:${d}s;transform-origin:${x}px ${y}px">` +
		`<path class="ta-trunk" d="M${x - r * 0.08} ${y}L${x - r * 0.05} ${top}h${r * 0.1}L${x + r * 0.08} ${y}Z"/>` +
		`<circle class="ta-crown" cx="${x}" cy="${top}" r="${r}"/>` +
		fruits +
		`</g>`
	);
}

/** A bushy shrub on (x, y), `w` wide. */
export function shrub(x: number, y: number, w: number, d = 0, berries = '') {
	const h = w * 0.7;
	return (
		`<g class="ta-sway" style="--d:${d}s;transform-origin:${x}px ${y}px">` +
		`<path class="ta-crown" d="M${x - w / 2} ${y}c-4-${h * 0.6} ${w * 0.2}-${h} ${w / 2}-${h}s${w / 2 + 4} ${h * 0.4} ${w / 2} ${h}Z"/>` +
		(berries
			? [0.2, 0.45, 0.7]
					.map(
						(f, i) =>
							`<circle class="ta-fruit" style="fill:${berries}" cx="${(x - w / 2 + f * w).toFixed(1)}" cy="${(y - h * (0.35 + (i % 2) * 0.25)).toFixed(1)}" r="2.4"/>`
					)
					.join('')
			: '') +
		`</g>`
	);
}

/** A small bug that hops between points. */
export function bug(x: number, y: number, d = 0) {
	return `<g class="ta-bug" style="--d:${d}s"><ellipse cx="${x}" cy="${y}" rx="4" ry="3"/><path d="M${x - 4} ${y - 2}l-3-2M${x + 4} ${y - 2}l3-2"/></g>`;
}
