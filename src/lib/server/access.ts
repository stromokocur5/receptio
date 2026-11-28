/**
 * Verifies the Cloudflare Access token in front of /admin. Access already blocks everyone else
 * at the edge; this check makes sure the page can't be reached around it (workers.dev,
 * preview URLs) and that the signed-in e-mail is an admin.
 */

interface Jwk {
	kid: string;
	kty: string;
	n: string;
	e: string;
	alg?: string;
}

interface AccessConfig {
	/** e.g. "stromokocur5.cloudflareaccess.com" */
	teamDomain: string;
	/** Application Audience (AUD) tag of the Access application. */
	aud: string;
	/** Comma-separated, case-insensitive. */
	adminEmails: string;
}

const CERTS_TTL_MS = 60 * 60 * 1000;
let certs: { keys: Map<string, CryptoKey>; fetchedAt: number; team: string } | null = null;

function base64UrlDecode(input: string): Uint8Array<ArrayBuffer> {
	const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
	const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
	return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function decodeJson<T>(part: string): T {
	return JSON.parse(new TextDecoder().decode(base64UrlDecode(part))) as T;
}

async function signingKeys(
	teamDomain: string,
	fetcher: typeof fetch
): Promise<Map<string, CryptoKey>> {
	if (certs && certs.team === teamDomain && Date.now() - certs.fetchedAt < CERTS_TTL_MS) {
		return certs.keys;
	}
	const res = await fetcher(`https://${teamDomain}/cdn-cgi/access/certs`);
	if (!res.ok) throw new Error(`access certs: ${res.status}`);
	const body = (await res.json()) as { keys: Jwk[] };
	const keys = new Map<string, CryptoKey>();
	for (const jwk of body.keys) {
		if (jwk.kty !== 'RSA') continue;
		keys.set(
			jwk.kid,
			await crypto.subtle.importKey(
				'jwk',
				{ kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
				{ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
				false,
				['verify']
			)
		);
	}
	certs = { keys, fetchedAt: Date.now(), team: teamDomain };
	return keys;
}

/** The admin's e-mail when the request carries a valid Access token for an admin, else null. */
export async function adminEmail(
	request: Request,
	config: AccessConfig,
	fetcher: typeof fetch = fetch,
	now = Date.now()
): Promise<string | null> {
	const token =
		request.headers.get('cf-access-jwt-assertion') ??
		/(?:^|;\s*)CF_Authorization=([^;]+)/.exec(request.headers.get('cookie') ?? '')?.[1];
	if (!token || !config.teamDomain || !config.aud) return null;

	const parts = token.split('.');
	if (parts.length !== 3) return null;
	try {
		const header = decodeJson<{ alg: string; kid: string }>(parts[0]);
		const payload = decodeJson<{
			aud: string | string[];
			exp: number;
			iss: string;
			email?: string;
		}>(parts[1]);
		if (header.alg !== 'RS256') return null;
		const key = (await signingKeys(config.teamDomain, fetcher)).get(header.kid);
		if (!key) return null;
		const valid = await crypto.subtle.verify(
			'RSASSA-PKCS1-v1_5',
			key,
			base64UrlDecode(parts[2]),
			new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
		);
		if (!valid) return null;

		const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
		if (!audiences.includes(config.aud)) return null;
		if (payload.iss !== `https://${config.teamDomain}`) return null;
		if (!payload.exp || payload.exp * 1000 < now) return null;

		const email = payload.email?.toLowerCase();
		const allowed = config.adminEmails
			.split(',')
			.map((e) => e.trim().toLowerCase())
			.filter(Boolean);
		return email && allowed.includes(email) ? email : null;
	} catch {
		return null;
	}
}
