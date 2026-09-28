import { arrow, label, sun } from './kit';

/** A bar that grows from the left to `value` of `max`, after `d` seconds. */
function bar(x: number, y: number, width: number, value: number, max: number, d: number, cls = '') {
	const w = Math.max(2, (value / max) * width);
	return (
		`<rect class="ta-bar-bg" x="${x}" y="${y}" width="${width}" height="12" rx="6"/>` +
		`<rect class="ta-bar ${cls}" style="--d:${d}s" x="${x}" y="${y}" width="${w.toFixed(1)}" height="12" rx="6"/>`
	);
}

function pill(x: number, y: number, r = 7, cls = '') {
	return `<circle class="ta-pill ${cls}" cx="${x}" cy="${y}" r="${r}"/><path class="ta-pill-line" d="M${x - r * 0.6} ${y}h${r * 1.2}"/>`;
}

function bacterium(x: number, y: number, a: number, d: number) {
	return `<g class="ta-bacterium" style="--d:${d}s;transform-origin:${x}px ${y}px"><rect x="${x - 9}" y="${y - 4}" width="18" height="8" rx="4" transform="rotate(${a} ${x} ${y})"/></g>`;
}

export const NUTRITION_ART: Record<string, () => string> = {
	b12: () =>
		`<circle class="ta-dish" cx="62" cy="86" r="44"/>` +
		bacterium(46, 72, 20, 0) +
		bacterium(74, 66, -30, 0.4) +
		bacterium(60, 96, 60, 0.8) +
		bacterium(82, 94, 5, 1.2) +
		bacterium(42, 102, -50, 1.6) +
		label(62, 148, 'B12 vyrábajú baktérie', 'middle') +
		arrow(112, 86, 148, 86) +
		`<rect class="ta-bottle" x="156" y="50" width="44" height="66" rx="8"/><rect class="ta-cap" x="162" y="40" width="32" height="12" rx="3"/>` +
		`<text class="ta-label ta-strong" x="178" y="88" text-anchor="middle">B12</text>` +
		label(178, 148, 'suplement', 'middle') +
		`<rect class="ta-panel" x="216" y="34" width="96" height="46" rx="8"/>` +
		[0, 1, 2, 3, 4, 5, 6].map((i) => pill(226 + i * 12.5, 64, 4.5, 'ta-pop')).join('') +
		label(264, 50, 'denne 25–100 µg', 'middle') +
		`<rect class="ta-panel" x="216" y="92" width="96" height="46" rx="8"/>` +
		pill(264, 122, 8, 'ta-pop') +
		label(264, 108, 'alebo 2000 µg týždenne', 'middle') +
		label(160, 180, 'z rastlín ani z rias ho spoľahlivo nezískaš', 'middle'),

	jod: () =>
		`<g class="ta-shake"><path class="ta-shaker" d="M70 60h40v80a8 8 0 0 1-8 8H78a8 8 0 0 1-8-8Z"/><path class="ta-shaker-top" d="M72 60c0-14 36-14 36 0Z"/><circle class="ta-dot" cx="84" cy="52" r="1.5"/><circle class="ta-dot" cx="90" cy="49" r="1.5"/><circle class="ta-dot" cx="96" cy="52" r="1.5"/>` +
		`<path class="ta-salt-fill" d="M72 100h36v38a6 6 0 0 1-6 6H78a6 6 0 0 1-6-6Z"/>` +
		`<text class="ta-label ta-strong" x="90" y="88" text-anchor="middle">jód</text></g>` +
		[0, 1, 2, 3]
			.map(
				(i) =>
					`<rect class="ta-grain" style="--d:${i * 0.3}s" x="${128 + i * 5}" y="70" width="3" height="3"/>`
			)
			.join('') +
		label(90, 170, 'jódovaná soľ', 'middle') +
		`<path class="ta-check" d="M76 180l6 6 12-12" transform="translate(-6 -2)"/>` +
		`<path class="ta-jar" d="M188 74h48v70a8 8 0 0 1-8 8h-32a8 8 0 0 1-8-8Z"/><path class="ta-jar-lid" d="M184 66h56v10h-56Z"/>` +
		`<path class="ta-salt-fill" d="M190 110h44v32a6 6 0 0 1-6 6h-32a6 6 0 0 1-6-6Z"/>` +
		label(212, 170, 'morská, himalájska', 'middle') +
		label(212, 182, 'väčšinou bez jódu', 'middle') +
		label(160, 24, 'cieľ 150 µg denne', 'middle'),

	bielkoviny: () => {
		const rows: [string, number][] = [
			['výživné droždie', 45],
			['seitan', 25],
			['tempeh', 19],
			['tofu', 15],
			['šošovica varená', 9],
			['cícer varený', 8],
			['sójové mlieko', 3.3]
		];
		return (
			label(10, 18, 'Bielkoviny na 100 g') +
			rows
				.map(
					([name, g], i) =>
						label(120, 38 + i * 21, name, 'end') +
						bar(128, 29 + i * 21, 150, g, 45, i * 0.15) +
						label(284, 38 + i * 21, `${String(g).replace('.', ',')} g`)
				)
				.join('')
		);
	},

	'omega-3': () =>
		// ALA from seeds and walnuts turns into only a little EPA/DHA; algae give it directly.
		`<path class="ta-spoon" d="M20 76h40"/><path class="ta-spoon-bowl" d="M58 76h32a16 11 0 0 1-32 0Z"/>` +
		Array.from(
			{ length: 9 },
			(_, i) =>
				`<ellipse class="ta-seed-flax" cx="${66 + (i % 3) * 8}" cy="${79 + Math.floor(i / 3) * 3}" rx="3" ry="1.8"/>`
		).join('') +
		`<g class="ta-walnut"><circle cx="46" cy="118" r="14"/><path d="M46 104v28M36 110c4 4 4 12 0 16M56 110c-4 4-4 12 0 16"/></g>` +
		Array.from(
			{ length: 7 },
			(_, i) =>
				`<circle class="ta-chia" cx="${72 + (i % 4) * 6}" cy="${116 + Math.floor(i / 4) * 6}" r="1.8"/>`
		).join('') +
		label(56, 150, 'ALA: ľan, chia,', 'middle') +
		label(56, 162, 'orechy, repkový olej', 'middle') +
		`<path class="ta-arrow ta-thin-arrow" d="M104 84L266 78"/><path class="ta-arrow" d="M260 74l6 4-6 4"/>` +
		label(180, 72, 'telo premení len pár %', 'middle') +
		`<g class="ta-algae">` +
		[0, 1, 2, 3]
			.map(
				(i) =>
					`<path class="ta-alga" style="--d:${i * 0.4}s;transform-origin:${216 + i * 14}px 168px" d="M${216 + i * 14} 168c-6-10 6-16 0-24s6-16 0-24"/>`
			)
			.join('') +
		`</g>` +
		label(236, 182, 'riasy', 'middle') +
		`<g class="ta-oil-drop"><path d="M286 64c-10 14-14 20-14 26a14 14 0 0 0 28 0c0-6-4-12-14-26Z"/></g>` +
		label(286, 124, 'EPA + DHA', 'middle') +
		arrow(258, 118, 278, 104),

	zelezo: () =>
		`<path class="ta-bowl" d="M34 90h112a56 44 0 0 1-112 0Z"/>` +
		Array.from(
			{ length: 11 },
			(_, i) =>
				`<ellipse class="ta-lentil" cx="${52 + (i % 6) * 15}" cy="${92 + Math.floor(i / 6) * 10}" rx="6" ry="4"/>`
		).join('') +
		`<g class="ta-lemon"><ellipse cx="160" cy="70" rx="18" ry="13"/><path d="M146 70h28M160 58v24"/></g>` +
		label(90, 164, 'strukoviny + vitamín C', 'middle') +
		`<g class="ta-boost"><path class="ta-arrow" d="M200 130V46M194 54l6-8 6 8"/></g>` +
		label(212, 92, 'vstrebá sa', 'start') +
		label(212, 104, 'oveľa viac', 'start') +
		`<path class="ta-cup" d="M252 130h40v18a14 14 0 0 1-14 14h-12a14 14 0 0 1-14-14Z"/><path class="ta-cup" d="M292 136c10 0 10 14 0 14"/>` +
		`<path class="ta-no" d="M246 118l52 52M298 118l-52 52"/>` +
		label(272, 184, 'čaj a káva hodinu mimo', 'middle'),

	zinok: () =>
		Array.from(
			{ length: 12 },
			(_, i) =>
				`<ellipse class="ta-pumpkin-seed" cx="${40 + (i % 4) * 18}" cy="${72 + Math.floor(i / 4) * 16}" rx="8" ry="5" transform="rotate(${((i * 37) % 60) - 30} ${40 + (i % 4) * 18} ${72 + Math.floor(i / 4) * 16})"/>`
		).join('') +
		label(66, 136, 'tekvicové semienka,', 'middle') +
		label(66, 148, 'kešu, tofu, strukoviny', 'middle') +
		// A bowl being drained: soaking and pouring the water away lowers phytates.
		`<g class="ta-tilt"><path class="ta-bowl" d="M160 70h80a40 32 0 0 1-80 0Z"/><path class="ta-water" d="M166 78h68a34 22 0 0 1-68 0Z"/>` +
		Array.from(
			{ length: 6 },
			(_, i) =>
				`<ellipse class="ta-lentil" cx="${182 + (i % 3) * 16}" cy="${88 + Math.floor(i / 3) * 8}" rx="6" ry="4"/>`
		).join('') +
		`</g>` +
		[0, 1, 2]
			.map(
				(i) =>
					`<path class="ta-drop" style="--d:${i * 0.5}s;--fall:30px" d="M${248 + i * 4} 90c-2 3-3 4.5-3 6a3 3 0 0 0 6 0c0-1.5-1-3-3-6Z"/>`
			)
			.join('') +
		label(208, 148, 'namoč a vodu sceď', 'middle') +
		label(160, 180, 'cieľ ~10 mg denne', 'middle'),

	'vitamin-d': () => {
		const person = (x: number) =>
			`<circle class="ta-head-simple" cx="${x}" cy="110" r="7"/><path class="ta-person" d="M${x} 117v24M${x} 141l-7 16M${x} 141l7 16M${x} 124l-10 8M${x} 124l10 8"/>`;
		return (
			`<rect class="ta-panel" x="8" y="10" width="146" height="172" rx="10"/>` +
			`<rect class="ta-panel ta-winter" x="166" y="10" width="146" height="172" rx="10"/>` +
			sun(81, 36, 10) +
			`<path class="ta-ray" d="M81 52L81 100"/><path class="ta-ray" style="--d:0.4s" d="M72 52L68 100"/><path class="ta-ray" style="--d:0.8s" d="M90 52L94 100"/>` +
			person(81) +
			label(81, 196 - 20, 'apríl – september', 'middle') +
			sun(292, 110, 8) +
			`<path class="ta-ray ta-ray-weak" d="M280 112L220 108"/><path class="ta-ray ta-ray-weak" style="--d:0.6s" d="M280 118L226 116"/>` +
			person(210) +
			label(239, 60, 'október – marec:', 'middle') +
			label(239, 72, 'slnko je nízko,', 'middle') +
			label(239, 84, 'D sa netvorí', 'middle') +
			label(239, 176, '1000–2000 IU denne', 'middle')
		);
	},

	vapnik: () =>
		`<path class="ta-glass" d="M24 58h36l-4 64H28Z"/><path class="ta-milk" d="M26 72h32l-3 48H29Z"/>` +
		label(42, 140, 'pohár', 'middle') +
		label(42, 152, 'obohateného', 'middle') +
		`<rect class="ta-tofu" x="84" y="84" width="40" height="30" rx="4"/><path class="ta-tofu-line" d="M84 94h40M104 84v30"/>` +
		label(104, 140, 'tofu', 'middle') +
		label(104, 152, 's E516', 'middle') +
		`<g class="ta-sway" style="--d:0s;transform-origin:162px 118px"><path class="ta-stem" d="M162 118V78"/><path class="ta-leaf" d="M162 100c-14-2-20-12-18-22 12 2 18 10 18 22Zm0-10c12-2 18-12 16-20-10 2-16 10-16 20Z"/></g>` +
		label(162, 140, 'kel,', 'middle') +
		label(162, 152, 'brokolica', 'middle') +
		label(10, 26, 'Cieľ ~1000 mg denne') +
		// How a day adds up: glass 300 + tofu (100 g) 350 + greens and tahini ~350.
		`<rect class="ta-bar-bg" x="200" y="60" width="18" height="100" rx="9"/>` +
		`<rect class="ta-bar-v ta-q1" style="--d:0s" x="200" y="130" width="18" height="30" rx="4"/>` +
		`<rect class="ta-bar-v ta-q3" style="--d:0.4s" x="200" y="95" width="18" height="35" rx="4"/>` +
		`<rect class="ta-bar-v ta-q2" style="--d:0.8s" x="200" y="60" width="18" height="35" rx="4"/>` +
		label(226, 149, '300 mg pohár') +
		label(226, 116, '350 mg tofu') +
		label(226, 81, 'zelenina, tahini') +
		label(310, 26, 'špenát sa takmer nevstrebe', 'end')
};
