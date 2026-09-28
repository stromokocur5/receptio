import { arrow, label } from './kit';

/**
 * Joint angles in degrees. Each limb is drawn pointing down and rotated at its joint:
 * 0 = down, 90 = left, 180 = up, -90 = right. Limbs further out are relative to the one they
 * hang from (the forearm to the upper arm, the arms to the torso).
 */
interface Pose {
	torso: number;
	neck?: number;
	armL: [number, number];
	armR: [number, number];
	legL: [number, number];
	legR: [number, number];
	/** Hips moved from where the figure stands, e.g. down in a squat. */
	shift?: [number, number];
}

const TORSO = 32;
const UPPER = 17;
const FORE = 16;
const THIGH = 22;
const SHIN = 22;

function joint(from: number, to: number, body: string, length: number, next = '') {
	return (
		`<g class="ta-joint" style="--from:${from}deg;--to:${to}deg">` +
		`<path d="M0 0V${length}"/>` +
		(next ? `<g transform="translate(0 ${length})">${next}</g>` : '') +
		body +
		`</g>`
	);
}

function limb(a: [number, number], b: [number, number], upper: number, lower: number, end = '') {
	return joint(a[0], b[0], '', upper, joint(a[1], b[1], end, lower));
}

/**
 * A figure standing with its hips at (x, y) that moves from pose `a` to `b` and back.
 * `hand` is drawn at the right hand (a dumbbell…), `back` puts the left limbs behind.
 */
function figure(
	x: number,
	y: number,
	a: Pose,
	b: Pose,
	{
		dur = 1.6,
		hand = '',
		cls = '',
		scale = 1.3
	}: { dur?: number; hand?: string; cls?: string; scale?: number } = {}
) {
	const [x1, y1] = a.shift ?? [0, 0];
	const [x2, y2] = b.shift ?? [0, 0];
	const head = `<g transform="translate(0 ${TORSO})">${joint(a.neck ?? 0, b.neck ?? 0, `<circle class="ta-head" cx="0" cy="9" r="7.5"/>`, 1)}</g>`;
	const arms =
		`<g transform="translate(0 ${TORSO - 3})">` +
		`<g class="ta-far">${limb(a.armL, b.armL, UPPER, FORE)}</g>` +
		limb(
			a.armR,
			b.armR,
			UPPER,
			FORE,
			hand ? `<g transform="translate(0 ${FORE})">${hand}</g>` : ''
		) +
		`</g>`;
	return (
		`<g transform="translate(${x} ${y}) scale(${scale})"><g class="ta-figure ${cls}" style="--dur:${dur}s;--x1:${x1}px;--y1:${y1}px;--x2:${x2}px;--y2:${y2}px">` +
		`<g class="ta-far">${limb(a.legL, b.legL, THIGH, SHIN)}</g>` +
		joint(a.torso, b.torso, head + arms, TORSO) +
		limb(a.legR, b.legR, THIGH, SHIN) +
		`</g></g>`
	);
}

const floor = (x1: number, x2: number, y: number) =>
	`<path class="ta-floor" d="M${x1} ${y}H${x2}"/>`;

const dumbbell = `<g class="ta-dumbbell"><path d="M-7 0h14"/><rect x="-10" y="-4" width="4" height="8" rx="1"/><rect x="6" y="-4" width="4" height="8" rx="1"/></g>`;

export const BODY_ART: Record<string, () => string> = {
	'drep-klik': () =>
		floor(10, 310, 160) +
		// Squat, facing right: hips go back and down, arms forward for balance.
		figure(
			70,
			103,
			{ torso: 180, armL: [175, 0], armR: [185, 0], legL: [0, 0], legR: [2, 0] },
			{
				torso: 208,
				armL: [60, 0],
				armR: [66, 0],
				legL: [-70, 105],
				legR: [-68, 103],
				shift: [-8, 18]
			},
			{ dur: 1.8 }
		) +
		label(70, 180, 'drep', 'middle') +
		label(70, 26, 'kolená nad špičkami') +
		// Push-up, head to the right: the whole body lowers in one line.
		figure(
			205,
			134,
			{ torso: 243, armL: [117, 0], armR: [119, 0], legL: [63, 0], legR: [63, 0] },
			{
				torso: 262,
				armL: [207, 251],
				armR: [207, 251],
				legL: [82, 0],
				legR: [82, 0],
				shift: [0, 14]
			},
			{ dur: 1.8 }
		) +
		label(236, 180, 'klik', 'middle') +
		label(310, 96, 'telo v jednej línii', 'end'),

	rozcvicka: () =>
		floor(10, 310, 166) +
		// Side bends with an arm over the head, front view.
		figure(
			80,
			109,
			{ torso: 180, armL: [-160, 0], armR: [170, 0], legL: [8, 0], legR: [-8, 0] },
			{ torso: 160, armL: [-140, 0], armR: [0, 0], legL: [8, 0], legR: [-8, 0] },
			{ dur: 2.2 }
		) +
		label(80, 184, 'úklony do strán', 'middle') +
		// Marching on the spot, side view: knees up in turn.
		figure(
			226,
			109,
			{ torso: 180, armL: [150, -20], armR: [210, -30], legL: [-80, 90], legR: [0, 0] },
			{ torso: 180, armL: [210, -30], armR: [150, -20], legL: [0, 0], legR: [-80, 90] },
			{ dur: 0.7 }
		) +
		label(226, 184, 'chôdza na mieste', 'middle') +
		label(160, 24, '10 minút, nič nesmie bolieť', 'middle'),

	strecing: () =>
		floor(10, 310, 166) +
		// Kneeling hip-flexor stretch: hips push forward slowly.
		figure(
			92,
			139,
			{ torso: 180, armL: [175, 20], armR: [180, 20], legL: [-85, 116], legR: [20, 70] },
			{
				torso: 172,
				armL: [178, 20],
				armR: [183, 20],
				legL: [-78, 110],
				legR: [30, 60],
				shift: [6, 2]
			},
			{ dur: 3.2 }
		) +
		label(92, 184, 'výpad na kolene', 'middle') +
		// Neck: ear slowly towards the shoulder.
		figure(
			230,
			109,
			{ torso: 180, neck: 0, armL: [178, 0], armR: [182, 0], legL: [6, 0], legR: [-6, 0] },
			{ torso: 180, neck: 28, armL: [178, 0], armR: [182, 0], legL: [6, 0], legR: [-6, 0] },
			{ dur: 3 }
		) +
		label(230, 184, 'krk k ramenu', 'middle') +
		label(160, 24, 'drž 30–45 sekúnd, dýchaj', 'middle'),

	'jedlo-cvicenie': () => {
		const slot = (x: number, title: string, time: string, inner: string) =>
			`<rect class="ta-panel" x="${x}" y="100" width="70" height="62" rx="10"/>` +
			inner +
			label(x + 35, 176, title, 'middle') +
			label(x + 35, 188, time, 'middle');
		return (
			figure(
				150,
				52,
				{ torso: 180, armL: [182, 0], armR: [176, 0], legL: [4, 0], legR: [-4, 0] },
				{ torso: 180, armL: [182, 0], armR: [176, -140], legL: [4, 0], legR: [-4, 0] },
				{ dur: 1.4, hand: dumbbell, scale: 1 }
			) +
			slot(
				30,
				'jedlo',
				'1–3 h pred',
				`<path class="ta-bowl" d="M44 132h42a21 16 0 0 1-42 0Z"/><path class="ta-food" d="M50 132c4-8 12-10 16-6 4-6 12-4 14 6Z"/>`
			) +
			slot(
				125,
				'banán, datle',
				'30–60 min pred',
				`<path class="ta-banana" d="M140 124c6 20 26 24 42 14-18 4-32-2-38-16Z"/>`
			) +
			slot(
				220,
				'bielkoviny',
				'do 2 h po',
				`<path class="ta-glass" d="M240 112h22l-3 38h-16Z"/><path class="ta-shake" d="M242 124h18l-2 24h-14Z"/><rect class="ta-tofu" x="266" y="136" width="14" height="12" rx="2"/>`
			) +
			arrow(104, 130, 122, 130) +
			arrow(199, 130, 217, 130)
		);
	}
};
