import {
	arrow,
	bug,
	crumbs,
	drop,
	ground,
	label,
	leader,
	log,
	plant,
	roots,
	shrub,
	snow,
	sun,
	tree,
	worm
} from './kit';

/** The starting, trees-and-mushrooms and harvest guides of Pestovanie. */
export const GARDEN_BASICS_ART: Record<string, () => string> = {
	'kde-pestovat': () => {
		// The sun sweeps an arc; each place gets a different share of it.
		const arc = `<path class="ta-sun-path" d="M20 70Q160 -10 300 70"/>`;
		return (
			arc +
			`<g class="ta-sun-travel">${sun(160, 30, 9)}</g>` +
			// Window sill.
			`<rect class="ta-window" x="20" y="96" width="70" height="60" rx="4"/><path class="ta-window-bar" d="M55 96v60M20 126h70"/>` +
			`<path class="ta-sill" d="M14 156h82"/>` +
			`<path class="ta-pot" d="M42 144h26l-3 12H45Z"/>` +
			plant(55, 144, 20, 0.2, 'sprout') +
			label(55, 176, 'okno', 'middle') +
			label(55, 188, 'bylinky, klíčky', 'middle') +
			// Balcony.
			`<path class="ta-rail" d="M120 120h80M120 158h80M128 120v38M144 120v38M160 120v38M176 120v38M192 120v38"/>` +
			`<path class="ta-pot" d="M126 108h68l-3 12h-62Z"/>` +
			plant(142, 108, 28, 0.4, 'fruit') +
			plant(172, 108, 24, 0.8) +
			label(160, 176, 'balkón', 'middle') +
			label(160, 188, 'paradajky, šalát', 'middle') +
			// Garden bed.
			`<rect class="ta-soil" x="220" y="150" width="96" height="10" rx="3"/>` +
			plant(236, 150, 34, 0.1, 'fruit') +
			plant(262, 150, 26, 0.6) +
			plant(290, 150, 38, 1, 'fruit') +
			label(266, 176, 'záhon', 'middle') +
			label(266, 188, 'celé jedlá', 'middle')
		);
	},

	polykultura: () =>
		`<rect class="ta-panel" x="6" y="10" width="148" height="172" rx="10"/>` +
		`<rect class="ta-panel" x="166" y="10" width="148" height="172" rx="10"/>` +
		label(80, 30, 'jedna plodina', 'middle') +
		label(240, 30, 'zmiešaná výsadba', 'middle') +
		`<path class="ta-ground" d="M14 140H146M174 140H306"/>` +
		[30, 60, 90, 120].map((x, i) => plant(x, 140, 30, i * 0.2)).join('') +
		// A pest hops happily from cabbage to cabbage…
		`<g class="ta-hop">${bug(30, 104, 0)}</g>` +
		`<g class="ta-hop" style="--d:0.6s">${bug(90, 104, 0)}</g>` +
		label(80, 164, 'škodca preskáče všetko', 'middle') +
		// …but gets lost among different plants.
		`<path class="ta-stem" d="M190 140V64"/><path class="ta-leaf" d="M190 90c-12-2-16-10-14-18 10 2 14 10 14 18Zm0 20c12-2 16-10 14-18-10 2-14 10-14 18Z"/>` +
		`<path class="ta-vine" d="M194 140c-8-10 8-16 0-26s8-16 0-26"/>` +
		plant(222, 140, 22, 0.3) +
		`<path class="ta-pumpkin-leaf" d="M250 140c-18 0-22-18-8-22 4-10 20-6 18 4 10 2 10 18-10 18Z"/>` +
		plant(282, 140, 28, 0.9, 'fruit') +
		`<circle class="ta-flower ta-marigold" cx="300" cy="120" r="5"/>` +
		`<g class="ta-lost">${bug(260, 80, 0)}</g>` +
		label(240, 164, 'škodca sa stratí', 'middle'),

	naradie: () => {
		const peg = (x: number) => `<circle class="ta-peg" cx="${x}" cy="30" r="3"/>`;
		const hang = (x: number, d: number, body: string) =>
			peg(x) + `<g class="ta-swing" style="--d:${d}s;transform-origin:${x}px 30px">${body}</g>`;
		return (
			`<path class="ta-board" d="M10 22h300v10H10Z"/>` +
			hang(
				40,
				0,
				`<path class="ta-handle-wood" d="M40 30v96"/><path class="ta-metal" d="M30 126h20v30a10 10 0 0 1-20 0Z"/>`
			) +
			hang(
				90,
				0.3,
				`<path class="ta-handle-wood" d="M90 30v96"/><path class="ta-metal" d="M78 126h24M80 126v26M87 126v28M93 126v28M100 126v26"/>`
			) +
			hang(
				140,
				0.6,
				`<path class="ta-handle-wood" d="M140 30v110"/><path class="ta-metal" d="M140 140l-14 10h28Z"/>`
			) +
			hang(
				190,
				0.9,
				`<path class="ta-metal" d="M190 30v40"/><path class="ta-can" d="M172 70h36v44a6 6 0 0 1-6 6h-24a6 6 0 0 1-6-6Z"/><path class="ta-can" d="M208 84l24-18M232 66l6 4-4 6"/>`
			) +
			hang(
				250,
				0.2,
				`<path class="ta-metal" d="M250 30v24"/><path class="ta-shears" d="M244 54l12 40M256 54l-12 40"/><circle class="ta-shears" cx="242" cy="98" r="5"/><circle class="ta-shears" cx="258" cy="98" r="5"/>`
			) +
			hang(
				290,
				0.5,
				`<path class="ta-metal" d="M290 30v18"/><path class="ta-glove" d="M280 48h20v34a10 10 0 0 1-20 0Z"/><path class="ta-glove" d="M280 60h-6v14"/>`
			) +
			label(40, 176, 'rýľ', 'middle') +
			label(90, 176, 'vidly', 'middle') +
			label(140, 176, 'motyčka', 'middle') +
			label(200, 176, 'krhla', 'middle') +
			label(250, 176, 'nožnice', 'middle') +
			label(290, 176, 'rukavice', 'middle')
		);
	},

	kompost: () => {
		const layers = [0, 1, 2, 3, 4, 5]
			.map(
				(i) =>
					`<rect class="${i % 2 ? 'ta-brown-layer' : 'ta-green-layer'}" x="44" y="${56 + i * 18}" width="112" height="18"/>`
			)
			.join('');
		return (
			layers +
			`<path class="ta-bin" d="M40 50v112h120V50"/><path class="ta-slat" d="M40 80h-6M40 110h-6M40 140h-6M160 80h6M160 110h6M160 140h6"/>` +
			worm(64, 140, 0) +
			worm(110, 122, 0.8) +
			`<g class="ta-heat"><path d="M80 40c3-4-3-6 0-10M100 36c3-4-3-6 0-10M120 40c3-4-3-6 0-10"/></g>` +
			label(100, 180, 'vrstvy, vlhké ako vyžmýkaná huba', 'middle') +
			label(170, 70, 'zelené: šupky, tráva') +
			leader(168, 67, 150, 65) +
			label(170, 88, 'hnedé: lístie, kartón') +
			leader(168, 85, 150, 83) +
			label(248, 124, '1 diel zeleného', 'middle') +
			label(248, 136, 'na 2 diely hnedého', 'middle') +
			`<rect class="ta-green-layer" x="224" y="146" width="16" height="16" rx="3"/>` +
			`<rect class="ta-brown-layer" x="246" y="146" width="16" height="16" rx="3"/><rect class="ta-brown-layer" x="266" y="146" width="16" height="16" rx="3"/>`
		);
	},

	'lesna-zahrada': () =>
		ground(160) +
		sun(296, 22, 9) +
		tree(92, 160, 70, 42, 0, 'var(--wood)') +
		tree(186, 160, 46, 28, 0.5, 'var(--tomato)') +
		shrub(236, 160, 38, 0.3, 'var(--plum)') +
		shrub(56, 160, 30, 0.9, 'var(--tomato)') +
		plant(140, 160, 22, 0.2) +
		plant(270, 160, 18, 0.6) +
		`<path class="ta-ground-cover" d="M112 160c4-6 10-6 14 0M126 160c4-6 10-6 14 0M152 160c4-6 10-6 14 0"/>` +
		`<path class="ta-vine" d="M200 160c-6-10 6-16 0-26s6-16 0-26"/>` +
		roots(140, 160, 16) +
		`<ellipse class="ta-bulb" cx="160" cy="174" rx="5" ry="4"/>` +
		label(92, 42, 'vysoký strom', 'middle') +
		label(186, 80, 'nízky strom', 'middle') +
		label(252, 112, 'kry', 'start') +
		label(140, 130, 'byliny', 'middle') +
		label(318, 150, 'pokryv', 'end') +
		label(210, 102, 'popínavé', 'start') +
		label(174, 186, 'pod zemou', 'start'),

	agrolesnictvo: () =>
		ground(150) +
		[20, 120, 220].map((x, i) => tree(x + 30, 150, 44, 22, i * 0.3, 'var(--tomato)')).join('') +
		[60, 160, 260]
			.map(
				(x) =>
					`<path class="ta-crop" d="M${x + 14} 150v-18M${x + 26} 150v-18M${x + 38} 150v-18M${x + 50} 150v-18"/>` +
					`<path class="ta-grain-head" d="M${x + 14} 132l-2-8 2-4 2 4ZM${x + 26} 132l-2-8 2-4 2 4ZM${x + 38} 132l-2-8 2-4 2 4ZM${x + 50} 132l-2-8 2-4 2 4Z"/>`
			)
			.join('') +
		`<g class="ta-wind"><path d="M-10 70h40M-10 84h30M-10 98h36"/></g>` +
		`<path class="ta-wind-slow" d="M84 84h20M186 84h14"/>` +
		roots(50, 150, 30) +
		roots(150, 150, 30) +
		label(160, 16, 'stromy lámu vietor, pole medzi nimi rodí', 'middle') +
		label(50, 184, 'rad stromov', 'middle') +
		label(150, 184, '10–30 m', 'middle'),

	'vysadba-stromu': () =>
		ground(120) +
		crumbs(124, 188, 30, 13) +
		// Planting hole twice as wide as the roots, stake on the south-west, graft above ground.
		`<path class="ta-hole" d="M90 120c0 40 20 52 70 52s70-12 70-52Z"/>` +
		`<path class="ta-compost-top" d="M100 120c4 12 20 18 60 18s56-6 60-18Z"/>` +
		roots(160, 124, 36) +
		`<path class="ta-trunk" d="M156 124V40h8v84Z"/>` +
		`<path class="ta-graft" d="M154 108h12"/>` +
		`<path class="ta-branch-thin" d="M160 60l-24-16M160 70l22-14M160 48l12-12"/>` +
		`<path class="ta-stake" d="M186 170V50"/><path class="ta-tie" d="M164 62l22 0"/>` +
		`<path class="ta-mulch-band" d="M108 116h36M176 116h36"/>` +
		drop(140, 20, 0) +
		drop(176, 14, 0.8) +
		leader(116, 108, 154, 108) +
		label(112, 104, 'štepné miesto', 'end') +
		label(112, 116, 'nad zemou', 'end') +
		label(196, 44, 'kôl', 'start') +
		label(236, 110, 'mulč, nie ku kmeňu', 'start') +
		label(160, 186, 'jama 2× širšia ako korene', 'middle') +
		label(40, 30, '2 vedrá vody', 'start'),

	huby: () =>
		// An oyster mushroom bag with clusters popping out, and an inoculated shiitake log.
		`<path class="ta-bag" d="M40 40h60l6 120H34Z"/><path class="ta-bag-tie" d="M58 40c4-8 20-8 24 0"/>` +
		[
			[34, 90],
			[104, 76],
			[36, 130]
		]
			.map(
				([x, y], i) =>
					`<g class="ta-cap-pop" style="--d:${i * 0.6}s;transform-origin:${x}px ${y}px">` +
					`<path class="ta-cap" d="M${x} ${y}c${x < 70 ? -18 : 18} -6 ${x < 70 ? -22 : 22} 6 ${x < 70 ? -16 : 16} 12Z"/>` +
					`<path class="ta-cap" d="M${x} ${y + 6}c${x < 70 ? -14 : 14} -2 ${x < 70 ? -16 : 16} 8 ${x < 70 ? -10 : 10} 12Z"/>` +
					`</g>`
			)
			.join('') +
		label(70, 178, 'hliva vo vrecku', 'middle') +
		`<g transform="rotate(-18 230 130)">${log(170, 130, 16)}<rect class="ta-log" x="170" y="114" width="120" height="32"/>${log(290, 130, 16)}` +
		[196, 224, 252].map((x) => `<circle class="ta-plug" cx="${x}" cy="124" r="2.5"/>`).join('') +
		[210, 240, 268]
			.map(
				(x, i) =>
					`<g class="ta-cap-pop" style="--d:${0.4 + i * 0.5}s;transform-origin:${x}px 114px"><path class="ta-stipe" d="M${x} 114v-6"/><path class="ta-shiitake" d="M${x - 9} 108a9 7 0 0 1 18 0Z"/></g>`
			)
			.join('') +
		`</g>` +
		label(232, 178, 'shiitake na polene', 'middle') +
		label(160, 20, 'huby nepotrebujú svetlo, len vlhko', 'middle'),

	semena: () => {
		const step = (x: number, n: string, title: string, inner: string) =>
			`<rect class="ta-panel" x="${x}" y="30" width="96" height="120" rx="10"/>` +
			`<circle class="ta-num" cx="${x + 14}" cy="44" r="9"/><text class="ta-label ta-strong ta-num-t" x="${x + 14}" y="47.5" text-anchor="middle">${n}</text>` +
			inner +
			label(x + 48, 168, title, 'middle');
		return (
			step(
				6,
				'1',
				'najkrajší plod',
				`<circle class="ta-tomato" cx="54" cy="100" r="26"/><path class="ta-stem" d="M54 74v-8M48 72l6 4 6-4"/>`
			) +
			step(
				112,
				'2',
				'2–3 dni kvasiť',
				`<path class="ta-jar" d="M136 70h48v60a6 6 0 0 1-6 6h-36a6 6 0 0 1-6-6Z"/><path class="ta-water" d="M138 96h44v34a4 4 0 0 1-4 4h-36a4 4 0 0 1-4-4Z"/>` +
					[0, 1, 2, 3]
						.map(
							(i) =>
								`<circle class="ta-bubble-dot" style="--d:${i * 0.4}s" cx="${148 + i * 8}" cy="126" r="2"/>`
						)
						.join('')
			) +
			step(
				218,
				'3',
				'usuš a označ',
				`<path class="ta-envelope" d="M234 80h64v50h-64Z"/><path class="ta-envelope" d="M234 80l32 24 32-24"/>` +
					`<text class="ta-label ta-small" x="266" y="124" text-anchor="middle">odroda, rok</text>` +
					[0, 1, 2, 3, 4]
						.map(
							(i) =>
								`<ellipse class="ta-seed-flax" cx="${244 + i * 11}" cy="${70 - (i % 2) * 3}" rx="3" ry="2"/>`
						)
						.join('')
			) +
			arrow(102, 90, 112, 90) +
			arrow(208, 90, 218, 90) +
			label(160, 186, 'len staré odrody, nie F1', 'middle')
		);
	},

	uskladnenie: () =>
		`<path class="ta-shelf-board" d="M10 70h170M10 130h170M16 70v106M174 70v106"/>` +
		[26, 56, 86]
			.map(
				(x, i) =>
					`<path class="ta-jar" d="M${x} 44h22v26H${x}Z"/><path class="ta-jar-fill ta-q${i + 2}" d="M${x + 2} 52h18v16h-18Z"/><path class="ta-jar-lid" d="M${x - 2} 40h26v5h-26Z"/>`
			)
			.join('') +
		`<path class="ta-onions" d="M122 40c-8 10-6 22 4 26 10-4 12-16 4-26M140 42c-8 10-6 22 4 26 10-4 12-16 4-26M158 40c-8 10-6 22 4 26 10-4 12-16 4-26"/><path class="ta-braid" d="M118 36h52"/>` +
		`<rect class="ta-crate" x="24" y="96" width="70" height="34" rx="3"/>` +
		[36, 52, 68, 82].map((x) => `<circle class="ta-apple" cx="${x}" cy="94" r="7"/>`).join('') +
		`<rect class="ta-crate ta-sand" x="104" y="104" width="66" height="26" rx="3"/>` +
		[116, 132, 148, 162]
			.map(
				(x) =>
					`<path class="ta-carrot" d="M${x} 104l3 18 3-18ZM${x + 1} 104l-2-6M${x + 3} 104l2-6"/>`
			)
			.join('') +
		label(96, 150, 'pivnica 0–10 °C', 'middle') +
		label(96, 162, 'mrkva v piesku, jablká zvlášť', 'middle') +
		// Freezer on the right.
		`<rect class="ta-fridge" x="214" y="34" width="84" height="126" rx="8"/><path class="ta-fridge-line" d="M214 70h84M226 44v14"/>` +
		[0, 1, 2]
			.map(
				(i) =>
					`<rect class="ta-freezer-bag" x="${226 + i * 22}" y="${96 + (i % 2) * 18}" width="18" height="24" rx="3"/>`
			)
			.join('') +
		snow(236, 84, 0) +
		snow(268, 80, 1.2) +
		label(256, 178, 'blanšíruj a zamraz', 'middle')
};
