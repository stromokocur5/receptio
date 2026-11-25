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
