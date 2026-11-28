/**
 * Sends a little copy of the dish from the button that added it to the "Plán" link in the
 * navigation, so it's clear where it went. Purely decorative: does nothing when motion is
 * reduced or the link isn't on screen.
 */
export function flyToPlan(from: Element, art?: Element | null) {
	if (typeof window === 'undefined') return;
	if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

	const target = [...document.querySelectorAll<HTMLElement>('a[href="/plan"]')].find((a) => {
		const r = a.getBoundingClientRect();
		return r.width > 0 && r.bottom > 0 && r.top < window.innerHeight;
	});
	if (!target) return;

	const start = from.getBoundingClientRect();
	const end = target.getBoundingClientRect();
	const size = 44;
	const token = document.createElement('div');
	token.className = 'fly-token';
	token.setAttribute('aria-hidden', 'true');
	// The dish's own drawing when there is one, a plain dot otherwise.
	if (art) token.appendChild(art.cloneNode(true));
	Object.assign(token.style, {
		left: `${start.left + start.width / 2 - size / 2}px`,
		top: `${start.top + start.height / 2 - size / 2}px`,
		width: `${size}px`,
		height: `${size}px`
	});
	document.body.appendChild(token);

	const dx = end.left + end.width / 2 - (start.left + start.width / 2);
	const dy = end.top + end.height / 2 - (start.top + start.height / 2);
	// Up in an arc first, then down into the link – feels thrown rather than slid.
	const lift = Math.min(-60, dy / 2 - 80);
	const animation = token.animate(
		[
			{ transform: 'translate(0, 0) scale(1) rotate(0deg)', opacity: 1 },
			{
				transform: `translate(${dx * 0.5}px, ${lift}px) scale(1.15) rotate(-20deg)`,
				opacity: 1,
				offset: 0.45
			},
			{ transform: `translate(${dx}px, ${dy}px) scale(0.35) rotate(-40deg)`, opacity: 0.6 }
		],
		{ duration: 720, easing: 'cubic-bezier(0.45, 0, 0.3, 1)' }
	);
	animation.onfinish = () => {
		token.remove();
		target.animate(
			[{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }],
			{ duration: 380, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }
		);
	};
}
