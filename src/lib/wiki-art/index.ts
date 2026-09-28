/**
 * Drawn, animated diagrams for the wiki. Markdown places one with a line
 * `{{art:name|caption}}`; content.ts swaps it for the SVG at build time, and a page's `art:`
 * frontmatter picks the drawing for its card. Colours and motion live in app.css under
 * `.tech-art`, so the drawings follow the light/dark theme and reduced motion.
 */
import { BODY_ART } from './body';
import { DIY_ART } from './diy';
import { GARDEN_ART } from './garden';
import { GARDEN_BASICS_ART } from './garden-basics';
import { KITCHEN_ART } from './kitchen';
import { LIFE_ART } from './life';
import { NUTRITION_ART } from './nutrition';
import { PRESERVES_ART } from './preserves';
import { H, W } from './kit';

const ART: Record<string, () => string> = {
	...GARDEN_ART,
	...GARDEN_BASICS_ART,
	...BODY_ART,
	...NUTRITION_ART,
	...KITCHEN_ART,
	...DIY_ART,
	...LIFE_ART,
	...PRESERVES_ART
};

export const ART_NAMES = Object.keys(ART);

/** The finished <figure> for an art marker; throws on an unknown name so typos fail the build. */
export function artFigure(name: string, caption = ''): string {
	const draw = ART[name];
	if (!draw) throw new Error(`neznáma ilustrácia "${name}"`);
	return (
		`<figure class="tech-art"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${caption || name}">${draw()}</svg>` +
		(caption ? `<figcaption>${caption}</figcaption>` : '') +
		`</figure>`
	);
}

/** Just the drawing, for cards. */
export function artSvg(name: string): string {
	const draw = ART[name];
	return draw
		? `<svg class="tech-art-svg" viewBox="0 0 ${W} ${H}" aria-hidden="true">${draw()}</svg>`
		: '';
}
