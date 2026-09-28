import { bubbles, flames, jar, pot, steam } from './kitchen';
import { arrow, drop, label, plant } from './kit';

/** Fermenting, sprouting, kitchen gear and cooking without a stove. */
export const DIY_ART: Record<string, () => string> = {
	aquafaba: () =>
		// Can → bowl being whipped → foam that stays put in an upside-down bowl.
		`<rect class="ta-can-tin" x="16" y="70" width="44" height="56" rx="4"/><path class="ta-can-band" d="M16 90h44"/>` +
		`<path class="ta-slurry-stream" d="M60 80c14 0 20 10 22 24"/>` +
		label(38, 146, 'nálev z cíceru', 'middle') +
		`<path class="ta-bowl" d="M84 104h84a42 34 0 0 1-84 0Z"/>` +
		`<g class="ta-whisk-spin" style="transform-origin:126px 110px"><path class="ta-whisk" d="M126 50v36M118 86c0 16 16 16 16 0M112 86c0 24 28 24 28 0"/></g>` +
		`<g class="ta-foam-grow"><path class="ta-meringue" d="M92 106c4-12 14-10 18-4 4-10 18-10 20 0 6-8 18-6 20 4Z"/></g>` +
		label(126, 162, '5–10 min šľahať', 'middle') +
		arrow(176, 110, 200, 110) +
		`<path class="ta-meringue" d="M220 76c0 18 12 26 34 26s34-8 34-26Z"/>` +
		`<path class="ta-bowl-outline" d="M212 76h84a42 34 0 0 0-84 0Z" transform="rotate(180 254 76)"/>` +
		label(254, 138, 'drží aj hore dnom', 'middle') +
		label(254, 150, '3 PL = 1 vajce', 'middle'),

	kvasok: () =>
		`<rect class="ta-jar" x="40" y="40" width="70" height="120" rx="8"/>` +
		`<g class="ta-rise-starter" style="transform-origin:75px 158px"><rect class="ta-starter" x="44" y="100" width="62" height="56" rx="6"/>` +
		[0, 1, 2, 3, 4, 5]
			.map(
				(i) =>
					`<circle class="ta-bubble-hole" cx="${54 + (i % 3) * 18}" cy="${116 + Math.floor(i / 3) * 18}" r="${2 + (i % 2)}"/>`
			)
			.join('') +
		`</g>` +
		`<path class="ta-band" d="M36 100h78"/>` +
		label(128, 104, 'gumička: odkiaľ') +
		label(128, 116, 'začínal') +
		label(75, 180, 'za 4–8 h dvojnásobok', 'middle') +
		`<path class="ta-bread" d="M190 150c-8-44 36-66 60-66s68 22 60 66Z"/><path class="ta-bread-score" d="M226 100c10 10 30 12 44 4"/>` +
		label(250, 180, 'chlieb: 20 + 20 min pri 230 °C', 'middle') +
		`<text class="ta-label" x="200" y="40">1 : 1 : 1</text>` +
		label(200, 54, 'kvások, múka, voda'),

	fermentacia: () =>
		`<path class="ta-hob" d="M10 150h70"/>` +
		pot(45, 150, 60, 42) +
		`<rect class="ta-tea-bag" x="36" y="100" width="12" height="14" rx="2"/><path class="ta-tea-string" d="M42 100V86"/>` +
		label(45, 172, 'sladký čaj', 'middle') +
		arrow(84, 120, 104, 120) +
		`<rect class="ta-jar" x="110" y="50" width="96" height="110" rx="8"/>` +
		`<path class="ta-kombucha" d="M112 76h92v80a6 6 0 0 1-6 6h-80a6 6 0 0 1-6-6Z"/>` +
		`<g class="ta-scoby-float"><ellipse class="ta-scoby" cx="158" cy="80" rx="44" ry="7"/></g>` +
		`<path class="ta-cloth" d="M106 50c10-8 94-8 104 0"/>` +
		bubbles(158, 140, 80, 5) +
		label(158, 178, '7–12 dní pri izbovej teplote', 'middle') +
		label(158, 42, 'utierka, nie viečko', 'middle') +
		arrow(212, 110, 232, 110) +
		`<path class="ta-bottle-glass" d="M246 70h14v14l8 12v60a6 6 0 0 1-6 6h-18a6 6 0 0 1-6-6V96l8-12Z"/>` +
		`<path class="ta-kombucha" d="M240 110h28v46a4 4 0 0 1-4 4h-20a4 4 0 0 1-4-4Z"/>` +
		`<path class="ta-bottle-glass" d="M282 70h14v14l8 12v60a6 6 0 0 1-6 6h-18a6 6 0 0 1-6-6V96l8-12Z"/>` +
		`<path class="ta-kombucha" d="M276 110h28v46a4 4 0 0 1-4 4h-20a4 4 0 0 1-4-4Z"/>` +
		label(274, 178, 'bublinky', 'middle'),

	klicky: () =>
		// A jar upside down on a slant: water drains, air flows.
		`<path class="ta-bowl" d="M30 150h120a60 18 0 0 1-120 0Z"/>` +
		`<g transform="rotate(135 90 110)"><rect class="ta-jar" x="60" y="60" width="60" height="96" rx="8"/><path class="ta-mesh-cap" d="M58 56h64v8H58Z"/>` +
		`<g class="ta-sprouts">` +
		Array.from({ length: 14 }, (_, i) => {
			const x = 68 + (i % 7) * 7;
			const y = 132 + Math.floor(i / 7) * 10;
			return `<ellipse class="ta-mung" cx="${x}" cy="${y}" rx="3.4" ry="2.4"/><path class="ta-sprout-tail" style="--d:${(i * 0.1).toFixed(1)}s" d="M${x} ${y}c-2-6 2-10 0-16"/>`;
		}).join('') +
		`</g></g>` +
		drop(84, 158, 0, 12) +
		drop(98, 160, 0.8, 12) +
		label(90, 184, 'hrdlom dole, preplachuj 2× denne', 'middle') +
		`<rect class="ta-tray-micro" x="200" y="120" width="104" height="24" rx="4"/>` +
		Array.from({ length: 9 }, (_, i) =>
			plant(208 + i * 11, 122, 18 + (i % 3) * 3, i * 0.2, 'sprout')
		).join('') +
		label(252, 164, 'mikrozelenina', 'middle') +
		label(252, 176, 'na svetlom okne', 'middle'),

	'masove-textury': () =>
		`<g class="ta-sway" style="--d:0s;transform-origin:56px 120px"><path class="ta-seitan" d="M20 120c0-26 16-40 36-40s36 14 36 40Z"/><path class="ta-fiber" d="M30 110c10-6 40-6 52 0M34 98c10-6 34-6 44 0"/></g>` +
		label(56, 144, 'seitan', 'middle') +
		label(56, 156, 'žuvací, 25 g bielkovín', 'middle') +
		Array.from(
			{ length: 16 },
			(_, i) =>
				`<rect class="ta-tvp" x="${122 + (i % 4) * 16}" y="${86 + Math.floor(i / 4) * 9}" width="10" height="7" rx="2" transform="rotate(${((i * 23) % 40) - 20} ${127 + (i % 4) * 16} ${90 + Math.floor(i / 4) * 9})"/>`
		).join('') +
		label(150, 144, 'sójové granule', 'middle') +
		label(150, 156, 'ako mleté', 'middle') +
		`<g class="ta-pull"><path class="ta-jackfruit" d="M214 120c-6-20 10-38 30-38s36 18 30 38Z"/><path class="ta-fiber" d="M226 116c4-12 6-20 4-28M244 118c0-14 2-24 0-34M262 116c-2-12-4-20-2-28"/></g>` +
		`<path class="ta-fork" d="M296 64l-18 44M300 66l-18 44M304 68l-18 44M286 110l-6 16"/>` +
		label(250, 144, 'jackfruit', 'middle') +
		label(250, 156, 'trhaný na vlákna', 'middle') +
		label(160, 30, 'textúra, do ktorej sa dá zahryznúť', 'middle'),

	'tlakovy-hrniec': () =>
		`<path class="ta-hob" d="M50 170h140"/>` +
		pot(120, 170, 120, 90) +
		`<path class="ta-pressure-lid" d="M56 80c10-16 118-16 128 0Z"/><rect class="ta-lid-knob" x="110" y="58" width="20" height="10" rx="3"/>` +
		`<g class="ta-valve"><rect class="ta-valve-pin" x="116" y="48" width="8" height="12" rx="2"/></g>` +
		`<g class="ta-hiss"><path d="M120 44c-6-8 6-12 0-20M112 40c-8-4-8-12-2-16M128 40c8-4 8-12 2-16"/></g>` +
		Array.from(
			{ length: 10 },
			(_, i) =>
				`<ellipse class="ta-bean" cx="${80 + (i % 5) * 20}" cy="${150 - Math.floor(i / 5) * 12}" rx="7" ry="5"/>`
		).join('') +
		flames(120, 182, 0.8) +
		`<path class="ta-thermo" d="M226 40v80"/><circle class="ta-thermo-bulb" cx="226" cy="126" r="7"/>` +
		`<path class="ta-mark" d="M222 56h8M222 80h8"/>` +
		label(238, 60, '120 °C pod tlakom') +
		label(238, 84, '100 °C bežne') +
		label(250, 160, 'cícer:', 'middle') +
		label(250, 172, '90 min → 15 min', 'middle'),

	'noze-brusenie': () =>
		`<rect class="ta-towel" x="30" y="120" width="260" height="20" rx="6"/>` +
		`<rect class="ta-stone" x="70" y="96" width="180" height="24" rx="4"/><rect class="ta-stone-fine" x="70" y="96" width="180" height="10" rx="4"/>` +
		`<g class="ta-sharpen"><g transform="rotate(-17 140 92)"><path class="ta-blade" d="M110 92h110l-16 14H110Z"/><rect class="ta-knife-handle" x="70" y="92" width="40" height="14" rx="5"/></g></g>` +
		`<path class="ta-angle" d="M230 96a40 40 0 0 0-4-14"/>` +
		label(244, 80, '15–20°', 'start') +
		`<rect class="ta-coin" x="120" y="84" width="14" height="3" rx="1"/><rect class="ta-coin" x="120" y="80" width="14" height="3" rx="1"/>` +
		label(127, 72, 'dve mince', 'middle') +
		label(160, 164, '1000: brúsiť  ·  6000: doleštiť', 'middle') +
		label(160, 180, 'ostrím dopredu, po celej dĺžke', 'middle'),

	'liatina-wok': () =>
		// Seasoning: a thin oil film baking into a black surface.
		`<rect class="ta-oven-box" x="20" y="30" width="140" height="130" rx="10"/><rect class="ta-window" x="32" y="46" width="116" height="90" rx="6"/>` +
		`<path class="ta-pan-iron" d="M50 88h80l-6 14H56Z" transform="rotate(180 90 95)"/><path class="ta-handle-long" d="M50 94l-16-4"/>` +
		`<g class="ta-heat"><path d="M60 126c3-4-3-6 0-10M90 124c3-4-3-6 0-10M120 126c3-4-3-6 0-10"/></g>` +
		label(90, 178, '250 °C, 1 h, hore dnom', 'middle') +
		// Water drop test on stainless.
		`<path class="ta-pan" d="M190 110h96l-8 18h-80Z"/><path class="ta-handle-long" d="M286 112l24-8"/>` +
		`<g class="ta-bead"><circle class="ta-water-bead" cx="226" cy="104" r="5"/><circle class="ta-water-bead" cx="248" cy="106" r="3"/></g>` +
		flames(238, 150, 0.7) +
		label(238, 178, 'kvapka sa kotúľa = dosť horúca', 'middle') +
		label(238, 72, 'nerez', 'middle'),

	'bez-sporaka': () =>
		`<path class="ta-kettle" d="M20 150V100a20 18 0 0 1 20-18h24a20 18 0 0 1 20 18v50Z"/><path class="ta-kettle" d="M84 110l18-14M26 90c0-16 52-16 52 0"/>` +
		steam(62, 76) +
		label(52, 172, 'kanvica', 'middle') +
		label(52, 184, 'kuskus, rezance', 'middle') +
		`<rect class="ta-micro" x="112" y="84" width="96" height="66" rx="6"/><rect class="ta-window" x="120" y="92" width="62" height="50" rx="4"/><circle class="ta-knob-dot" cx="196" cy="102" r="3"/><circle class="ta-knob-dot" cx="196" cy="116" r="3"/>` +
		`<g class="ta-turn" style="transform-origin:151px 128px"><ellipse class="ta-potato" cx="151" cy="124" rx="16" ry="9"/></g>` +
		label(160, 172, 'mikrovlnka', 'middle') +
		label(160, 184, 'zemiak za 8 min', 'middle') +
		`<rect class="ta-jar" x="240" y="84" width="52" height="66" rx="6"/><path class="ta-oats" d="M242 108h48v38a4 4 0 0 1-4 4h-40a4 4 0 0 1-4-4Z"/>` +
		[0, 1, 2]
			.map((i) => `<circle class="ta-berry" cx="${254 + i * 12}" cy="104" r="4"/>`)
			.join('') +
		label(266, 172, 'bez tepla', 'middle') +
		label(266, 184, 'overnight oats', 'middle'),

	'dive-rastliny': () =>
		`<path class="ta-ground" d="M10 150H310"/>` +
		// Wild garlic: each leaf on its own stalk.
		[0, 1, 2]
			.map(
				(i) =>
					`<g class="ta-sway" style="--d:${i * 0.4}s;transform-origin:${50 + i * 16}px 150px"><path class="ta-stem" d="M${50 + i * 16} 150V${112 - i * 4}"/><path class="ta-leaf" d="M${50 + i * 16} ${112 - i * 4}c-10-8-10-30 0-44 10 14 10 36 0 44Z"/></g>`
			)
			.join('') +
		`<circle class="ta-flower-white" cx="98" cy="70" r="3"/><circle class="ta-flower-white" cx="104" cy="66" r="3"/><circle class="ta-flower-white" cx="102" cy="74" r="3"/><path class="ta-stem" d="M101 150V74"/>` +
		label(74, 170, 'medvedí cesnak', 'middle') +
		label(74, 182, 'každý list vlastná stopka', 'middle') +
		// Lily of the valley: two leaves wrap one stem.
		`<path class="ta-stem" d="M220 150V80"/><path class="ta-leaf-shiny" d="M220 150c-18-10-22-50-6-70 4 20 6 50 6 70Z"/><path class="ta-leaf-shiny" d="M220 150c18-10 20-46 6-64-4 20-6 46-6 64Z"/>` +
		[0, 1, 2, 3]
			.map((i) => `<path class="ta-bell" d="M${226 + i * 5} ${84 + i * 8}a4 4 0 0 1 8 0Z"/>`)
			.join('') +
		`<path class="ta-no" d="M196 60l48 48M244 60l-48 48" opacity="0.8"/>` +
		label(226, 170, 'konvalinka – jedovatá', 'middle') +
		label(226, 182, '2 listy okolo 1 stonky', 'middle') +
		label(160, 24, 'rozmrv list: cesnak musí voňať', 'middle'),

	'koreniace-zmesi': () =>
		`<path class="ta-hob" d="M20 150h120"/>` +
		`<path class="ta-pan" d="M28 118h96l-8 16H36Z"/><path class="ta-handle-long" d="M124 120l30-8"/>` +
		`<g class="ta-toss">` +
		Array.from(
			{ length: 12 },
			(_, i) =>
				`<circle class="ta-spice-dot" style="fill:${['#b5651d', '#e0a030', '#3a2a1a', '#7a9a3a'][i % 4]}" cx="${40 + (i % 6) * 13}" cy="${112 + Math.floor(i / 6) * 4}" r="3"/>`
		).join('') +
		`</g>` +
		flames(76, 164, 0.7) +
		`<g class="ta-aroma"><path d="M52 100c-6-8 6-12 0-20M78 96c-6-8 6-12 0-20M104 100c-6-8 6-12 0-20"/></g>` +
		label(76, 184, '1–2 min nasucho', 'middle') +
		arrow(160, 110, 186, 110) +
		`<path class="ta-mortar" d="M196 100h60l-6 40h-48Z"/><g class="ta-grind" style="transform-origin:236px 100px"><path class="ta-pestle" d="M236 100l24-40"/></g>` +
		label(226, 160, 'pomlieť', 'middle') +
		`<g class="ta-float" style="--d:0.4s">${jar(272, 70, 32, 70, '#c98a3a')}</g>` +
		label(288, 160, 'do pohára', 'middle'),

	'pecenie-bez-vajec': () =>
		`<path class="ta-bowl" d="M24 110h80a40 30 0 0 1-80 0Z"/>` +
		`<g class="ta-thicken"><path class="ta-flax-gel" d="M32 116h64a32 20 0 0 1-64 0Z"/></g>` +
		Array.from(
			{ length: 8 },
			(_, i) =>
				`<ellipse class="ta-seed-flax" cx="${40 + i * 7}" cy="${122 + (i % 2) * 4}" rx="2.4" ry="1.4"/>`
		).join('') +
		label(64, 160, '1 PL ľanu + 3 PL vody', 'middle') +
		label(64, 172, '= 1 vajce', 'middle') +
		`<path class="ta-bread" d="M160 150c-6-40 18-60 50-60s56 20 50 60Z"/>` +
		`<g class="ta-rise-dough" style="transform-origin:210px 150px"><path class="ta-cake-top" d="M166 110c10-20 78-20 88 0"/></g>` +
		label(210, 172, 'ocot + sóda = nadýchané', 'middle') +
		`<path class="ta-banana" d="M270 60c6 20 26 24 42 14-18 4-32-2-38-16Z"/>` +
		label(292, 96, 'banán', 'middle') +
		label(160, 24, 'vajce spája, kyprí alebo vláčni – nahraď podľa úlohy', 'middle'),

	'prva-pomoc': () =>
		`<path class="ta-sink" d="M40 110h120v30a10 10 0 0 1-10 10H50a10 10 0 0 1-10-10Z"/>` +
		`<path class="ta-tap" d="M100 110V70h24v10"/>` +
		`<g class="ta-stream"><path d="M124 84v40"/></g>` +
		`<path class="ta-hand" d="M110 128c-4-12 4-20 16-18 8 2 12 8 10 16l-4 10H114Z"/>` +
		label(100, 172, '20 min studenou vodou', 'middle') +
		`<path class="ta-no" d="M188 60l24 24M212 60l-24 24"/>` +
		`<rect class="ta-ice-cube" x="190" y="62" width="20" height="20" rx="3"/>` +
		label(200, 104, 'nie ľad', 'middle') +
		`<rect class="ta-kit" x="236" y="70" width="70" height="56" rx="8"/><path class="ta-kit-cross" d="M271 84v28M257 98h28"/>` +
		label(271, 144, 'lekárnička', 'middle') +
		`<g class="ta-pop-out"><text class="ta-label ta-strong ta-emergency" x="271" y="40" text-anchor="middle">112</text></g>`,

	desiata: () =>
		`<rect class="ta-lunchbox" x="40" y="60" width="170" height="100" rx="12"/><path class="ta-lunchbox-div" d="M130 60v100M130 110h80"/>` +
		`<path class="ta-bread-slice" d="M56 150v-50c0-20 58-20 58 0v50Z"/><path class="ta-spread" d="M62 108h46v36H62Z"/>` +
		[0, 1, 2, 3]
			.map(
				(i) =>
					`<rect class="ta-carrot-stick" x="${140 + i * 16}" y="68" width="8" height="36" rx="3"/>`
			)
			.join('') +
		`<circle class="ta-apple" cx="158" cy="134" r="14"/><path class="ta-stem" d="M158 120v-6"/>` +
		[0, 1, 2]
			.map(
				(i) =>
					`<circle class="ta-ball" cx="${186 + (i % 2) * 12}" cy="${128 + Math.floor(i / 2) * 16}" r="6"/>`
			)
			.join('') +
		`<g class="ta-sway" style="--d:0s;transform-origin:262px 160px"><path class="ta-bottle-glass" d="M252 56h20v12l6 10v76a6 6 0 0 1-6 6h-20a6 6 0 0 1-6-6V78l6-10Z"/><path class="ta-water" d="M248 96h28v58a4 4 0 0 1-4 4h-20a4 4 0 0 1-4-4Z"/></g>` +
		label(84, 178, 'sýte + bielkoviny', 'middle') +
		label(170, 178, 'zelenina, ovocie', 'middle') +
		label(262, 178, 'voda', 'middle') +
		label(125, 40, 'večer nachystať, ráno len zobrať', 'middle')
};
