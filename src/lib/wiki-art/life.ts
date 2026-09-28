import { arrow, label, plant } from './kit';
import { jar, pot, steam } from './kitchen';

/** Everyday plant-based life: switching, sharing a table, less waste, less money. */
export const LIFE_ART: Record<string, () => string> = {
	prechod: () => {
		// Steps rising: one meal, whole days, a habit.
		const steps = [
			['1 jedlo denne', 20],
			['raňajky + obed', 60],
			['celé dni', 100],
			['samozrejmosť', 140]
		] as const;
		return (
			steps
				.map(
					([name, h], i) =>
						`<rect class="ta-step" style="--d:${i * 0.3}s" x="${24 + i * 72}" y="${170 - h}" width="64" height="${h}" rx="4"/>` +
						label(56 + i * 72, 186 - 4, name, 'middle')
				)
				.join('') +
			plant(56, 150, 14, 0, 'sprout') +
			plant(128, 110, 22, 0.3) +
			plant(200, 70, 30, 0.6) +
			plant(272, 30, 26, 0.9, 'fruit') +
			`<path class="ta-arrow ta-thin-arrow" d="M40 120C120 90 200 50 290 16"/>`
		);
	},

	'pre-vsetkych': () => {
		const guest = (x: number, d: number) =>
			`<g class="ta-float" style="--d:${d}s"><circle class="ta-head-simple" cx="${x}" cy="48" r="10"/><path class="ta-person" d="M${x} 58v26M${x - 14} 70h28"/></g>`;
		return (
			`<rect class="ta-table" x="30" y="110" width="260" height="10" rx="3"/><path class="ta-table-leg" d="M50 120v60M270 120v60"/>` +
			guest(60, 0) +
			guest(120, 0.4) +
			guest(200, 0.8) +
			guest(260, 1.2) +
			`<path class="ta-plate-flat" d="M44 108h32M104 108h32M184 108h32M244 108h32"/>` +
			pot(160, 108, 64, 28, 'ta-curry') +
			steam(160, 76) +
			label(160, 150, 'známe jedlá, veľa chuti, dosť pre všetkých', 'middle')
		);
	},

	'zero-waste': () =>
		// Scraps → freezer bag → pot of stock.
		`<path class="ta-bag-freezer" d="M24 60h70v96a8 8 0 0 1-8 8H32a8 8 0 0 1-8-8Z"/><path class="ta-zip" d="M24 70h70"/>` +
		`<path class="ta-carrot-top" d="M36 100l10-8M40 110l12-4"/><path class="ta-peel-scrap" d="M40 124c10-6 20-4 26 2M34 140c14-4 30 0 40 8M56 96c8 6 14 14 14 24"/><path class="ta-onion-skin" d="M70 130c8-8 16-8 18 0-4 8-12 10-18 0Z"/>` +
		label(59, 182, 'šupky do mrazničky', 'middle') +
		arrow(100, 110, 128, 110) +
		`<path class="ta-hob" d="M130 160h90"/>` +
		pot(175, 160, 76, 56, 'ta-stock') +
		steam(175, 96) +
		label(175, 182, 'vývar zadarmo', 'middle') +
		arrow(222, 110, 246, 110) +
		jar(256, 70, 48, 90, 'color-mix(in srgb, var(--turmeric) 45%, var(--tomato) 20%)') +
		label(280, 182, 'do polievok', 'middle'),

	vysokoskolak: () => {
		const item = (x: number, y: number, d: number, body: string) =>
			`<g class="ta-pop-out" style="--d:${d}s;transform-origin:${x}px ${y}px">${body}</g>`;
		const times: [string, string][] = [
			['7:30', 'raňajky'],
			['10:00', 'hrsť orechov'],
			['12:30', 'obed z krabičky'],
			['16:00', 'ovocie'],
			['19:00', 'večera']
		];
		return (
			`<rect class="ta-backpack" x="30" y="70" width="96" height="104" rx="18"/><rect class="ta-backpack-pocket" x="46" y="124" width="64" height="40" rx="8"/><path class="ta-backpack-strap" d="M52 70c0-24 52-24 52 0"/>` +
			item(52, 70, 0, `<rect class="ta-lunchbox" x="40" y="44" width="40" height="26" rx="5"/>`) +
			item(
				84,
				66,
				0.4,
				`<rect class="ta-thermos" x="78" y="22" width="16" height="46" rx="5"/><rect class="ta-lid-knob" x="80" y="16" width="12" height="8" rx="2"/>`
			) +
			item(
				104,
				70,
				0.8,
				`<path class="ta-bottle-glass" d="M100 34h10v8l4 6v24a3 3 0 0 1-3 3h-12a3 3 0 0 1-3-3V48l4-6Z"/>`
			) +
			item(124, 76, 1.2, `<circle class="ta-apple" cx="128" cy="62" r="10"/>`) +
			`<path class="ta-timeline" d="M168 30V170"/>` +
			times
				.map(
					([t, what], i) =>
						`<circle class="ta-time-dot" style="--d:${i * 0.4}s" cx="168" cy="${34 + i * 34}" r="5"/>` +
						label(180, 32 + i * 34, t) +
						label(180, 44 + i * 34, what)
				)
				.join('')
		);
	},

	'lacne-varenie': () =>
		`<path class="ta-bag-paper" d="M40 60h110l-8 110H48Z"/><path class="ta-bag-fold" d="M40 60l10-12h90l10 12"/>` +
		`<g class="ta-float" style="--d:0s">${jar(56, 30, 22, 36, '#c0442a', false)}</g>` +
		`<g class="ta-float" style="--d:0.4s">${jar(84, 24, 22, 40, '#e3c98a', false)}</g>` +
		`<g class="ta-float" style="--d:0.8s">${jar(112, 32, 22, 34, '#f1ead8', false)}</g>` +
		`<path class="ta-carrot-big" d="M60 120l60-6c4 0 4 8 0 10l-60 6c-4 0-4-10 0-10Z"/><circle class="ta-onion" cx="120" cy="146" r="12"/><ellipse class="ta-potato" cx="76" cy="150" rx="16" ry="10"/>` +
		label(95, 186, 'strukoviny, obilniny, sezónna zelenina', 'middle') +
		`<g class="ta-coin-stack">` +
		[0, 1, 2, 3]
			.map((i) => `<ellipse class="ta-coin-big" cx="240" cy="${150 - i * 10}" rx="26" ry="8"/>`)
			.join('') +
		`</g>` +
		`<text class="ta-label ta-strong" x="240" y="88" text-anchor="middle">0,30–0,70 €</text>` +
		label(240, 102, 'za porciu', 'middle') +
		label(240, 186, '15–25 € na týždeň', 'middle')
};
