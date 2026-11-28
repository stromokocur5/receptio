import { arrow, drop, label, snow, sun } from './kit';
import { bubbles, flames, jar, pot, steam } from './kitchen';

/** A jar with a coloured filling and a lid, for rows of preserves. */
function preserveJar(x: number, y: number, w: number, h: number, color: string, d = 0) {
	return `<g class="ta-float" style="--d:${d}s">${jar(x, y, w, h, color)}<rect class="ta-jar-label" x="${x + 4}" y="${y + h * 0.45}" width="${w - 8}" height="${h * 0.22}" rx="2"/></g>`;
}

export const PRESERVES_ART: Record<string, () => string> = {
	zavaranie: () =>
		`<path class="ta-hob" d="M30 170h170"/>` +
		pot(115, 170, 160, 90, 'ta-water', 0.75) +
		`<path class="ta-towel-strip" d="M44 166h142"/>` +
		[0, 1, 2]
			.map((i) => jar(56 + i * 40, 100, 32, 62, ['#d9582f', '#7a2a4a', '#e3a92a'][i]))
			.join('') +
		bubbles(115, 100, 150, 5) +
		flames(115, 182, 0.9) +
		`<path class="ta-thermo" d="M232 28v96"/><circle class="ta-thermo-bulb" cx="232" cy="130" r="7"/><path class="ta-thermo-fill" d="M232 124V60"/>` +
		label(244, 60, 'vriaca voda') +
		label(244, 74, '100 °C') +
		label(244, 152, 'voda nad viečka'),

	dzemy: () =>
		`<path class="ta-hob" d="M20 160h120"/>` +
		pot(80, 160, 100, 56, 'ta-jam') +
		bubbles(80, 118, 90, 4) +
		steam(80, 96) +
		flames(80, 172, 0.7) +
		// Plate test: the drop wrinkles when pushed.
		`<ellipse class="ta-plate-cold" cx="222" cy="120" rx="64" ry="18"/>` +
		`<g class="ta-wrinkle"><ellipse class="ta-jam-drop" cx="222" cy="116" rx="18" ry="8"/><path class="ta-wrinkle-line" d="M210 114c4-2 8 2 12 0s8 2 12 0"/></g>` +
		`<path class="ta-finger" d="M262 96c-8 4-14 10-16 18"/>` +
		snow(180, 80, 0) +
		label(222, 156, 'test tanierikom:', 'middle') +
		label(222, 168, 'zvraští sa = hotové', 'middle') +
		label(80, 186, '104–105 °C', 'middle'),

	nakladana: () =>
		`<rect class="ta-jar" x="70" y="40" width="90" height="130" rx="10"/><rect class="ta-jar-lid" x="66" y="32" width="98" height="10" rx="3"/>` +
		`<path class="ta-brine" d="M72 60h86v104a6 6 0 0 1-6 6H78a6 6 0 0 1-6-6Z"/>` +
		[0, 1, 2, 3, 4]
			.map(
				(i) =>
					`<rect class="ta-pickle" x="${78 + i * 15}" y="${68 + (i % 2) * 8}" width="12" height="${90 - (i % 2) * 8}" rx="6"/>`
			)
			.join('') +
		`<g class="ta-sway" style="--d:0s;transform-origin:115px 70px"><path class="ta-dill" d="M100 70l-10-16M100 70l2-20M100 70l12-14M90 54h-4M102 50v-4M112 56l4-2"/></g>` +
		[0, 1, 2, 3]
			.map(
				(i) => `<circle class="ta-mustard" cx="${84 + i * 20}" cy="${150 + (i % 2) * 6}" r="2"/>`
			)
			.join('') +
		`<path class="ta-pour-brine" d="M200 30c-10 0-30 6-40 20"/>` +
		`<path class="ta-kettle" d="M196 20h60v30a8 8 0 0 1-8 8h-44a8 8 0 0 1-8-8Z"/>` +
		label(226, 80, '1 l vody', 'start') +
		label(226, 94, '500 ml octu 8 %', 'start') +
		label(226, 108, '100–150 g cukru', 'start') +
		label(226, 122, '1 PL soli', 'start') +
		label(115, 186, 'uhorky tesne, nálev po okraj', 'middle'),

	susenie: () =>
		`<rect class="ta-oven-box" x="30" y="24" width="170" height="150" rx="10"/>` +
		`<rect class="ta-window" x="42" y="40" width="146" height="110" rx="6"/>` +
		[0, 1].map((r) => `<path class="ta-rack" d="M48 ${80 + r * 44}h134"/>`).join('') +
		Array.from(
			{ length: 6 },
			(_, i) =>
				`<g class="ta-shrink" style="--d:${i * 0.3}s;transform-origin:${58 + i * 22}px 74px"><circle class="ta-apple-slice" cx="${58 + i * 22}" cy="74" r="8"/><circle class="ta-apple-core" cx="${58 + i * 22}" cy="74" r="2.5"/></g>`
		).join('') +
		Array.from(
			{ length: 6 },
			(_, i) =>
				`<g class="ta-shrink" style="--d:${0.2 + i * 0.3}s;transform-origin:${58 + i * 22}px 118px"><path class="ta-tomato-half" d="M${50 + i * 22} 118a8 7 0 0 1 16 0Z"/></g>`
		).join('') +
		`<path class="ta-door-gap" d="M200 40l14 -8M200 150l14 8"/><path class="ta-spoon-wood" d="M200 156l16 6"/>` +
		`<g class="ta-steam-lines"><path d="M216 60c8-6 0-12 8-18M220 90c8-6 0-12 8-18"/></g>` +
		label(260, 60, 'dvierka', 'middle') +
		label(260, 72, 'pootvorené', 'middle') +
		label(115, 186, '50–60 °C, tenké plátky', 'middle') +
		sun(282, 150, 9),

	'mrazenie-urody': () => {
		const station = (x: number, title: string, inner: string) =>
			inner + label(x, 176, title, 'middle');
		return (
			station(
				50,
				'2–3 min var',
				pot(50, 150, 70, 50) +
					`<g class="ta-dunk">${Array.from({ length: 4 }, (_, i) => `<circle class="ta-broc" cx="${38 + i * 8}" cy="${122 - (i % 2) * 4}" r="5"/>`).join('')}</g>` +
					flames(50, 162, 0.6)
			) +
			arrow(90, 120, 110, 120) +
			station(
				150,
				'ľadová voda',
				`<path class="ta-bowl" d="M112 116h76a38 30 0 0 1-76 0Z"/><path class="ta-water" d="M118 122h64a32 22 0 0 1-64 0Z"/>` +
					[0, 1, 2]
						.map(
							(i) =>
								`<rect class="ta-ice-cube" x="${128 + i * 16}" y="118" width="12" height="10" rx="2"/>`
						)
						.join('')
			) +
			arrow(192, 120, 212, 120) +
			station(
				266,
				'na tácke zmraziť',
				`<rect class="ta-fridge" x="226" y="40" width="80" height="120" rx="8"/><rect class="ta-tray-ice" x="236" y="96" width="60" height="10" rx="2"/>` +
					Array.from(
						{ length: 5 },
						(_, i) => `<circle class="ta-broc" cx="${244 + i * 11}" cy="92" r="4.5"/>`
					).join('') +
					snow(250, 64, 0) +
					snow(282, 70, 1)
			) +
			label(160, 24, 'blanšírovanie zastaví enzýmy', 'middle')
		);
	},

	sirupy: () =>
		`<path class="ta-cloth-bag" d="M70 30c20 8 60 8 80 0l-20 70c-8 12-32 12-40 0Z"/>` +
		`<path class="ta-string" d="M60 24l10 6M160 24l-10 6"/>` +
		[0, 1, 2].map((i) => drop(104 + i * 6, 104, i * 0.5, 30)).join('') +
		`<path class="ta-bowl" d="M60 140h100a50 30 0 0 1-100 0Z"/><path class="ta-syrup" d="M66 146h88a44 22 0 0 1-88 0Z"/>` +
		label(110, 186, 'preceď, rozpusti cukor', 'middle') +
		arrow(166, 120, 196, 120) +
		[0, 1]
			.map(
				(i) =>
					`<path class="ta-bottle-glass" d="M${216 + i * 44} 60h14v16l10 14v70a6 6 0 0 1-6 6h-22a6 6 0 0 1-6-6V90l10-14Z"/><path class="ta-syrup" d="M${210 + i * 44} 100h26v58a4 4 0 0 1-4 4h-18a4 4 0 0 1-4-4Z"/><rect class="ta-jar-lid" x="${214 + i * 44}" y="54" width="18" height="8" rx="2"/>`
			)
			.join('') +
		label(250, 186, 'riediť 1 : 6', 'middle'),

	'kalendar-konzervovania': () => {
		const months = ['III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
		const colors = [
			'#6fa35a',
			'#6fa35a',
			'#f1ead8',
			'#d9582f',
			'#b3263e',
			'#d9582f',
			'#7a2a4a',
			'#e3a92a',
			'#c8341e',
			'#e3c98a'
		];
		return (
			`<path class="ta-shelf-board" d="M10 100h300M10 176h300"/>` +
			months
				.map((m, i) => {
					const x = 16 + (i % 5) * 60;
					const y = i < 5 ? 44 : 120;
					return (
						preserveJar(x + 6, y, 36, 52, colors[i], i * 0.2) +
						label(x + 24, y + 70 - 4, m, 'middle')
					);
				})
				.join('')
		);
	}
};
