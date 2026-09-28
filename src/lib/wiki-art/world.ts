import { arrow, crumbs, drop, ground, label, plant, sun, worm } from './kit';
import { bubbles, flames, jar, pot } from './kitchen';

/** Techniques from other countries – kitchen, pantry, garden and body. */
export const WORLD_ART: Record<string, () => string> = {
	'techniky-sveta': () =>
		// Tadka: spices sizzle in a small pan and are poured over dal.
		`<path class="ta-bowl" d="M40 120h140a70 44 0 0 1-140 0Z"/><path class="ta-curry" d="M48 126h124a62 34 0 0 1-124 0Z"/>` +
		`<g class="ta-tadka-tilt"><path class="ta-pan-small" d="M150 70h70l-6 14h-58Z"/><path class="ta-handle-long" d="M220 72l40-10"/>` +
		Array.from(
			{ length: 7 },
			(_, i) =>
				`<circle class="ta-spice-dot" style="fill:${['#e0a030', '#3a2a1a', '#c0442a'][i % 3]}" cx="${160 + i * 7}" cy="${68 + (i % 2) * 2}" r="2.2"/>`
		).join('') +
		`</g>` +
		`<g class="ta-pour-oil"><path d="M154 86c-8 10-14 18-20 30"/></g>` +
		`<g class="ta-sizzle"><path d="M110 112l-4-8M126 110v-10M142 112l4-8"/></g>` +
		label(110, 186, 'tadka: horúci olej s korením navrch', 'middle') +
		label(240, 120, 'India', 'start') +
		label(240, 134, 'Čína, Kórea', 'start') +
		label(240, 148, 'Mexiko, Etiópia', 'start') +
		label(240, 162, 'Japonsko', 'start'),

	nixtamal: () =>
		`<path class="ta-hob" d="M10 160h100"/>` +
		pot(60, 160, 80, 60, 'ta-limewater') +
		Array.from(
			{ length: 10 },
			(_, i) =>
				`<ellipse class="ta-corn-kernel" cx="${32 + (i % 5) * 14}" cy="${140 - Math.floor(i / 5) * 10}" rx="5" ry="4"/>`
		).join('') +
		bubbles(60, 116, 70, 3) +
		flames(60, 172, 0.6) +
		label(60, 186, 'var s vápnom', 'middle') +
		arrow(104, 120, 124, 120) +
		// Grinding to masa.
		`<path class="ta-mortar" d="M130 110h70l-8 40h-54Z"/><path class="ta-masa" d="M136 112h58l-4 16h-50Z"/>` +
		`<g class="ta-grind" style="transform-origin:180px 100px"><path class="ta-pestle" d="M180 110l24-40"/></g>` +
		label(165, 186, 'zomlieť na masa', 'middle') +
		arrow(206, 120, 226, 120) +
		`<g class="ta-float" style="--d:0s"><ellipse class="ta-tortilla" cx="272" cy="120" rx="36" ry="12"/><circle class="ta-char" cx="262" cy="118" r="2"/><circle class="ta-char" cx="282" cy="122" r="2"/></g>` +
		`<ellipse class="ta-tortilla" cx="272" cy="130" rx="36" ry="12"/>` +
		label(272, 186, 'tortilly', 'middle'),

	koji: () =>
		`<rect class="ta-jar" x="40" y="50" width="90" height="120" rx="10"/><rect class="ta-jar-lid" x="36" y="42" width="98" height="10" rx="3"/>` +
		`<path class="ta-shio-koji" d="M42 90h86v74a6 6 0 0 1-6 6H48a6 6 0 0 1-6-6Z"/>` +
		Array.from(
			{ length: 18 },
			(_, i) =>
				`<ellipse class="ta-rice-grain" cx="${52 + (i % 6) * 14}" cy="${108 + Math.floor(i / 6) * 18}" rx="4" ry="2.4"/>`
		).join('') +
		`<g class="ta-stir" style="transform-origin:86px 70px"><path class="ta-spoon-wood" d="M86 20l-2 120"/></g>` +
		label(85, 186, '7–10 dní, denne premiešať', 'middle') +
		arrow(144, 110, 170, 110) +
		`<rect class="ta-tofu ta-sear" x="190" y="92" width="50" height="36" rx="6"/><path class="ta-glaze" d="M194 100h42M194 110h42M194 120h42"/>` +
		`<rect class="ta-carrot-stick" x="256" y="86" width="10" height="50" rx="4"/><rect class="ta-carrot-stick" x="272" y="90" width="10" height="46" rx="4"/>` +
		label(242, 160, 'marináda na tofu', 'middle') +
		label(242, 172, 'a zeleninu', 'middle'),

	dashi: () =>
		`<rect class="ta-jar" x="80" y="30" width="110" height="140" rx="10"/><path class="ta-dashi" d="M82 60h106v104a6 6 0 0 1-6 6H88a6 6 0 0 1-6-6Z"/>` +
		`<g class="ta-sway" style="--d:0s;transform-origin:120px 170px"><path class="ta-kombu" d="M110 164c-6-30 10-60 4-96 16 0 20 10 16 40-4 26 0 40-4 56Z"/></g>` +
		[0, 1, 2]
			.map(
				(i) =>
					`<g class="ta-float" style="--d:${i * 0.5}s"><path class="ta-shiitake" d="M${146 + (i % 2) * 18} ${90 + i * 26}a10 7 0 0 1 20 0Z"/></g>`
			)
			.join('') +
		`<path class="ta-moon" d="M36 36a14 14 0 1 0 14 22 11 11 0 1 1-14-22Z"/>` +
		label(40, 80, 'cez noc', 'middle') +
		label(40, 92, 'v chladničke', 'middle') +
		label(250, 70, 'kombu', 'start') +
		label(250, 82, '= glutamát', 'start') +
		label(250, 110, 'shiitake', 'start') +
		label(250, 122, '= guanylát', 'start') +
		label(250, 150, 'spolu umami ×', 'start'),

	'uchovavanie-sveta': () =>
		// Zeer: pot in pot with wet sand, evaporation cooling.
		`<path class="ta-clay" d="M30 70h150l-14 100H44Z"/>` +
		`<path class="ta-sand-wet" d="M40 76h130l-12 88H52Z"/>` +
		`<path class="ta-clay" d="M60 80h90l-8 76H68Z"/>` +
		`<circle class="ta-tomato" cx="92" cy="130" r="12"/><circle class="ta-tomato" cx="118" cy="138" r="10"/><path class="ta-carrot-big" d="M80 110l40-4c3 0 3 6 0 7l-40 4c-3 0-3-7 0-7Z"/>` +
		`<path class="ta-cloth" d="M26 68c20-10 138-10 158 0"/>` +
		`<g class="ta-evap"><path d="M40 60c-6-8 6-12 0-20M104 54c-6-8 6-12 0-20M168 60c-6-8 6-12 0-20"/></g>` +
		sun(290, 30, 10) +
		label(105, 186, 'zeer: odparovanie chladí o ~10 °C', 'middle') +
		// A nukazuke tub.
		`<rect class="ta-nuka-tub" x="210" y="100" width="96" height="60" rx="8"/><rect class="ta-nuka" x="214" y="112" width="88" height="44" rx="4"/>` +
		`<rect class="ta-pickle" x="226" y="120" width="44" height="10" rx="5" transform="rotate(-8 248 125)"/>` +
		label(258, 178, 'nukazuke', 'middle'),

	'voda-sveta': () =>
		`<path class="ta-slope" d="M0 120L320 150V190H0Z"/>` +
		crumbs(140, 186, 22, 17) +
		[40, 130, 220]
			.map((x, i) => {
				const y = 120 + x * (30 / 320);
				return (
					`<path class="ta-pit" d="M${x - 22} ${y}a22 14 0 0 0 44 0"/>` +
					`<path class="ta-pit-compost" d="M${x - 14} ${y + 4}a14 8 0 0 0 28 0Z"/>` +
					`<path class="ta-pit-berm" d="M${x + 18} ${y + 2}c6-6 12-6 16 2"/>` +
					plant(x, y + 2, 26 + i * 4, i * 0.4, i === 1 ? 'fruit' : 'leafy') +
					drop(x - 6, 30, i * 0.6, 60 + i * 4)
				);
			})
			.join('') +
		`<path class="ta-rain-arrow" d="M300 150c-20 4-40 2-52 0"/>` +
		label(160, 24, 'jamky zaï: kompost na dne, dážď sa v nich zastaví', 'middle') +
		label(290, 184, 'svah', 'end'),

	'poda-sveta': () =>
		// Seed balls rolled and thrown; biochar crumbs in soil.
		[0, 1, 2]
			.map(
				(i) =>
					`<g class="ta-throw" style="--d:${i * 0.6}s"><circle class="ta-seedball" cx="${50 + i * 20}" cy="${60 - (i % 2) * 8}" r="9"/><circle class="ta-seed-dot" cx="${48 + i * 20}" cy="${58 - (i % 2) * 8}" r="1.6"/><circle class="ta-seed-dot" cx="${53 + i * 20}" cy="${62 - (i % 2) * 8}" r="1.6"/></g>`
			)
			.join('') +
		label(70, 96, 'semenné guľky', 'middle') +
		ground(130) +
		Array.from(
			{ length: 16 },
			(_, i) =>
				`<rect class="ta-biochar" x="${20 + ((i * 37) % 280)}" y="${140 + ((i * 13) % 40)}" width="6" height="4" rx="1" transform="rotate(${(i * 29) % 60} ${23 + ((i * 37) % 280)} ${142 + ((i * 13) % 40)})"/>`
		).join('') +
		worm(120, 160, 0) +
		plant(170, 130, 34, 0.2) +
		plant(230, 130, 40, 0.6, 'fruit') +
		label(160, 186, 'biouhlie nabité kompostom drží vodu a živiny', 'middle') +
		jar(262, 50, 40, 60, 'color-mix(in srgb, var(--leaf-2) 60%, #a8743f)') +
		label(282, 124, 'FPJ', 'middle'),

	'pohyb-sveta': () => {
		// A tai chi figure moving slowly: arms rise and fall, weight shifts.
		const figure = (x: number, d: number) =>
			`<g class="ta-taichi" style="--d:${d}s;transform-origin:${x}px 150px">` +
			`<circle class="ta-head-simple" cx="${x}" cy="62" r="9"/>` +
			`<path class="ta-person" d="M${x} 71v40M${x} 111l-12 38M${x} 111l12 38"/>` +
			`<g class="ta-arms" style="transform-origin:${x}px 80px"><path class="ta-person" d="M${x} 80c-14 4-26 0-34-8M${x} 80c14 4 26 0 34-8"/></g>` +
			`</g>`;
		return (
			`<path class="ta-floor" d="M20 150h280"/>` +
			figure(90, 0) +
			figure(200, 1.5) +
			sun(290, 30, 10) +
			label(160, 176, 'pomaly, s dychom, presúvaj váhu', 'middle') +
			label(90, 30, 'tai-či', 'middle') +
			label(200, 30, 'čchi-kung', 'middle')
		);
	},

	'zvyky-sveta': () => {
		const cx = 160;
		const cy = 100;
		const bowls = ['#e3a92a', '#6fa35a', '#c0442a', '#f1ead8', '#b5651d', '#6fa35a'];
		return (
			`<circle class="ta-thali" cx="${cx}" cy="${cy}" r="82"/>` +
			bowls
				.map((c, i) => {
					const a = (i / bowls.length) * Math.PI * 2 - Math.PI / 2;
					const x = cx + Math.cos(a) * 54;
					const y = cy + Math.sin(a) * 54;
					return `<g class="ta-float" style="--d:${i * 0.3}s"><circle class="ta-katori" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="18"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="13" style="fill:${c}" class="ta-katori-fill"/></g>`;
				})
				.join('') +
			`<circle class="ta-rice-mound" cx="${cx}" cy="${cy}" r="24"/>` +
			label(30, 30, '80 % sýtosť', 'start') +
			label(290, 30, 'malé misky', 'end') +
			label(290, 180, 'všetky chute', 'end')
		);
	}
};
