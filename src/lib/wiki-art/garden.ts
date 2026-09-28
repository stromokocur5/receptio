import {
	label,
	leader,
	plant,
	roots,
	drop,
	sun,
	worm,
	log,
	arrow,
	snow,
	ground,
	crumbs,
	W
} from './kit';

/** Growing techniques. */
export const GARDEN_ART: Record<string, () => string> = {
	'bez-rylovania': () => {
		const mulch = Array.from({ length: 40 }, (_, i) => {
			const x = 6 + i * 8;
			return `<path class="ta-mulch" d="M${x} ${112 + (i % 3)}l6-${2 + (i % 2) * 2}"/>`;
		}).join('');
		return (
			sun(282, 30) +
			ground(118) +
			crumbs(122, 186, 60, 3) +
			`<rect class="ta-mulch-band" x="0" y="108" width="${W}" height="10"/>` +
			mulch +
			plant(60, 110, 46, 0, 'fruit') +
			plant(130, 110, 36, 0.6) +
			plant(200, 110, 50, 1.2, 'fruit') +
			roots(60, 118, 30) +
			roots(130, 118, 24) +
			roots(200, 118, 34) +
			worm(92, 150, 0) +
			worm(236, 166, 1.4) +
			worm(160, 176, 0.7) +
			`<path class="ta-fungi" d="M70 140c20 6 40-2 60 4s40 2 70 8M150 130c10 10 30 12 50 8"/>` +
			label(250, 100, 'mulč 5–10 cm', 'middle') +
			leader(250, 103, 250, 112) +
			label(276, 148, 'dážďovky', 'middle') +
			leader(262, 152, 252, 166) +
			label(20, 184, 'huby a korienky ostanú neporušené')
		);
	},

	hugelkultura: () =>
		`<rect class="ta-soil" x="0" y="160" width="${W}" height="30"/><path class="ta-ground" d="M0 160H${W}"/>` +
		sun(290, 26) +
		// Layers of the mound, bottom up: logs, branches, turned sod, compost, topsoil.
		`<path class="ta-layer-wood" d="M28 160C60 118 96 104 140 102S222 116 262 160Z"/>` +
		log(84, 146, 13) +
		log(118, 140, 16) +
		log(154, 142, 15) +
		log(190, 147, 12) +
		`<path class="ta-branch" d="M60 132l30-10M150 120l38 8M200 132l26 14M104 124l20-8"/>` +
		`<path class="ta-layer-sod" d="M22 160C56 106 96 90 140 88S226 104 268 160h-8C226 112 188 100 140 102S62 118 30 160Z"/>` +
		`<path class="ta-layer-compost" d="M16 160C52 96 96 78 140 76S230 92 274 160h-6C228 102 188 88 140 88S58 106 22 160Z"/>` +
		`<path class="ta-layer-top" d="M10 160C48 86 96 66 140 64S234 80 280 160h-6C232 94 188 76 140 76S54 96 16 160Z"/>` +
		plant(86, 80, 26, 0, 'fruit') +
		plant(140, 64, 30, 0.5) +
		plant(192, 76, 26, 1, 'fruit') +
		plant(232, 104, 20, 1.5) +
		plant(50, 112, 18, 0.3, 'sprout') +
		drop(112, 22, 0) +
		drop(150, 16, 0.8) +
		drop(176, 28, 1.6) +
		label(6, 20, 'kmene nasajú vodu ako hubka') +
		leader(70, 24, 110, 136) +
		label(318, 96, 'zemina', 'end') +
		leader(292, 98, 232, 97) +
		label(318, 116, 'kompost', 'end') +
		leader(286, 118, 226, 106) +
		label(318, 136, 'obrátené drny', 'end') +
		leader(278, 139, 220, 115) +
		label(318, 184, 'konáre a polená dole', 'end'),

	'vyvyseny-zahon': () =>
		ground(160) +
		sun(286, 26) +
		`<path class="ta-box" d="M40 70h240v90H40Z"/>` +
		`<rect class="ta-fill-branch" x="44" y="134" width="232" height="24"/>` +
		`<rect class="ta-fill-leaves" x="44" y="112" width="232" height="22"/>` +
		`<rect class="ta-fill-compost" x="44" y="92" width="232" height="20"/>` +
		`<rect class="ta-fill-top" x="44" y="74" width="232" height="18"/>` +
		`<path class="ta-mesh" d="M44 158h232M52 158l6-4 6 4 6-4 6 4 6-4 6 4 6-4 6 4"/>` +
		plant(80, 74, 36, 0, 'fruit') +
		plant(140, 74, 28, 0.4) +
		plant(200, 74, 40, 0.8, 'fruit') +
		plant(254, 74, 24, 1.2) +
		label(160, 86, 'zemina + kompost', 'middle') +
		label(160, 106, 'kompost', 'middle') +
		label(160, 127, 'lístie, tráva, slama', 'middle') +
		label(160, 150, 'konáre', 'middle') +
		label(160, 184, 'pletivo proti hryzcom na dne', 'middle') +
		`<path class="ta-arrow" d="M288 72v86M284 78l4-6 4 6M284 152l4 6 4-6"/>` +
		label(306, 112, '60–90', 'middle') +
		label(306, 124, 'cm', 'middle'),

	striedanie: () => {
		const cx = 160;
		const cy = 96;
		const r = 78;
		const sectors: { name: string; tone: string; icon: string }[] = [
			{ name: 'strukoviny', tone: 'ta-q1', icon: 'hrach, fazuľa' },
			{ name: 'listové', tone: 'ta-q2', icon: 'kapusta, šalát' },
			{ name: 'plodové', tone: 'ta-q3', icon: 'paradajky, tekvice' },
			{ name: 'koreňové', tone: 'ta-q4', icon: 'mrkva, cvikla' }
		];
		const parts = sectors
			.map((s, i) => {
				const a0 = (i * Math.PI) / 2 - Math.PI / 2;
				const a1 = a0 + Math.PI / 2;
				const p = (a: number, rr: number) =>
					`${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)}`;
				const mid = a0 + Math.PI / 4;
				const [lx, ly] = [cx + Math.cos(mid) * r * 0.58, cy + Math.sin(mid) * r * 0.58];
				return (
					`<path class="ta-sector ${s.tone}" d="M${cx} ${cy}L${p(a0, r)}A${r} ${r} 0 0 1 ${p(a1, r)}Z"/>` +
					`<text class="ta-label ta-strong" x="${lx.toFixed(0)}" y="${(ly - 2).toFixed(0)}" text-anchor="middle">${s.name}</text>` +
					`<text class="ta-label ta-small" x="${lx.toFixed(0)}" y="${(ly + 9).toFixed(0)}" text-anchor="middle">${s.icon}</text>`
				);
			})
			.join('');
		return (
			parts +
			`<g class="ta-spin" style="transform-origin:${cx}px ${cy}px"><path class="ta-arrow" d="M${cx + r + 10} ${cy}A${r + 10} ${r + 10} 0 0 1 ${cx} ${cy + r + 10}"/><path class="ta-arrow" d="M${cx + 6} ${cy + r + 4}L${cx} ${cy + r + 10}L${cx + 6} ${cy + r + 16}"/></g>` +
			`<circle class="ta-hub" cx="${cx}" cy="${cy}" r="14"/>` +
			`<text class="ta-label ta-strong" x="${cx}" y="${cy + 3}" text-anchor="middle">rok</text>` +
			label(8, 24, 'Každý rok sa') +
			label(8, 36, 'záhon posunie') +
			label(8, 48, 'o krok ďalej.') +
			label(312, 170, 'strukoviny nechajú', 'end') +
			label(312, 182, 'v pôde dusík', 'end')
		);
	},

	'postupne-sianie': () => {
		const rows = [0, 1, 2, 3, 4];
		return (
			ground(140) +
			rows
				.map((i) => {
					const x = 44 + i * 58;
					const h = 10 + (4 - i) * 11;
					return (
						plant(x - 10, 140, h, i * 0.3, i === 4 ? 'sprout' : 'leafy') +
						plant(x + 10, 140, h * 0.9, i * 0.3 + 0.2, i === 4 ? 'sprout' : 'leafy') +
						label(
							x,
							158,
							['pred 8 týž.', 'pred 6 týž.', 'pred 4 týž.', 'pred 2 týž.', 'dnes'][i],
							'middle'
						)
					);
				})
				.join('') +
			arrow(40, 176, 290, 176) +
			label(160, 186, 'každé 2 týždne nový rad', 'middle') +
			label(44, 30, 'zbieraš', 'middle') +
			leader(44, 34, 44, 78) +
			label(276, 30, 'práve zasiate', 'middle') +
			leader(276, 34, 276, 118)
		);
	},

	predpestovanie: () => {
		const panel = (x: number, n: string, title: string, inner: string) =>
			`<rect class="ta-panel" x="${x}" y="30" width="72" height="120" rx="10"/>` +
			`<circle class="ta-num" cx="${x + 14}" cy="44" r="9"/><text class="ta-label ta-strong ta-num-t" x="${x + 14}" y="47.5" text-anchor="middle">${n}</text>` +
			inner +
			label(x + 36, 168, title, 'middle');
		const tray = (x: number) =>
			`<path class="ta-pot" d="M${x + 10} 118h52l-4 20H${x + 14}Z"/><path class="ta-soil-line" d="M${x + 12} 122h48"/>`;
		return (
			panel(
				4,
				'1',
				'zasej plytko',
				tray(4) +
					`<circle class="ta-seed" cx="24" cy="120" r="2"/><circle class="ta-seed" cx="40" cy="120" r="2"/><circle class="ta-seed" cx="56" cy="120" r="2"/>` +
					drop(40, 66, 0, 30)
			) +
			panel(
				84,
				'2',
				'teplo a svetlo',
				tray(84) +
					plant(104, 120, 10, 0, 'sprout') +
					plant(120, 120, 12, 0.3, 'sprout') +
					plant(136, 120, 9, 0.6, 'sprout') +
					`<path class="ta-lamp" d="M96 62h48M104 62l-4 8h40l-4-8"/><path class="ta-light" d="M104 74l-6 26M120 74v26M136 74l6 26"/>`
			) +
			panel(
				164,
				'3',
				'presaď do kelímkov',
				`<path class="ta-pot" d="M178 110h18l-2 28h-14ZM206 110h18l-2 28h-14Z"/>` +
					plant(187, 110, 22, 0.2) +
					plant(215, 110, 20, 0.5) +
					roots(187, 116, 14) +
					roots(215, 116, 12)
			) +
			panel(
				244,
				'4',
				'otuž vonku',
				`<path class="ta-pot" d="M262 118h18l-2 20h-14ZM288 118h18l-2 20h-14Z"/>` +
					plant(271, 118, 30, 0, 'fruit') +
					plant(297, 118, 28, 0.7) +
					sun(296, 60, 7)
			) +
			arrow(76, 90, 84, 90) +
			arrow(156, 90, 164, 90) +
			arrow(236, 90, 244, 90)
		);
	},

	zalievka: () =>
		ground(120) +
		crumbs(124, 186, 36, 7) +
		// Drip line on the left.
		`<path class="ta-hose" d="M8 116H150"/>` +
		[30, 70, 110]
			.map(
				(x, i) =>
					plant(x, 116, 34, i * 0.4, i === 1 ? 'fruit' : 'leafy') +
					`<circle class="ta-emitter" cx="${x + 8}" cy="116" r="3"/>` +
					drop(x + 8, 118, i * 0.6, 14) +
					`<ellipse class="ta-wet" style="--d:${i * 0.6}s" cx="${x + 8}" cy="140" rx="16" ry="12"/>`
			)
			.join('') +
		label(8, 22, 'kvapková hadica:') +
		label(8, 34, 'voda ide rovno ku koreňom') +
		leader(60, 38, 78, 114) +
		// Olla on the right: an unglazed clay pot buried to the neck.
		`<ellipse class="ta-wet ta-wet-big" cx="236" cy="150" rx="56" ry="34"/>` +
		`<path class="ta-olla" d="M226 112h20v6c14 6 22 16 22 30s-14 28-32 28-32-12-32-28 8-24 22-30Z"/>` +
		`<path class="ta-olla-water" d="M212 150c8-3 16 3 24 0s16 3 24 0v2c0 12-10 22-24 22s-24-10-24-22Z"/>` +
		`<path class="ta-lid" d="M222 110h28"/>` +
		plant(190, 116, 30, 0.2) +
		plant(282, 116, 32, 0.8, 'fruit') +
		roots(190, 120, 22) +
		roots(282, 120, 22) +
		label(318, 22, 'olla: hlinený džbán v zemi', 'end') +
		label(318, 34, 'pomaly potí vodu cez stenu', 'end') +
		leader(262, 38, 244, 108),

	'zelene-hnojenie': () => {
		const panel = (x: number, n: string, title: string, inner: string) =>
			`<rect class="ta-panel" x="${x}" y="24" width="96" height="130" rx="10"/>` +
			`<circle class="ta-num" cx="${x + 14}" cy="38" r="9"/><text class="ta-label ta-strong ta-num-t" x="${x + 14}" y="41.5" text-anchor="middle">${n}</text>` +
			`<path class="ta-ground" d="M${x + 6} 124h84"/><rect class="ta-soil" x="${x + 6}" y="124" width="84" height="26"/>` +
			inner +
			label(x + 48, 172, title, 'middle');
		const flower = (x: number, y: number) =>
			`<circle class="ta-flower" cx="${x}" cy="${y}" r="4"/><circle class="ta-flower-c" cx="${x}" cy="${y}" r="1.6"/>`;
		return (
			panel(
				6,
				'1',
				'zasej po zbere',
				[22, 38, 54, 70, 86]
					.map((x, i) => plant(x, 124, 8 + (i % 2) * 3, i * 0.2, 'sprout'))
					.join('')
			) +
			panel(
				112,
				'2',
				'nechaj rásť',
				[132, 146, 160, 174, 188]
					.map(
						(x, i) => plant(x, 124, 26 + (i % 2) * 6, i * 0.3) + flower(x, 124 - 28 - (i % 2) * 6)
					)
					.join('') +
					roots(146, 124, 18) +
					roots(174, 124, 20) +
					`<g class="ta-bee"><ellipse cx="170" cy="58" rx="5" ry="3.4"/><path d="M168 55v6M171 55v6"/><path class="ta-wing" d="M168 55c-2-5 3-6 3 0"/></g>`
			) +
			panel(
				218,
				'3',
				'pokos, nechaj ležať',
				`<path class="ta-mulch-band" d="M224 116h84v8h-84Z"/>` +
					[230, 246, 262, 278, 294]
						.map((x, i) => `<path class="ta-mulch" d="M${x} ${118 + (i % 2)}l10-3"/>`)
						.join('') +
					worm(240, 138, 0) +
					worm(272, 142, 1)
			) +
			arrow(102, 90, 112, 90) +
			arrow(208, 90, 218, 90)
		);
	},

	mnozenie: () =>
		// Left: a cutting rooting in a glass of water.
		`<path class="ta-glass" d="M40 70h50l-5 90H45Z"/>` +
		`<path class="ta-water" d="M42 96h46l-3 62H45Z"/>` +
		`<g class="ta-sway" style="--d:0s;transform-origin:65px 150px"><path class="ta-stem" d="M65 150V44"/><path class="ta-leaf" d="M65 60c-12-2-18-10-18-16 10 0 18 8 18 16Zm0-6c12-2 18-10 18-16-10 0-18 8-18 16Z"/></g>` +
		`<path class="ta-root ta-grow-root" d="M65 150c-3 4-8 6-12 6M65 146c4 3 9 4 14 3M65 152c0 3 1 5 3 6M65 140c-4 2-7 5-9 9"/>` +
		label(65, 176, 'odrezok vo vode', 'middle') +
		label(65, 188, 'korene za 2–3 týždne', 'middle') +
		// Right: dividing a clump.
		`<rect class="ta-soil" x="120" y="130" width="200" height="60"/><path class="ta-ground" d="M120 130H320M20 160H110"/>` +
		`<g class="ta-split-l"><path class="ta-rootball" d="M170 130c-14 0-22 10-20 22s12 18 26 16Z"/>` +
		plant(168, 130, 34, 0.1) +
		plant(158, 130, 26, 0.5) +
		`</g><g class="ta-split-r"><path class="ta-rootball" d="M182 130c14 0 22 10 20 22s-12 18-26 16Z"/>` +
		plant(186, 130, 30, 0.3) +
		plant(196, 130, 24, 0.8) +
		`</g>` +
		`<path class="ta-spade" d="M176 60v52M168 112h16l-2 22h-12Z"/>` +
		label(250, 90, 'trs rýľom rozdeľ', 'middle') +
		label(250, 102, 'na 2–4 kusy', 'middle') +
		label(250, 176, 'pažítka, mäta, rebarbora…', 'middle'),

	'do-vysky': () =>
		ground(158) +
		sun(292, 26) +
		// Trellis with a climbing bean.
		`<path class="ta-trellis" d="M30 158V40M90 158V40M30 60h60M30 90h60M30 120h60"/>` +
		`<path class="ta-vine ta-draw" d="M60 158c-18-10 18-20 0-30s18-20 0-30 18-20 0-30 18-14 0-24"/>` +
		[140, 110, 80, 54]
			.map(
				(y, i) =>
					`<path class="ta-leaf" d="M60 ${y}c-10-1-14-7-14-12 8 0 14 6 14 12Z"/>` +
					(i % 2 ? `<path class="ta-pod" d="M62 ${y + 6}c4 4 4 12 1 18"/>` : '')
			)
			.join('') +
		label(60, 172, 'fazuľa', 'middle') +
		label(60, 184, 'na mreži', 'middle') +
		// Pots of different sizes on the right.
		`<path class="ta-pot" d="M130 128h30l-3 30h-24Z"/>` +
		plant(145, 128, 26, 0.3) +
		`<path class="ta-pot" d="M178 116h44l-4 42h-36Z"/>` +
		plant(200, 116, 44, 0.6, 'fruit') +
		`<path class="ta-stake" d="M212 116V60"/>` +
		`<path class="ta-pot" d="M240 104h60l-5 54h-50Z"/>` +
		plant(262, 104, 30, 0.2) +
		plant(282, 104, 26, 0.9, 'fruit') +
		label(145, 172, 'bylinky', 'middle') +
		label(145, 184, '2 l', 'middle') +
		label(200, 172, 'paradajka', 'middle') +
		label(200, 184, '15 l', 'middle') +
		label(270, 172, 'zemiaky', 'middle') +
		label(270, 184, '40 l', 'middle'),

	'predlzenie-sezony': () =>
		ground(150) +
		[20, 60, 100, 150, 200, 250, 300].map((x, i) => snow(x, 18 + (i % 3) * 10, i * 0.5)).join('') +
		// Fleece over a row.
		`<path class="ta-fleece" d="M8 150c10-40 70-40 84 0"/>` +
		plant(34, 150, 18, 0) +
		plant(64, 150, 16, 0.5) +
		label(50, 170, 'textília', 'middle') +
		label(50, 182, '+2 °C', 'middle') +
		// Cold frame with an opening lid.
		`<path class="ta-frame" d="M110 150v-30l70-12v42"/>` +
		`<path class="ta-glass-lid" d="M110 120l70-12"/>` +
		plant(130, 150, 16, 0.2) +
		plant(158, 150, 18, 0.7) +
		label(145, 170, 'parenisko', 'middle') +
		label(145, 182, '+4–6 °C, vetraj', 'middle') +
		// Polytunnel.
		`<path class="ta-tunnel" d="M200 150c0-70 110-70 110 0"/><path class="ta-tunnel-rib" d="M228 150c0-58 54-58 54 0M255 94v56"/>` +
		plant(222, 150, 30, 0.1, 'fruit') +
		plant(256, 150, 36, 0.6, 'fruit') +
		plant(288, 150, 28, 1.1) +
		`<g class="ta-heat"><path d="M236 118c3-4-3-6 0-10M268 112c3-4-3-6 0-10"/></g>` +
		label(255, 170, 'fóliovník', 'middle') +
		label(255, 182, 'o 4–6 týždňov skôr', 'middle'),

	'ochrana-bez-postrekov': () =>
		ground(150) +
		sun(292, 24) +
		// Net over brassicas.
		`<path class="ta-net" d="M10 150V96c0-14 10-22 30-22h40c20 0 30 8 30 22v54"/>` +
		`<path class="ta-net-mesh" d="M20 150V90M40 150V76M60 150V74M80 150V76M100 150V90M10 110h100M10 130h100M14 92h92"/>` +
		plant(40, 150, 30, 0.1) +
		plant(80, 150, 28, 0.6) +
		`<g class="ta-butterfly"><path d="M70 40c-10-10-18-2-10 6 8 6 10-6 10-6Zm0 0c10-10 18-2 10 6-8 6-10-6-10-6Z"/><path d="M70 38v10"/></g>` +
		label(60, 170, 'sieť proti mlynárikovi', 'middle') +
		// Marigold and a ladybird.
		plant(160, 150, 32, 0.4) +
		`<circle class="ta-flower ta-marigold" cx="160" cy="114" r="7"/><circle class="ta-flower-c" cx="160" cy="114" r="3"/>` +
		`<g class="ta-ladybird"><circle cx="186" cy="130" r="5"/><path d="M186 125v10"/><circle class="ta-spot" cx="184" cy="129" r="1"/><circle class="ta-spot" cx="188" cy="132" r="1"/></g>` +
		label(170, 170, 'kvety lákajú pomocníkov', 'middle') +
		// A slug stopped by a barrier.
		plant(262, 150, 30, 0.8) +
		`<path class="ta-barrier" d="M236 150h52"/>` +
		`<path class="ta-slug" d="M298 150c0-6 6-8 12-6l6 6Z"/><path class="ta-slug-eye" d="M312 144l2-4"/>` +
		label(270, 170, 'bariéra a zber', 'middle') +
		label(270, 182, 'večer za vlhka', 'middle'),

	automatizacia: () =>
		ground(140) +
		crumbs(144, 188, 30, 11) +
		// Rain barrel feeding a timer and a drip line.
		`<path class="ta-roof" d="M4 40l40-20 40 20"/><path class="ta-gutter" d="M60 32h16v40"/>` +
		`<rect class="ta-barrel" x="54" y="72" width="44" height="66" rx="6"/>` +
		`<path class="ta-barrel-water" d="M56 96c7-3 14 3 20 0s14 3 20 0v38a4 4 0 0 1-4 4H60a4 4 0 0 1-4-4Z"/>` +
		drop(68, 44, 0, 26) +
		`<rect class="ta-timer" x="104" y="116" width="22" height="18" rx="4"/><circle class="ta-timer-face" cx="115" cy="125" r="5"/><path class="ta-timer-hand" style="transform-origin:115px 125px" d="M115 125v-3.5"/>` +
		`<path class="ta-hose" d="M98 132h6M126 132h8V138H316"/>` +
		[170, 220, 270]
			.map(
				(x, i) =>
					plant(x, 138, 34, i * 0.4, i === 1 ? 'fruit' : 'leafy') +
					`<circle class="ta-emitter" cx="${x + 8}" cy="138" r="3"/>` +
					drop(x + 8, 140, 0.4 + i * 0.5, 12) +
					`<ellipse class="ta-wet" style="--d:${0.4 + i * 0.5}s" cx="${x + 8}" cy="160" rx="15" ry="11"/>`
			)
			.join('') +
		`<path class="ta-sensor" d="M306 112v38M302 112h8"/>` +
		label(76, 186, 'dažďová voda', 'middle') +
		label(120, 110, 'časovač', 'middle') +
		label(318, 104, 'vlhkomer', 'end') +
		label(230, 186, 'polieva ráno sama', 'middle'),

	'samozavlazovaci-kvetinac': () =>
		`<path class="ta-pot" d="M70 60h180l-12 120H82Z"/>` +
		`<rect class="ta-water" x="86" y="138" width="148" height="38" rx="3"/>` +
		`<path class="ta-shelf" d="M84 136h152"/>` +
		`<rect class="ta-soil" x="80" y="70" width="160" height="66"/>` +
		`<path class="ta-wick" d="M150 136c0 10 4 22 0 36M170 136c0 10-4 22 0 36"/>` +
		`<path class="ta-tube" d="M228 50v96M222 50h12"/>` +
		`<path class="ta-wick-rise" d="M150 172c0-12 4-26 0-40M170 172c0-12-4-26 0-40"/>` +
		plant(130, 70, 44, 0, 'fruit') +
		plant(190, 70, 38, 0.6) +
		label(160, 160, 'zásobník vody', 'middle') +
		label(40, 104, 'knôt ťahá', 'middle') +
		label(40, 116, 'vodu hore', 'middle') +
		leader(58, 118, 148, 150) +
		label(286, 56, 'dolievaš', 'middle') +
		label(286, 68, 'raz za týždeň', 'middle') +
		leader(270, 62, 234, 56)
};
