import { redirect, type Handle } from '@sveltejs/kit';
import { legacyTarget } from '$lib/legacy';

/** Dish ids from file names only: compiling the content per request would cost CPU for nothing. */
const dishIds = new Set(
	Object.keys(import.meta.glob('/content/jedla/*.yaml')).map((p) =>
		p.slice(p.lastIndexOf('/') + 1, -'.yaml'.length)
	)
);

/** Same headers as /_headers (which only covers static assets) for responses rendered by the Worker. */
const SECURITY_HEADERS: Record<string, string> = {
	'strict-transport-security': 'max-age=31536000; includeSubDomains',
	'x-content-type-options': 'nosniff',
	'x-frame-options': 'DENY',
	'referrer-policy': 'strict-origin-when-cross-origin',
	'permissions-policy': 'camera=(self), microphone=(self), geolocation=(), payment=(), usb=()',
	'content-security-policy':
		"default-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
};

export const handle: Handle = async ({ event, resolve }) => {
	const target = legacyTarget(event.url.pathname, dishIds);
	// Temporary: old recipes get dishes of their own as they're rebuilt from parts.
	if (target) redirect(302, target);
	const response = await resolve(event);
	// Page responses carry their own CSP from kit.csp; only fill in what's missing.
	for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
		if (!response.headers.has(name)) response.headers.set(name, value);
	}
	return response;
};
