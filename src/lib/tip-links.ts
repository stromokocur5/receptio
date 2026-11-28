/** A piece of a recipe tip: plain text, or a link written in it as `[text](/path)`. */
export interface TipPart {
	text: string;
	href?: string;
}

/** Only links inside the app – a tip never sends anyone to another site. */
const LINK_RE = /\[([^\]]+)\]\((\/(?!\/)[^)\s]*)\)/g;

export function tipParts(tip: string): TipPart[] {
	const parts: TipPart[] = [];
	let last = 0;
	for (const match of tip.matchAll(LINK_RE)) {
		if (match.index > last) parts.push({ text: tip.slice(last, match.index) });
		parts.push({ text: match[1], href: match[2] });
		last = match.index + match[0].length;
	}
	if (last < tip.length) parts.push({ text: tip.slice(last) });
	return parts;
}
