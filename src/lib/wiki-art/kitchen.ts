import { arrow, drop, label, leader, snow } from './kit';

/** A pot sitting on (x, y) — the bottom centre — `w` wide and `h` tall, with liquid. */
export function pot(x: number, y: number, w: number, h: number, liquid = 'ta-water', fill = 0.7) {
	const l = x - w / 2;
	const top = y - h;
	const surface = y - h * fill;
	return (
		`<path class="ta-pot-body" d="M${l} ${top}h${w}v${h - 8}a8 8 0 0 1-8 8H${l + 8}a8 8 0 0 1-8-8Z"/>` +
		`<path class="${liquid}" d="M${l + 3} ${surface}c${w / 6} -3 ${w / 3} 3 ${w / 2 - 3} 0s${w / 3} 3 ${w / 2 - 3} 0V${y - 6}a5 5 0 0 1-5 5H${l + 8}a5 5 0 0 1-5-5Z"/>` +
		`<path class="ta-pot-handles" d="M${l} ${top + 8}h-8M${l + w} ${top + 8}h8"/>`
	);
}

export function flames(x: number, y: number, size = 1) {
	const f = (dx: number, s: number) =>
		`<path d="M${x + dx} ${y}c-${4 * s}-${6 * s} ${2 * s}-${8 * s} 0-${14 * s} ${6 * s} ${4 * s} ${6 * s} ${10 * s} 0 ${14 * s}Z"/>`;
	return `<g class="ta-flames">${f(-14 * size, 0.8 * size)}${f(0, size)}${f(14 * size, 0.8 * size)}</g>`;
}

export function bubbles(x: number, y: number, w: number, count = 4) {
	return Array.from(
		{ length: count },
		(_, i) =>
			`<circle class="ta-bubble-dot" style="--d:${(i * 0.35).toFixed(2)}s" cx="${(x - w / 2 + (w / (count + 1)) * (i + 1)).toFixed(1)}" cy="${y}" r="${2 + (i % 2)}"/>`
	).join('');
}

export function steam(x: number, y: number) {
	return `<g class="ta-steam-lines"><path d="M${x - 14} ${y}c-5-7 5-10 0-18M${x} ${y - 4}c-5-7 5-10 0-18M${x + 14} ${y}c-5-7 5-10 0-18"/></g>`;
}

export function jar(x: number, y: number, w: number, h: number, fill: string, lid = true) {
	return (
		`<rect class="ta-jar" x="${x}" y="${y}" width="${w}" height="${h}" rx="4"/>` +
		`<rect class="ta-jar-fill" style="fill:${fill}" x="${x + 2}" y="${y + h * 0.3}" width="${w - 4}" height="${h * 0.7 - 2}" rx="3"/>` +
		(lid
			? `<rect class="ta-jar-lid" x="${x - 2}" y="${y - 5}" width="${w + 4}" height="6" rx="2"/>`
			: '')
	);
}

export function knife(x: number, y: number, angle = 0, cls = '') {
	// The animation sits on an outer group: on the rotated one it would replace the rotation.
	return `<g class="${cls}"><g transform="rotate(${angle} ${x} ${y})"><path class="ta-blade" d="M${x} ${y}h54l-8 12H${x}Z"/><rect class="ta-knife-handle" x="${x - 30}" y="${y}" width="30" height="11" rx="4"/></g></g>`;
}

export const board = (x: number, y: number, w: number) =>
	`<rect class="ta-board-kitchen" x="${x}" y="${y}" width="${w}" height="12" rx="5"/>`;

export const KITCHEN_ART: Record<string, () => string> = {
	pizza: () =>
		// A pizza from above (pressed centre, untouched rim) and an oven heating a steel for 45 min.
		`<circle class="ta-dough" cx="78" cy="96" r="58"/>` +
		`<circle class="ta-sauce" cx="78" cy="96" r="44"/>` +
		[
			[60, 80],
			[94, 76],
			[70, 112],
			[100, 108],
			[82, 94]
		]
			.map(([x, y]) => `<circle class="ta-tortilla" cx="${x}" cy="${y}" r="7"/>`)
			.join('') +
		`<path class="ta-leaf" d="M88 120c-8-2-10-8-8-12 6 0 9 5 8 12ZM56 98c-2-8 2-12 7-12 1 6-2 10-7 12Z"/>` +
		[
			[38, 64],
			[118, 72],
			[124, 120],
			[44, 132]
		]
			.map(([x, y]) => `<circle class="ta-bubble-hole" cx="${x}" cy="${y}" r="3.5"/>`)
			.join('') +
		leader(130, 150, 120, 128) +
		label(78, 172, 'okraj 2 cm nestláčaj', 'middle') +
		`<rect class="ta-oven-box" x="170" y="40" width="136" height="104" rx="8"/>` +
		`<path class="ta-rack" d="M182 108h112"/>` +
		`<rect class="ta-metal" x="186" y="100" width="104" height="8" rx="2"/>` +
		`<g class="ta-heat"><path d="M204 94c-4-6 4-8 0-14M238 94c-4-6 4-8 0-14M272 94c-4-6 4-8 0-14"/></g>` +
		`<path class="ta-heat" style="animation-delay:0.6s" d="M200 56h76"/>` +
		label(238, 160, 'oceľ či plech 45 min', 'middle') +
		label(238, 174, 'na maxime rúry', 'middle') +
		label(238, 32, 'na konci gril', 'middle'),

	bezpecnost: () =>
		// Burning oil: the lid goes on, the flames die. Never water.
		`<path class="ta-hob" d="M30 150h130"/>` +
		pot(95, 150, 80, 50, 'ta-oil') +
		`<g class="ta-fire"><path d="M70 96c-6-10 4-14 0-26 12 8 12 18 0 26ZM95 96c-8-14 6-20 0-34 16 10 16 24 0 34ZM120 96c-6-10 4-14 0-26 12 8 12 18 0 26Z"/></g>` +
		`<g class="ta-lid-drop"><path class="ta-lid" d="M51 96h88"/><path class="ta-lid-knob" d="M88 96v-6h14v6"/></g>` +
		label(95, 172, 'prikry pokrievkou', 'middle') +
		label(95, 184, 'a vypni sporák', 'middle') +
		`<path class="ta-water-jug" d="M218 70h36v56a6 6 0 0 1-6 6h-24a6 6 0 0 1-6-6Z"/><path class="ta-water" d="M220 96h32v28a4 4 0 0 1-4 4h-24a4 4 0 0 1-4-4Z"/>` +
		`<path class="ta-no" d="M206 58l62 84M268 58l-62 84"/>` +
		label(237, 172, 'nikdy nie vodou', 'middle'),

	cibula: () =>
		board(20, 120, 150) +
		`<path class="ta-onion" d="M40 120c0-30 22-44 44-44s44 14 44 44Z"/>` +
		`<path class="ta-onion-ring" d="M52 120c0-20 14-32 32-32s32 12 32 32M64 120c0-12 8-20 20-20s20 8 20 20"/>` +
		`<path class="ta-root-end" d="M40 116c-6 0-8 4-10 8"/>` +
		`<g class="ta-cuts"><path d="M60 118V92M76 118V82M92 118V82M108 118V92"/></g>` +
		knife(96, 40, 90, 'ta-chop') +
		label(84, 150, 'koreň nechaj, drží pokope', 'middle') +
		[
			['#efe3b8', 'sklovitá', '3–5 min'],
			['#d9a24a', 'dozlatista', '8–10 min'],
			['#8a5226', 'karamel', '20–40 min']
		]
			.map(
				([color, name, time], i) =>
					`<circle class="ta-swatch" style="fill:${color}" cx="${204 + i * 46}" cy="96" r="14"/>` +
					label(204 + i * 46, 126, name, 'middle') +
					label(204 + i * 46, 138, time, 'middle')
			)
			.join('') +
		arrow(210, 70, 290, 70, 8),

	dochucovanie: () => {
		const pans = (x: number, y: number, name: string, cls: string) =>
			`<path class="ta-scale-pan ${cls}" d="M${x - 26} ${y}h52a26 12 0 0 1-52 0Z"/>` +
			label(x, y + 28, name, 'middle');
		return (
			`<path class="ta-scale-post" d="M160 170V50M130 170h60"/>` +
			`<g class="ta-balance"><path class="ta-scale-beam" d="M80 60h160"/>` +
			`<path class="ta-scale-string" d="M80 60v30M240 60v30"/>` +
			pans(80, 90, 'soľ, kyselina', '') +
			pans(240, 90, 'sladké, pálivé', '') +
			`<circle class="ta-salt-pile" cx="72" cy="86" r="5"/><ellipse class="ta-lemon-small" cx="88" cy="86" rx="7" ry="5"/>` +
			`<circle class="ta-sugar" cx="234" cy="87" r="4"/><path class="ta-chili-small" d="M244 86c4-2 10 0 12 4-6 2-10 0-12-4Z"/>` +
			`</g>` +
			`<circle class="ta-hub" cx="160" cy="60" r="5"/>` +
			label(160, 186, 'ochutnávaj priebežne a vyvažuj', 'middle') +
			label(160, 24, 'chýba hĺbka? umami: sójovka, miso, droždie', 'middle')
		);
	},

	'meal-prep': () =>
		`<path class="ta-hob" d="M10 150h96"/>` +
		pot(58, 150, 76, 50, 'ta-curry') +
		steam(58, 92) +
		[0, 1, 2].map((i) => arrow(104, 124, 140, 70 + i * 40, (1 - i) * 6)).join('') +
		[
			['Po', 60],
			['Ut', 100],
			['St', 140]
		]
			.map(
				([day, y]) =>
					`<rect class="ta-box-lid" x="146" y="${Number(y) - 16}" width="58" height="6" rx="2"/><rect class="ta-box" x="148" y="${Number(y) - 10}" width="54" height="22" rx="4"/><path class="ta-curry" d="M151 ${Number(y) - 4}h48v12a3 3 0 0 1-3 3h-42a3 3 0 0 1-3-3Z"/>` +
					label(175, Number(y) + 6, String(day), 'middle')
			)
			.join('') +
		`<rect class="ta-fridge" x="232" y="30" width="78" height="130" rx="8"/><path class="ta-fridge-line" d="M232 110h78M244 40v14M244 120v12"/>` +
		snow(270, 132, 0) +
		label(271, 80, '3–4 dni', 'middle') +
		label(271, 150, 'zvyšok mraz', 'middle') +
		label(58, 176, 'uvar raz', 'middle') +
		label(175, 176, 'jedz 3 dni', 'middle'),

	cestoviny: () =>
		`<path class="ta-hob" d="M30 160h140"/>` +
		pot(100, 160, 110, 80, 'ta-water', 0.8) +
		flames(100, 172) +
		`<g class="ta-pasta-swirl">` +
		[0, 1, 2, 3, 4]
			.map((i) => `<path class="ta-pasta" d="M${70 + i * 12} 140c6-10 0-20 6-30"/>`)
			.join('') +
		`</g>` +
		bubbles(100, 110, 100, 5) +
		`<path class="ta-ladle" d="M190 40l-30 60"/><path class="ta-cup-small" d="M204 104h36v20a8 8 0 0 1-8 8h-20a8 8 0 0 1-8-8Z"/><path class="ta-starch-water" d="M206 112h32v12a6 6 0 0 1-6 6h-20a6 6 0 0 1-6-6Z"/>` +
		label(222, 150, 'hrnček vody', 'middle') +
		label(222, 162, 'z varenia do omáčky', 'middle') +
		label(40, 40, '1 l vody na 100 g') +
		label(40, 54, '1 ČL soli na liter') +
		label(40, 68, 'z obalu mínus 1 min'),

	mrazenie: () => {
		const shelf = (y: number, text: string, cls: string) =>
			`<rect class="ta-box ${cls}" x="126" y="${y - 20}" width="40" height="20" rx="3"/>` +
			label(176, y - 6, text);
		return (
			// Clock: 2 hours at most on the counter.
			`<circle class="ta-clock-face" cx="54" cy="80" r="34"/><path class="ta-clock-hand ta-spin-slow" style="transform-origin:54px 80px" d="M54 80V54"/><path class="ta-clock-hand" d="M54 80h18"/>` +
			label(54, 136, 'max. 2 hodiny', 'middle') +
			label(54, 148, 'pri izbovej teplote', 'middle') +
			arrow(94, 80, 112, 80) +
			`<rect class="ta-fridge" x="116" y="20" width="194" height="160" rx="8"/><path class="ta-fridge-line" d="M116 136h194"/>` +
			shelf(56, 'kari, polievky 3–4 dni', 'ta-q3') +
			shelf(88, 'strukoviny 4–5 dní', 'ta-q4') +
			shelf(120, 'ryža len 1–2 dni', 'ta-q2') +
			snow(140, 158, 0) +
			snow(170, 152, 1) +
			label(200, 164, 'mraznička: mesiace')
		);
	},

	'menej-prace': () => {
		const step = (x: number, title: string, inner: string, d: number) =>
			`<rect class="ta-panel" x="${x}" y="40" width="68" height="96" rx="10"/>` +
			inner +
			label(x + 34, 156, title, 'middle') +
			`<path class="ta-check ta-check-pop" style="--d:${d}s" d="M${x + 24} 120l8 8 14-16"/>`;
		return (
			label(160, 24, 'kde sa stráca čas v kuchyni', 'middle') +
			step(
				8,
				'rozhodovanie',
				`<rect class="ta-cal" x="24" y="56" width="36" height="34" rx="4"/><path class="ta-cal-line" d="M24 66h36M32 52v8M52 52v8M30 74h6M40 74h6M50 74h6M30 82h6"/>`,
				0
			) +
			step(
				86,
				'hľadanie',
				`<path class="ta-rack" d="M98 88h44"/>` +
					[0, 1, 2]
						.map((i) => jar(100 + i * 14, 62, 10, 26, ['#e0a030', '#c0442a', '#7a9a3a'][i], true))
						.join(''),
				0.4
			) +
			step(164, 'krájanie', board(172, 90, 52) + knife(188, 70, 20, 'ta-chop'), 0.8) +
			step(
				242,
				'umývanie',
				`<path class="ta-sink" d="M254 70h44v20a6 6 0 0 1-6 6h-32a6 6 0 0 1-6-6Z"/><path class="ta-tap" d="M276 70V56h10v6"/>` +
					drop(286, 64, 0, 14),
				1.2
			) +
			label(160, 182, 'plán, poriadok, krájanie naraz, jeden hrniec', 'middle')
		);
	},

	quinoa: () =>
		// Rinse in a sieve, 1 : 2 water, 15 minutes, little tails.
		`<path class="ta-sieve" d="M20 60h70a35 30 0 0 1-70 0Z"/><path class="ta-sieve-mesh" d="M28 70h54M34 80h42M42 88h26"/><path class="ta-handle-long" d="M90 60h24"/>` +
		Array.from(
			{ length: 10 },
			(_, i) =>
				`<circle class="ta-grain-dot" cx="${34 + (i % 5) * 9}" cy="${66 + Math.floor(i / 5) * 6}" r="2.2"/>`
		).join('') +
		drop(46, 92, 0, 18) +
		drop(62, 94, 0.6, 18) +
		label(55, 130, 'prepláchni', 'middle') +
		label(55, 142, '(horké saponíny)', 'middle') +
		arrow(118, 80, 146, 80) +
		`<path class="ta-hob" d="M150 150h90"/>` +
		pot(195, 150, 74, 56) +
		`<g class="ta-lid-lift"><path class="ta-lid" d="M156 94h78"/><path class="ta-lid-knob" d="M188 94v-6h14v6"/></g>` +
		label(195, 170, '1 : 2 vody, 15 min', 'middle') +
		arrow(244, 80, 262, 80) +
		Array.from(
			{ length: 5 },
			(_, i) =>
				`<g class="ta-pop" style="transform-origin:${276 + i * 8}px 90px"><circle class="ta-grain-dot" cx="${276 + i * 8}" cy="90" r="3"/><path class="ta-tail" d="M${276 + i * 8} 90c3 2 4 5 2 8"/></g>`
		).join('') +
		label(292, 124, 'biele', 'middle') +
		label(292, 136, 'chvostíky', 'middle'),

	korenie: () =>
		`<path class="ta-hob" d="M20 150h130"/>` +
		`<path class="ta-pan" d="M30 118h96l-8 16H38Z"/><path class="ta-handle-long" d="M126 120l30-8"/>` +
		`<path class="ta-oil" d="M36 118h84v6H36Z"/>` +
		Array.from(
			{ length: 8 },
			(_, i) =>
				`<circle class="ta-spice-dot" style="fill:${['#c0442a', '#e0a030', '#7a5a2a'][i % 3]}" cx="${44 + i * 10}" cy="${118 + (i % 2) * 2}" r="2"/>`
		).join('') +
		flames(78, 164, 0.8) +
		`<g class="ta-aroma"><path d="M50 104c-8-10 8-16 0-26s8-16 0-26M78 100c-8-10 8-16 0-26s8-16 0-26M106 104c-8-10 8-16 0-26s8-16 0-26"/></g>` +
		label(78, 180, '30–60 s v oleji – zavonia', 'middle') +
		pot(240, 150, 80, 54) +
		Array.from(
			{ length: 6 },
			(_, i) =>
				`<circle class="ta-spice-dot" style="fill:#e0a030" cx="${212 + i * 11}" cy="${112 + (i % 2) * 2}" r="2"/>`
		).join('') +
		label(240, 180, 'rovno do vody – slabšie', 'middle'),

	jednotky: () => {
		const spoon = (x: number, r: number, name: string, ml: string) =>
			`<ellipse class="ta-spoon-bowl" cx="${x}" cy="90" rx="${r * 1.3}" ry="${r}"/><path class="ta-spoon-handle" d="M${x} ${90 + r}v${60 - r}"/>` +
			`<path class="ta-level" d="M${x - r * 1.5} ${90 - r * 0.2}h${r * 3}"/>` +
			label(x, 170, name, 'middle') +
			label(x, 182, ml, 'middle');
		return (
			spoon(46, 16, 'PL', '15 ml') +
			spoon(108, 9, 'ČL', '5 ml') +
			`<path class="ta-mug" d="M160 70h56v64a10 10 0 0 1-10 10h-36a10 10 0 0 1-10-10Z"/><path class="ta-mug" d="M216 84c14 0 14 28 0 28"/><path class="ta-water" d="M162 86h52v46a8 8 0 0 1-8 8h-36a8 8 0 0 1-8-8Z"/>` +
			label(188, 170, 'hrnček', 'middle') +
			label(188, 182, '240 ml', 'middle') +
			`<path class="ta-fingers" d="M260 80c10-10 26-8 30 4M262 96c10 6 24 4 28-8"/><g class="ta-pinch">${[0, 1, 2].map((i) => `<rect class="ta-grain" style="--d:${i * 0.4}s" x="${272 + i * 5}" y="100" width="3" height="3"/>`).join('')}</g>` +
			label(276, 170, 'štipka', 'middle') +
			label(276, 182, '≈ 0,5 g', 'middle') +
			label(160, 30, 'lyžice zarovnané, nie s kopčekom', 'middle')
		);
	},

	ryza: () =>
		`<path class="ta-cupmeasure" d="M20 70h40l-4 40H24Z"/><path class="ta-rice-fill" d="M22 80h36l-3 28H25Z"/>` +
		label(40, 128, '1 diel ryže', 'middle') +
		`<path class="ta-cupmeasure" d="M76 60h44l-4 50H80Z"/><path class="ta-water" d="M78 72h40l-3 36H81Z"/>` +
		label(98, 128, '1,5 dielu vody', 'middle') +
		arrow(126, 90, 150, 90) +
		`<path class="ta-hob" d="M156 150h100"/>` +
		pot(206, 150, 80, 54) +
		`<path class="ta-lid" d="M164 94h84"/><path class="ta-lid-knob" d="M199 94v-6h14v6"/>` +
		flames(206, 162, 0.5) +
		label(206, 172, 'najmenší oheň 12 min', 'middle') +
		label(206, 184, '+ 10 min pod pokrievkou', 'middle') +
		`<path class="ta-spoon-handle" d="M282 50l-14 40"/><ellipse class="ta-spoon-bowl" cx="266" cy="96" rx="6" ry="8"/>` +
		`<path class="ta-no" d="M254 50l40 52M294 50l-40 52"/>` +
		label(274, 124, 'nemiešaj', 'middle'),

	supanie: () =>
		board(20, 120, 180) +
		`<path class="ta-carrot-big" d="M40 104l140-10c6 0 8 14 0 16L40 116c-6 0-6-12 0-12Z"/><path class="ta-carrot-top" d="M182 96l14-10M184 102l18-2M182 108l14 8"/>` +
		`<g class="ta-peeler-move"><path class="ta-peeler" d="M86 80h26v8H86Z"/><path class="ta-peeler-handle" d="M99 80V50"/></g>` +
		[0, 1, 2]
			.map(
				(i) =>
					`<path class="ta-peel" style="--d:${i * 0.5}s" d="M${96 + i * 4} 92c6-10 14-8 12 2"/>`
			)
			.join('') +
		label(110, 146, 'škrabkou od seba', 'middle') +
		`<path class="ta-ginger" d="M232 110c-8-10 2-22 14-18 6-10 22-8 24 2 12 0 16 16 4 22-10 6-34 6-42-6Z"/>` +
		`<g class="ta-spoon-scrape"><ellipse class="ta-spoon-bowl" cx="256" cy="86" rx="8" ry="6"/><path class="ta-spoon-handle" d="M262 82l30-30"/></g>` +
		label(262, 146, 'zázvor hranou lyžičky', 'middle') +
		label(160, 180, 'mladé zemiaky a mrkvu stačí vydrhnúť', 'middle'),

	tofu: () =>
		// Pressing: a board and books squeeze water out of the wrapped tofu.
		`<path class="ta-plate-flat" d="M20 150h140"/>` +
		`<rect class="ta-towel" x="36" y="116" width="108" height="34" rx="6"/>` +
		`<rect class="ta-tofu" x="44" y="120" width="92" height="26" rx="4"/>` +
		`<g class="ta-press"><rect class="ta-board-kitchen" x="30" y="104" width="120" height="10" rx="4"/>` +
		`<rect class="ta-book" x="46" y="80" width="88" height="12" rx="2"/><rect class="ta-book ta-book-2" x="52" y="92" width="76" height="12" rx="2"/>` +
		`</g>` +
		drop(34, 144, 0, 12) +
		drop(148, 144, 0.7, 12) +
		label(90, 172, 'vylisuj 15–30 min', 'middle') +
		arrow(166, 124, 190, 124) +
		`<path class="ta-pan" d="M196 124h96l-8 16h-80Z"/><path class="ta-handle-long" d="M292 126l24-6"/>` +
		[0, 1, 2, 3]
			.map(
				(i) =>
					`<rect class="ta-tofu ta-sear" style="--d:${i * 0.3}s" x="${206 + i * 20}" y="112" width="14" height="12" rx="3"/>`
			)
			.join('') +
		flames(244, 162, 0.7) +
		label(244, 180, 'rozpálená panvica, 3 min nehýbať', 'middle'),

	'cesnak-zazvor': () =>
		board(20, 128, 150) +
		`<g class="ta-smash"><path class="ta-blade" d="M40 104h110l-10 14H40Z"/><rect class="ta-knife-handle" x="12" y="104" width="30" height="12" rx="4"/><path class="ta-palm" d="M92 90c10-10 30-10 40 0v12H92Z"/></g>` +
		`<path class="ta-garlic" d="M80 128c-4-10 2-16 10-16s12 8 10 16Z"/>` +
		`<g class="ta-skin-fly"><path class="ta-garlic-skin" d="M78 120c-8-4-12-2-14 2M104 120c8-4 12-2 14 2"/></g>` +
		label(95, 158, 'pritlač plochou noža,', 'middle') +
		label(95, 170, 'šupka odpadne', 'middle') +
		`<path class="ta-grater" d="M216 50h40l6 100h-52Z"/><path class="ta-grater-holes" d="M222 70h28M220 90h32M218 110h36M216 130h40"/>` +
		`<g class="ta-grate-move"><path class="ta-ginger" d="M262 70c8-4 22 0 22 10s-10 14-22 10Z"/></g>` +
		`<g class="ta-shreds"><path d="M226 156v8M236 158v8M246 156v8"/></g>` +
		label(240, 180, 'zmrazený sa strúha najlepšie', 'middle'),

	'pecenie-zeleniny': () => {
		const tray = (x: number, crowded: boolean) =>
			`<rect class="ta-tray" x="${x}" y="98" width="130" height="14" rx="3"/>` +
			(crowded
				? Array.from(
						{ length: 16 },
						(_, i) =>
							`<rect class="ta-veg-piece ta-soggy" x="${x + 6 + (i % 8) * 15}" y="${84 + Math.floor(i / 8) * 9}" width="14" height="12" rx="3"/>`
					).join('') + steam(x + 65, 70)
				: Array.from(
						{ length: 6 },
						(_, i) =>
							`<rect class="ta-veg-piece ta-roast" style="--d:${i * 0.2}s" x="${x + 10 + i * 20}" y="86" width="12" height="12" rx="3"/>`
					).join(''));
		return (
			label(160, 24, 'rúra 200–220 °C', 'middle') +
			tray(18, false) +
			label(83, 136, 'rozostupy – opečie sa', 'middle') +
			`<path class="ta-check" d="M70 150l8 8 14-16"/>` +
			tray(172, true) +
			label(237, 136, 'nakopené – dusí sa', 'middle') +
			`<path class="ta-no" d="M226 146l20 20M246 146l-20 20"/>` +
			`<g class="ta-heat"><path d="M40 60c3-4-3-6 0-10M80 56c3-4-3-6 0-10M120 60c3-4-3-6 0-10"/></g>`
		);
	},

	rura: () => {
		// Cross-section: heaters top and bottom, a fan at the back, three shelf heights.
		const shelf = (y: number) => `<path class="ta-rail" d="M34 ${y}h150"/>`;
		const fan =
			`<g class="ta-spin" style="transform-origin:170px 100px"><path class="ta-rail" d="M170 92v16M162 100h16M164 94l12 12M176 94l-12 12"/></g>` +
			`<circle class="ta-rail" cx="170" cy="100" r="11" fill="none"/>`;
		return (
			`<rect class="ta-oven-box" x="20" y="22" width="178" height="150" rx="10"/>` +
			`<rect class="ta-window" x="30" y="34" width="158" height="126" rx="6"/>` +
			`<path class="ta-heat" d="M40 44l8 5 8-5 8 5 8-5 8 5 8-5 8 5 8-5 8 5 8-5 8 5 8-5"/>` +
			`<path class="ta-heat" d="M40 152l8-5 8 5 8-5 8 5 8-5 8 5 8-5 8 5 8-5 8 5 8-5 8 5"/>` +
			shelf(70) +
			shelf(102) +
			shelf(134) +
			`<rect class="ta-tray" x="44" y="96" width="96" height="6" rx="2"/>` +
			Array.from(
				{ length: 5 },
				(_, i) =>
					`<rect class="ta-veg-piece ta-roast" style="--d:${i * 0.2}s" x="${50 + i * 18}" y="86" width="11" height="10" rx="3"/>`
			).join('') +
			fan +
			label(206, 72, 'hore – zapečenie') +
			label(206, 104, 'stred – skoro všetko') +
			label(206, 136, 'dole – pizza, chlieb') +
			label(109, 186, 'ventilátor = o 20 °C menej', 'middle')
		);
	},

	krajanie: () =>
		board(14, 132, 170) +
		// The guiding hand: fingertips tucked in, the blade rides on the knuckles.
		`<path class="ta-hand" d="M112 132c-4-20 0-40 12-44 6-2 12 2 12 8 6-4 12 0 12 6 6-2 12 2 10 10l-4 20Z"/>` +
		`<path class="ta-knuckle" d="M120 96c-4 4-4 10 0 14M132 98c-4 4-4 10 0 14M144 102c-4 4-4 10 0 14"/>` +
		`<path class="ta-cucumber" d="M24 120h86v12H24a6 6 0 0 1 0-12Z"/>` +
		knife(110, 64, 90, 'ta-chop') +
		label(90, 156, 'mačacia labka', 'middle') +
		[
			['nadrobno', 2],
			['kocky', 12],
			['plátky', 4],
			['pásiky', 3]
		]
			.map(([name, size], i) => {
				const x = 214 + (i % 2) * 52;
				const y = 50 + Math.floor(i / 2) * 64;
				const shape =
					name === 'kocky'
						? `<rect class="ta-veg-piece" x="${x - 8}" y="${y}" width="14" height="14" rx="2"/><rect class="ta-veg-piece" x="${x + 8}" y="${y + 4}" width="12" height="12" rx="2"/>`
						: name === 'plátky'
							? `<ellipse class="ta-veg-piece" cx="${x}" cy="${y + 8}" rx="12" ry="${size}"/><ellipse class="ta-veg-piece" cx="${x + 6}" cy="${y + 16}" rx="12" ry="${size}"/>`
							: name === 'pásiky'
								? `<path class="ta-strip" d="M${x - 14} ${y + 4}h30M${x - 14} ${y + 10}h30M${x - 14} ${y + 16}h30"/>`
								: Array.from(
										{ length: 9 },
										(_, j) =>
											`<rect class="ta-veg-piece" x="${x - 10 + (j % 3) * 7}" y="${y + 2 + Math.floor(j / 3) * 6}" width="4" height="4"/>`
									).join('');
				return shape + label(x + 2, y + 34, String(name), 'middle');
			})
			.join(''),

	slovnik: () =>
		[
			['mierny', 'dusiť', 0.5, 2],
			['stredný', 'variť', 0.8, 4],
			['vysoký', 'restovať', 1.1, 7]
		]
			.map(([heat, verb, size, n], i) => {
				const x = 58 + i * 102;
				return (
					`<path class="ta-hob" d="M${x - 44} 140h88"/>` +
					pot(x, 140, 70, 46) +
					flames(x, 154, Number(size)) +
					bubbles(x, 116, 60, Number(n)) +
					label(x, 172, `${heat} oheň`, 'middle') +
					label(x, 186, String(verb), 'middle')
				);
			})
			.join('') + label(160, 30, 'ako silno bublá, podľa slov v recepte', 'middle'),

	bylinky: () =>
		`<path class="ta-glass" d="M40 100h40l-4 60H44Z"/><path class="ta-water" d="M42 120h36l-3 38H45Z"/>` +
		`<g class="ta-sway" style="--d:0s;transform-origin:60px 120px"><path class="ta-stem" d="M52 150V70M60 150V62M68 150V72"/>` +
		`<path class="ta-leaf" d="M52 70c-10-2-14-10-12-16 8 2 12 10 12 16ZM60 62c-8-6-8-14-4-18 6 4 8 12 4 18ZM68 72c10-2 14-10 12-16-8 2-12 10-12 16Z"/></g>` +
		`<path class="ta-bag-over" d="M28 40c10-6 54-6 64 0l-8 70H36Z"/>` +
		label(60, 176, 'petržlen: v chladničke', 'middle') +
		label(60, 188, 'ako kytica pod sáčkom', 'middle') +
		`<path class="ta-glass" d="M150 110h40l-4 50h-32Z"/><path class="ta-water" d="M152 126h36l-3 32h-30Z"/>` +
		`<g class="ta-sway" style="--d:0.5s;transform-origin:170px 126px"><path class="ta-stem" d="M166 150V84M174 150V88"/><path class="ta-leaf" d="M166 84c-12 0-16-8-14-14 10 0 14 8 14 14ZM174 88c12 0 16-8 14-14-10 0-14 8-14 14ZM170 104c-10 2-16-4-16-10 10-2 16 4 16 10Z"/></g>` +
		label(170, 176, 'bazalka: na linke', 'middle') +
		`<rect class="ta-tray-ice" x="226" y="96" width="84" height="40" rx="4"/>` +
		[0, 1, 2, 3, 4, 5]
			.map(
				(i) =>
					`<rect class="ta-ice-cube" x="${232 + (i % 3) * 26}" y="${100 + Math.floor(i / 3) * 18}" width="20" height="14" rx="2"/>`
			)
			.join('') +
		snow(268, 78, 0) +
		label(268, 176, 'mrazené v oleji', 'middle'),

	'kysnute-cesto': () =>
		`<path class="ta-bowl" d="M40 110h120a60 50 0 0 1-120 0Z"/>` +
		`<g class="ta-rise-dough"><path class="ta-dough" d="M52 112c0-24 20-36 48-36s48 12 48 36Z"/></g>` +
		`<path class="ta-towel-over" d="M34 104c20-6 112-6 132 0"/>` +
		label(100, 180, 'kysne, kým nezdvojnásobí objem', 'middle') +
		`<circle class="ta-clock-face" cx="220" cy="64" r="26"/><path class="ta-clock-hand ta-spin-slow" style="transform-origin:220px 64px" d="M220 64V44"/>` +
		label(220, 108, '45–90 min', 'middle') +
		`<path class="ta-thermo" d="M284 36v58"/><circle class="ta-thermo-bulb" cx="284" cy="100" r="7"/>` +
		label(284, 124, 'voda', 'middle') +
		label(284, 136, '~35 °C', 'middle') +
		`<path class="ta-dough-film" d="M196 150c10-8 38-8 48 0"/><path class="ta-fingers" d="M190 156c4-4 8-4 8 0M242 156c4-4 8-4 8 0"/>` +
		label(220, 176, 'test blany', 'middle'),

	strukoviny: () =>
		// Overnight soak: the beans swell two to three times.
		`<path class="ta-moon" d="M36 26a14 14 0 1 0 14 22 11 11 0 1 1-14-22Z"/>` +
		`<path class="ta-jar" d="M60 50h70v110a8 8 0 0 1-8 8H68a8 8 0 0 1-8-8Z"/><path class="ta-water" d="M62 70h66v88a6 6 0 0 1-6 6H68a6 6 0 0 1-6-6Z"/>` +
		`<g class="ta-swell">` +
		Array.from(
			{ length: 12 },
			(_, i) =>
				`<ellipse class="ta-bean" cx="${72 + (i % 4) * 14}" cy="${150 - Math.floor(i / 4) * 12}" rx="6" ry="4"/>`
		).join('') +
		`</g>` +
		label(95, 184, 'namoč cez noc', 'middle') +
		arrow(140, 110, 166, 110) +
		label(153, 98, 'sceď', 'middle') +
		`<path class="ta-hob" d="M176 150h110"/>` +
		pot(231, 150, 90, 60) +
		bubbles(231, 110, 80, 4) +
		`<path class="ta-foam" d="M196 100c6-4 12 0 18-2s12 2 18 0 12 2 16 0"/>` +
		flames(231, 162, 0.6) +
		label(231, 172, 'čerstvá voda, mierny var', 'middle') +
		label(231, 184, 'penu zober lyžicou', 'middle'),

	umyvanie: () =>
		`<path class="ta-bowl" d="M40 90h180a90 60 0 0 1-180 0Z"/>` +
		`<path class="ta-water" d="M46 96h168a84 52 0 0 1-168 0Z"/>` +
		`<g class="ta-lift"><path class="ta-leaf" d="M90 100c-14-14-4-30 14-24 10-10 28-2 24 12 14 4 8 22-8 18-6 10-26 8-30-6Z"/><path class="ta-leaf" d="M140 98c-8-16 8-26 20-18 12-6 24 6 16 16 8 8-4 20-16 12-8 6-20 0-20-10Z"/></g>` +
		Array.from(
			{ length: 8 },
			(_, i) =>
				`<circle class="ta-sand-grain" style="--d:${(i * 0.3).toFixed(1)}s" cx="${80 + i * 14}" cy="112" r="1.8"/>`
		).join('') +
		label(130, 170, 'piesok klesne, listy vyber hore', 'middle') +
		`<path class="ta-mushroom" d="M262 110a22 16 0 0 1 44 0Z"/><path class="ta-stipe" d="M284 110v24"/><path class="ta-brush" d="M252 80l20 20M246 86l12-12"/>` +
		label(284, 156, 'huby len', 'middle') +
		label(284, 168, 'kefkou', 'middle'),

	vyprazanie: () =>
		`<path class="ta-hob" d="M20 170h160"/>` +
		pot(100, 170, 120, 110, 'ta-oil', 0.33) +
		`<path class="ta-max" d="M40 133h120"/>` +
		label(168, 136, 'max. 1/3', 'start') +
		`<path class="ta-spoon-wood" d="M80 40l12 110"/><ellipse class="ta-spoon-wood" cx="93" cy="154" rx="5" ry="8"/>` +
		`<g class="ta-fry-bubbles">${[0, 1, 2, 3].map((i) => `<circle style="--d:${i * 0.25}s" cx="${86 + (i % 2) * 12}" cy="${160 - i * 4}" r="2"/>`).join('')}</g>` +
		label(40, 200 - 10, 'bublinky pri vareške = pripravené', 'start') +
		`<path class="ta-thermo" d="M132 30v110"/><circle class="ta-thermo-bulb" cx="132" cy="146" r="6"/>` +
		label(142, 60, '170–180 °C', 'start') +
		label(214, 90, 'po malých dávkach,', 'start') +
		label(214, 102, 'vkladaj od seba', 'start'),

	zahustovanie: () =>
		`<path class="ta-cup-small" d="M24 80h40v40a8 8 0 0 1-8 8H32a8 8 0 0 1-8-8Z"/><path class="ta-slurry" d="M26 92h36v28a6 6 0 0 1-6 6H32a6 6 0 0 1-6-6Z"/>` +
		label(44, 146, '1 ČL škrobu', 'middle') +
		label(44, 158, '+ 2 PL studenej vody', 'middle') +
		`<g class="ta-pour"><path class="ta-slurry-stream" d="M70 86c20-6 40 4 60 20"/></g>` +
		`<path class="ta-hob" d="M110 160h140"/>` +
		pot(180, 160, 110, 60, 'ta-sauce') +
		bubbles(180, 120, 90, 5) +
		`<g class="ta-stir"><path class="ta-spoon-wood" d="M200 60l-14 70"/></g>` +
		flames(180, 172, 0.7) +
		label(180, 186, 'do vriacej, za stáleho miešania', 'middle') +
		label(270, 40, 'zhustne za', 'middle') +
		label(270, 52, 'pár sekúnd', 'middle'),

	zasoby: () =>
		`<path class="ta-shelf-board" d="M10 70h210M10 130h210M16 20v160M214 20v160"/>` +
		[
			['#c0442a', 'šošovica'],
			['#e3c98a', 'cícer'],
			['#f1ead8', 'ryža'],
			['#d9c08a', 'vločky']
		]
			.map(
				([color, name], i) =>
					jar(24 + i * 48, 26, 36, 44, color) + label(42 + i * 48, 86, name, 'middle')
			)
			.join('') +
		[0, 1, 2]
			.map(
				(i) =>
					`<rect class="ta-can-tin" x="${26 + i * 34}" y="96" width="28" height="34" rx="3"/><path class="ta-can-band" d="M${26 + i * 34} 108h28"/>`
			)
			.join('') +
		Array.from({ length: 6 }, (_, i) =>
			jar(
				134 + (i % 3) * 24,
				102 + Math.floor(i / 3) * 0,
				16,
				28,
				['#e0a030', '#c0442a', '#7a9a3a', '#b5651d', '#d9582f', '#8a6a3a'][i],
				true
			)
		).join('') +
		label(115, 150, 'strukoviny, obilniny, plechovky, korenie', 'middle') +
		`<path class="ta-sack" d="M246 70c-4 20-6 60 0 100h54c6-40 4-80 0-100-8-8-46-8-54 0Z"/><path class="ta-sack-tie" d="M250 72c12 6 34 6 46 0"/>` +
		`<text class="ta-label ta-strong" x="273" y="130" text-anchor="middle">5 kg</text>` +
		label(273, 186, 'vo veľkom lacnejšie', 'middle')
};
