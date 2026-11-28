import { blobPath, hashString, plateLayers, seededRandom } from './art';
import type { Ingredient, RecipeLine } from './types';

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

const PAPER = '#f6efe2';
const PLATE = '#fbf7ee';
const PLATE_RIM = '#e9dfcc';
const LEAF = '#2f6b43';
const LEAF_2 = '#6fa35a';
const TOMATO = '#d9582f';

export interface OgPlate {
	seed: string;
	lines: RecipeLine[];
}

/** The 200×200 plate from PlateArt as standalone markup (literal colors, no CSS variables). */
function plateMarkup(plate: OgPlate, byId: Map<string, Ingredient>, uid: string): string {
	const food = plateLayers(plate.seed, plate.lines, byId, true)
		.map(
			(l) =>
				`<path d="${l.d}" fill="${l.color}"${l.kind === 'base' ? ' opacity="0.92"' : ''}${
					l.kind === 'chunk' ? ' stroke="rgba(0,0,0,0.08)" stroke-width="0.8"' : ''
				}/>`
		)
		.join('');
	return `<defs>
		<radialGradient id="${uid}-rim" cx="50%" cy="45%" r="55%"><stop offset="80%" stop-color="${PLATE}"/><stop offset="100%" stop-color="${PLATE_RIM}"/></radialGradient>
		<radialGradient id="${uid}-gloss" cx="35%" cy="30%" r="70%"><stop offset="0%" stop-color="#fff" stop-opacity="0.35"/><stop offset="60%" stop-color="#fff" stop-opacity="0"/></radialGradient>
		<clipPath id="${uid}-well"><circle cx="100" cy="100" r="76"/></clipPath>
	</defs>
	<ellipse cx="106" cy="110" rx="90" ry="88" fill="rgba(40,28,10,0.13)"/>
	<circle cx="100" cy="100" r="92" fill="url(#${uid}-rim)"/>
	<circle cx="100" cy="100" r="76" fill="${PLATE}" stroke="${PLATE_RIM}" stroke-width="1.2"/>
	<g clip-path="url(#${uid}-well)">${food}<circle cx="100" cy="100" r="76" fill="url(#${uid}-gloss)"/></g>`;
}

const LOGO = `<path d="M24 22C22 13 26 6 36 4c1 9-4 16-12 18Z" fill="${LEAF_2}"/><path d="M24 22c2-5 5-9 10-15" stroke="${PAPER}" stroke-width="1.4" fill="none" stroke-linecap="round"/><path d="M23 23c-2-6-7-9-13-8 0 6 5 9 13 8Z" fill="${LEAF}"/><path d="M5 24h38a19 19 0 0 1-38 0Z" fill="${TOMATO}"/><path d="M9 28h30" stroke="${PAPER}" stroke-opacity=".5" stroke-width="2" stroke-linecap="round"/>`;

/** Scattered soft blobs in the accent color, so every card has its own background. */
function confetti(seed: string, accent: string): string {
	const rand = seededRandom(hashString(`${seed}:bg`));
	let out = '';
	for (let i = 0; i < 14; i++) {
		const x = rand() * OG_WIDTH;
		const y = rand() * OG_HEIGHT;
		const r = 6 + rand() * 18;
		out += `<path d="${blobPath(x, y, r, rand, 0.25, 6)}" fill="${accent}" opacity="${(0.12 + rand() * 0.18).toFixed(2)}"/>`;
	}
	return out;
}

function frame(seed: string, accent: string, body: string): string {
	const rand = seededRandom(hashString(`${seed}:halo`));
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}">
	<rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="${PAPER}"/>
	${confetti(seed, accent)}
	<path d="${blobPath(600, 315, 290, rand, 0.1, 10, 1.25)}" fill="${accent}" opacity="0.22"/>
	${body}
	<g transform="translate(1068 28) scale(2.2)">${LOGO}</g>
</svg>`;
}

/** Link-preview image for one recipe: its plate, big, on the cuisine's color. */
export function recipeOgSvg(plate: OgPlate, byId: Map<string, Ingredient>, accent: string): string {
	const size = 540;
	const x = (OG_WIDTH - size) / 2;
	const y = (OG_HEIGHT - size) / 2;
	return frame(
		plate.seed,
		accent,
		`<g transform="translate(${x} ${y}) scale(${size / 200})">${plateMarkup(plate, byId, 'p')}</g>`
	);
}

/** Link-preview image for the site: three overlapping plates. */
export function siteOgSvg(
	plates: [OgPlate, OgPlate, OgPlate],
	byId: Map<string, Ingredient>
): string {
	const spots = [
		{ x: 90, y: 150, size: 400 },
		{ x: 710, y: 150, size: 400 },
		{ x: 370, y: 70, size: 470 }
	];
	const body = plates
		.map((plate, i) => {
			const { x, y, size } = spots[i];
			return `<g transform="translate(${x} ${y}) scale(${size / 200})">${plateMarkup(plate, byId, `p${i}`)}</g>`;
		})
		.join('');
	return frame('receptio', LEAF_2, body);
}
