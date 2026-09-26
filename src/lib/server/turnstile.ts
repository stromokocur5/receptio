/** Cloudflare's documented always-pass test secret (local dev only); its results carry no real hostname/action. */
export const TEST_SECRET = '1x0000000000000000000000000000000AA';
const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export interface TurnstileCheck {
	secret: string | undefined;
	/** Comma-separated frontend hostnames this deployment serves. */
	hostnames: string | undefined;
	action: string;
	token: unknown;
	remoteip?: string;
}

/**
 * Server-side Siteverify. True only for a fresh token that Cloudflare accepts, issued for this
 * form's action on one of our hostnames. Anything unexpected fails closed.
 */
export async function verifyTurnstile(
	check: TurnstileCheck,
	fetcher: typeof fetch = fetch
): Promise<boolean> {
	const { secret, token, action, remoteip } = check;
	const hostnames = new Set(
		(check.hostnames ?? '')
			.split(',')
			.map((h) => h.trim())
			.filter(Boolean)
	);
	if (!secret || typeof token !== 'string' || token.length === 0 || token.length > 2048)
		return false;
	const isTest = secret === TEST_SECRET;
	if (!isTest && hostnames.size === 0) return false;

	let result: { success?: boolean; action?: string; hostname?: string };
	try {
		const body = new URLSearchParams({ secret, response: token });
		if (remoteip) body.set('remoteip', remoteip);
		const res = await fetcher(SITEVERIFY, {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body,
			signal: AbortSignal.timeout(10_000)
		});
		if (!res.ok) return false;
		result = await res.json();
	} catch {
		return false;
	}
	if (result.success !== true) return false;
	if (isTest) return true;
	return result.action === action && hostnames.has(result.hostname ?? '');
}
