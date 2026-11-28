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

	vermikompost: () =>
		[0, 1, 2]
			.map(
				(i) =>
					`<rect class="ta-bin-tray" x="70" y="${40 + i * 42}" width="150" height="38" rx="4"/>` +
					`<rect class="${i === 0 ? 'ta-green-layer' : i === 1 ? 'ta-brown-layer' : 'ta-compost-done'}" x="74" y="${50 + i * 42}" width="142" height="26"/>`
			)
			.join('') +
		`<rect class="ta-bin-tray" x="66" y="166" width="158" height="16" rx="3"/><path class="ta-tap" d="M224 174h12v6"/>` +
		drop(236, 180, 0, 8) +
		worm(96, 66, 0) +
		worm(150, 60, 0.6) +
		worm(120, 104, 1.2) +
		`<path class="ta-arrow" d="M250 150V60M244 68l6-8 6 8"/>` +
		label(258, 108, 'dážďovky', 'start') +
		label(258, 120, 'idú hore', 'start') +
		label(258, 132, 'za jedlom', 'start') +
		label(64, 64, 'čerstvé zvyšky', 'end') +
		label(64, 106, 'spracúva sa', 'end') +
		label(64, 148, 'hotový kompost', 'end') +
		label(160, 26, 'nezapácha, zmestí sa pod umývadlo', 'middle'),

	bokashi: () =>
		`<path class="ta-bucket" d="M90 40h120l-10 130H100Z"/><path class="ta-bucket-lid" d="M84 34h132v10H84Z"/>` +
		[0, 1, 2, 3]
			.map(
				(i) =>
					`<rect class="${i % 2 ? 'ta-scraps' : 'ta-scraps ta-scraps-alt'}" x="${100 + (i % 2) * 2}" y="${140 - i * 22}" width="${96 - (i % 2) * 4}" height="18" rx="3"/>`
			)
			.join('') +
		[0, 1, 2, 3, 4, 5]
			.map(
				(i) =>
					`<circle class="ta-bran" style="--d:${i * 0.25}s" cx="${118 + i * 12}" cy="56" r="1.8"/>`
			)
			.join('') +
		`<g class="ta-press"><rect class="ta-plate-press" x="104" y="44" width="92" height="6" rx="3"/></g>` +
		`<path class="ta-tap" d="M200 158h16v6"/>` +
		drop(216, 166, 0, 10) +
		label(240, 90, 'posyp na každú', 'start') +
		label(240, 102, 'vrstvu, pritlačiť', 'start') +
		label(240, 150, 'tekutina 1 : 100', 'start') +
		label(240, 162, 'ako hnojivo', 'start') +
		label(50, 100, '2 týždne', 'middle') +
		label(50, 112, 'kvasiť', 'middle') +
		label(50, 124, 'zatvorené', 'middle'),

	poda: () =>
		`<rect class="ta-glass-tall" x="40" y="30" width="70" height="140" rx="6"/>` +
		`<g class="ta-settle">` +
		`<rect class="ta-sand-layer" x="44" y="130" width="62" height="36"/>` +
		`<rect class="ta-silt-layer" x="44" y="104" width="62" height="26"/>` +
		`<rect class="ta-clay-layer" x="44" y="90" width="62" height="14"/>` +
		`</g>` +
		`<rect class="ta-water-muddy" x="44" y="48" width="62" height="42"/>` +
		`<path class="ta-humus" d="M50 50h8M66 52h10M84 50h8"/>` +
		leader(112, 148, 130, 148) +
		label(134, 151, 'piesok') +
		leader(112, 117, 130, 117) +
		label(134, 120, 'prach (hlina)') +
		leader(112, 97, 130, 97) +
		label(134, 100, 'íl') +
		leader(112, 51, 130, 51) +
		label(134, 54, 'humus pláva') +
		// Earthworm count.
		`<rect class="ta-soil" x="216" y="90" width="80" height="80" rx="4"/>` +
		crumbs(94, 166, 14, 21).replace(/cx="(\d+)"/g, (_m, x) => `cx="${216 + (Number(x) % 80)}"`) +
		worm(224, 118, 0) +
		worm(250, 140, 0.5) +
		worm(232, 158, 1) +
		label(256, 186, '10+ dážďoviek = živá pôda', 'middle') +
		label(256, 80, '20 × 20 cm', 'middle'),

	opelovace: () =>
		ground(160) +
		sun(292, 24, 9) +
		[40, 80, 120, 160]
			.map(
				(x, i) =>
					plant(x, 160, 40 + (i % 2) * 10, i * 0.3) +
					`<circle class="ta-flower" cx="${x}" cy="${118 - (i % 2) * 10}" r="7"/><circle class="ta-flower-c" cx="${x}" cy="${118 - (i % 2) * 10}" r="3"/>`
			)
			.join('') +
		`<g class="ta-bumble"><ellipse class="ta-bumble-body" cx="60" cy="70" rx="10" ry="7"/><path class="ta-bumble-stripe" d="M56 64v12M62 63v14"/><path class="ta-wing" d="M58 63c-4-10 8-12 6 0M64 63c4-10 14-6 4 2"/></g>` +
		`<rect class="ta-insect-hotel" x="220" y="70" width="70" height="80" rx="4"/><path class="ta-hotel-roof" d="M212 72l43-24 43 24"/>` +
		Array.from(
			{ length: 12 },
			(_, i) =>
				`<circle class="ta-tube-hole" cx="${232 + (i % 4) * 15}" cy="${86 + Math.floor(i / 4) * 20}" r="5"/>`
		).join('') +
		`<path class="ta-post" d="M255 150v10"/>` +
		`<g class="ta-bee-peek"><ellipse cx="277" cy="126" rx="5" ry="3.5" class="ta-bumble-body"/></g>` +
		label(255, 176, 'hmyzí domček na slnku', 'middle') +
		label(100, 184, 'jednoduché kvety od jari do jesene', 'middle'),

	tien: () =>
		`<rect class="ta-wall" x="0" y="0" width="60" height="190"/>` +
		`<rect class="ta-wall ta-wall-light" x="260" y="20" width="60" height="170"/>` +
		`<path class="ta-rail" d="M60 120h200M60 170h200M80 120v50M110 120v50M140 120v50M170 120v50M200 120v50M230 120v50"/>` +
		`<path class="ta-pot" d="M90 100h140l-4 20H94Z"/>` +
		plant(110, 100, 24, 0) +
		plant(140, 100, 20, 0.4) +
		plant(170, 100, 26, 0.8) +
		plant(200, 100, 22, 1.2) +
		`<path class="ta-bounce" d="M300 30L262 60M262 60L200 76M300 50L262 80M262 80L150 84"/>` +
		label(254, 16, 'svetlo z oblohy', 'end') +
		label(254, 186, 'biela stena odráža', 'end') +
		label(160, 150, 'šalát, bylinky, špenát', 'middle') +
		`<path class="ta-moon" d="M28 26a12 12 0 1 0 12 18 9 9 0 1 1-12-18Z"/>`,

	sucho: () =>
		sun(46, 34, 14) +
		`<g class="ta-heat"><path d="M100 50c4-6-4-8 0-14M130 46c4-6-4-8 0-14M160 50c4-6-4-8 0-14"/></g>` +
		// Left: bare cracked soil. Right: mulched soil with deep roots.
		`<rect class="ta-soil ta-soil-dry" x="0" y="120" width="150" height="70"/><path class="ta-crack" d="M20 120l8 14-6 12M60 120l-4 18 10 10M100 120l6 12-8 14M130 120l-6 16"/>` +
		plant(76, 120, 20, 0, 'sprout') +
		`<path class="ta-root" d="M76 120v10"/>` +
		label(75, 176, 'holá zem vyschne', 'middle') +
		`<rect class="ta-soil" x="170" y="120" width="150" height="70"/><rect class="ta-mulch-band" x="170" y="110" width="150" height="10"/>` +
		plant(206, 112, 40, 0.2, 'fruit') +
		plant(266, 112, 36, 0.6) +
		`<path class="ta-root" d="M206 120c-2 20-6 34-4 56M206 120c4 18 10 30 8 50M266 120c-2 18 4 34 0 56"/>` +
		`<path class="ta-olla" d="M232 128h10v4c8 4 12 10 12 18s-8 16-16 16-16-8-16-16 4-14 10-18Z"/><path class="ta-olla-water" d="M224 150c6-2 10 2 16 0s8 2 14 0v2c0 8-6 14-14 14s-16-6-16-14Z"/>` +
		label(245, 186, 'mulč + hlboké korene', 'middle') +
		`<rect class="ta-barrel" x="170" y="30" width="36" height="56" rx="5"/><path class="ta-barrel-water" d="M172 50c6-3 12 3 16 0s12 3 16 0v32a4 4 0 0 1-4 4h-24a4 4 0 0 1-4-4Z"/>` +
		label(214, 60, 'dážď do suda', 'start'),

	'vymena-semien': () =>
		`<rect class="ta-table" x="30" y="120" width="260" height="10" rx="3"/><path class="ta-table-leg" d="M50 130v50M270 130v50"/>` +
		[0, 1, 2, 3, 4, 5]
			.map(
				(i) =>
					`<g class="ta-float" style="--d:${i * 0.3}s"><path class="ta-envelope" d="M${48 + i * 38} 88h30v30h-30Z"/><path class="ta-envelope" d="M${48 + i * 38} 88l15 12 15-12"/></g>`
			)
			.join('') +
		`<g class="ta-hand-give"><path class="ta-hand" d="M20 60c16-6 36-2 46 6l-4 10c-12-4-26-6-40-4Z"/><path class="ta-envelope" d="M52 44h26v24h-26Z"/></g>` +
		`<g class="ta-hand-take"><path class="ta-hand" d="M300 60c-16-6-36-2-46 6l4 10c12-4 26-6 40-4Z"/></g>` +
		label(160, 30, 'prines, čo máš – zober, čo potrebuješ', 'middle') +
		label(160, 160, 'odroda, rok, miesto na každom vrecúšku', 'middle'),

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
