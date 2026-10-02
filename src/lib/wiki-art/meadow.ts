/** Drawings for the guides on mowing less, lawn alternatives, mini forests and leaving plants standing. */
import { bug, ground, label, leader, log, plant, shrub, snow, sun, tree } from './kit';

/** Grass blades from x1 to x2 standing on y, `h` tall, leaning a little each way. */
function grass(x1: number, x2: number, y: number, h: number, step = 7) {
	let d = '';
	for (let x = x1, i = 0; x <= x2; x += step, i++) {
		const lean = (i % 3) - 1;
		d += `M${x} ${y}c${lean} -${h * 0.5} ${lean * 3} -${h * 0.8} ${lean * 2} -${h + (i % 2) * h * 0.2}`;
	}
	return `<path class="ta-grass-border" d="${d}"/>`;
}

function flower(x: number, y: number, r = 5, white = false) {
	return `<circle class="${white ? 'ta-flower-white' : 'ta-flower'}" cx="${x}" cy="${y}" r="${r}"/><circle class="ta-flower-c" cx="${x}" cy="${y}" r="${r * 0.4}"/>`;
}

const bumblebee = (x: number, y: number) =>
	`<g class="ta-bumble"><ellipse class="ta-bumble-body" cx="${x}" cy="${y}" rx="9" ry="6"/><path class="ta-bumble-stripe" d="M${x - 3} ${y - 5}v10M${x + 2} ${y - 6}v12"/><path class="ta-wing" d="M${x - 2} ${y - 6}c-4-9 7-11 5 0M${x + 4} ${y - 6}c4-9 12-5 3 2"/></g>`;

const butterfly = (x: number, y: number) =>
	`<g class="ta-butterfly"><path d="M${x} ${y}c-10-10-18-2-10 6 8 6 10-6 10-6Zm0 0c10-10 18-2 10 6-8 6-10-6-10-6Z"/><path d="M${x} ${y - 2}v10"/></g>`;

export const MEADOW_ART: Record<string, () => string> = {
	// Left: a lawn shaved weekly. Right: the same grass left to flower, with a mown path.
	'menej-kosenia': () =>
		ground(150) +
		sun(160, 26, 10) +
		grass(8, 128, 150, 7, 6) +
		label(68, 176, 'každý týždeň: len tráva', 'middle') +
		`<path class="ta-leader" d="M140 60V182"/>` +
		grass(150, 214, 150, 34) +
		grass(250, 314, 150, 30) +
		grass(220, 244, 150, 7, 6) +
		[
			[158, 104, false],
			[178, 112, true],
			[198, 100, false],
			[262, 110, true],
			[284, 104, false],
			[304, 114, true]
		]
			.map(([x, y, white]) => flower(x as number, y as number, 5, white as boolean))
			.join('') +
		bumblebee(188, 74) +
		butterfly(286, 70) +
		label(232, 136, 'chodník', 'middle') +
		leader(232, 139, 232, 148) +
		label(232, 176, 'raz–dvakrát do roka: lúka', 'middle'),

	// Four things that can grow where the lawn was.
	'namiesto-travnika': () =>
		ground(140) +
		// Flower meadow.
		grass(8, 70, 140, 30) +
		flower(18, 100) +
		flower(40, 94, 5, true) +
		flower(60, 102) +
		label(40, 158, 'kvetnatá lúka', 'middle') +
		// Clover lawn.
		grass(92, 150, 140, 9, 5) +
		[98, 112, 126, 140].map((x) => flower(x, 126, 3.5, true)).join('') +
		label(121, 158, 'ďatelina', 'middle') +
		// Creeping thyme between stepping stones.
		`<ellipse class="ta-stone" cx="182" cy="138" rx="12" ry="4"/><ellipse class="ta-stone" cx="214" cy="138" rx="12" ry="4"/>` +
		[170, 198, 228].map((x) => flower(x, 134, 3)).join('') +
		label(199, 158, 'materina dúška', 'middle') +
		// Edible bed with a berry shrub.
		shrub(272, 140, 30, 0.3, 'var(--tomato)') +
		plant(298, 140, 26, 0.6, 'fruit') +
		plant(250, 140, 18, 0.9) +
		label(276, 158, 'jedlý záhon', 'middle') +
		label(160, 180, 'menej práce, menej vody, viac života', 'middle') +
		sun(292, 26, 9),

	// A strip of lawn next to what can stand there: trees and shrubs planted densely, in layers.
	'mini-les': () =>
		ground(150) +
		sun(30, 24, 9) +
		grass(8, 92, 150, 7, 6) +
		label(50, 176, 'trávnik', 'middle') +
		`<path class="ta-mulch" d="M104 150c0-5 4-8 10-8h192c6 0 10 3 10 8Z"/>` +
		tree(152, 144, 76, 24, 0.2) +
		tree(236, 144, 88, 26, 0.9) +
		tree(120, 144, 42, 15, 0.5) +
		tree(194, 144, 50, 17, 1.3, 'var(--tomato)') +
		tree(284, 144, 46, 16, 0.1) +
		shrub(140, 146, 26, 0.7, 'var(--plum)') +
		shrub(218, 146, 28, 0.3) +
		shrub(258, 146, 24, 1.1, 'var(--tomato)') +
		shrub(304, 146, 22, 0.6) +
		label(8, 62, 'hlavné stromy') +
		leader(80, 59, 128, 66) +
		label(8, 90, 'nižšie stromy') +
		leader(78, 87, 105, 100) +
		label(8, 118, 'kry') +
		leader(26, 115, 128, 134) +
		label(210, 176, 'husto, vo vrstvách, pod mulčom', 'middle'),

	// A garden left standing for the winter: seed heads, hollow stems, leaves and a log pile.
	'nech-ziju': () =>
		ground(150) +
		[30, 52, 74, 96]
			.map(
				(x, i) =>
					`<path class="ta-stem" d="M${x} 150V${88 + (i % 2) * 12}"/><circle class="ta-seed-dot" cx="${x}" cy="${84 + (i % 2) * 12}" r="5"/>`
			)
			.join('') +
		label(64, 72, 'semená pre vtáky', 'middle') +
		label(64, 176, 'duté stonky = zimovisko', 'middle') +
		// Leaf pile.
		`<path class="ta-mulch" d="M128 150c4-22 18-30 32-30s28 8 32 30Z"/>` +
		bug(160, 138, 0.4) +
		label(160, 176, 'lístie', 'middle') +
		// Log pile.
		log(236, 138, 12) +
		log(262, 138, 12) +
		log(288, 138, 12) +
		log(249, 116, 12) +
		log(275, 116, 12) +
		`<g class="ta-ladybird"><circle cx="262" cy="98" r="5"/><path d="M262 93v10"/><circle class="ta-spot" cx="260" cy="97" r="1"/><circle class="ta-spot" cx="264" cy="100" r="1"/></g>` +
		label(262, 176, 'mŕtve drevo', 'middle') +
		snow(120, 40, 0) +
		snow(200, 30, 0.7) +
		snow(290, 54, 1.3) +
		snow(24, 34, 1.9)
};
