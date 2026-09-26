import type { Handle } from '@sveltejs/kit';

/** Same headers as /_headers (which only covers static assets) for responses rendered by the Worker. */
const SECURITY_HEADERS: Record<string, string> = {
	'strict-transport-security': 'max-age=31536000; includeSubDomains',
	'x-content-type-options': 'nosniff',
	'x-frame-options': 'DENY',
	'referrer-policy': 'strict-origin-when-cross-origin',
	'permissions-policy': 'camera=(), microphone=(self), geolocation=(), payment=(), usb=()',
	'content-security-policy':
		"default-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
};

export const handle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	// Page responses carry their own CSP from kit.csp; only fill in what's missing.
	for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
		if (!response.headers.has(name)) response.headers.set(name, value);
	}
	return response;
};
