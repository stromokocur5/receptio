import { beforeAll, describe, expect, it } from 'vitest';
import { adminEmail } from './access';

const TEAM = 'tim.cloudflareaccess.com';
const AUD = 'aud-123';
const config = { teamDomain: TEAM, aud: AUD, adminEmails: 'Ja@Example.com, druhy@example.com' };

let keys: CryptoKeyPair;
let fetcher: typeof fetch;

const b64url = (data: Uint8Array | string) =>
	btoa(typeof data === 'string' ? data : String.fromCharCode(...data))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');

async function token(payload: Record<string, unknown>, kid = 'k1', key = keys.privateKey) {
	const head = b64url(JSON.stringify({ alg: 'RS256', kid }));
	const body = b64url(JSON.stringify(payload));
	const sig = await crypto.subtle.sign(
		'RSASSA-PKCS1-v1_5',
		key,
		new TextEncoder().encode(`${head}.${body}`)
	);
	return `${head}.${body}.${b64url(new Uint8Array(sig))}`;
}

const request = (jwt: string) =>
	new Request('https://receptio.test/admin', { headers: { 'cf-access-jwt-assertion': jwt } });

const valid = () => ({
	aud: [AUD],
	iss: `https://${TEAM}`,
	exp: Math.floor(Date.now() / 1000) + 600,
	email: 'ja@example.com'
});

beforeAll(async () => {
	const algo = {
		name: 'RSASSA-PKCS1-v1_5',
		modulusLength: 2048,
		publicExponent: new Uint8Array([1, 0, 1]),
		hash: 'SHA-256'
	};
	keys = (await crypto.subtle.generateKey(algo, true, ['sign', 'verify'])) as CryptoKeyPair;
	const jwk = await crypto.subtle.exportKey('jwk', keys.publicKey);
	fetcher = (async () =>
		new Response(JSON.stringify({ keys: [{ ...jwk, kid: 'k1' }] }))) as unknown as typeof fetch;
});

describe('adminEmail', () => {
	it('accepts a valid token for an admin, case-insensitively', async () => {
		expect(await adminEmail(request(await token(valid())), config, fetcher)).toBe('ja@example.com');
	});

	it('rejects other e-mails, other apps, expired tokens and bad signatures', async () => {
		expect(
			await adminEmail(
				request(await token({ ...valid(), email: 'cudzi@example.com' })),
				config,
				fetcher
			)
		).toBeNull();
		expect(
			await adminEmail(request(await token({ ...valid(), aud: ['ina'] })), config, fetcher)
		).toBeNull();
		expect(
			await adminEmail(request(await token({ ...valid(), exp: 1 })), config, fetcher)
		).toBeNull();
		expect(
			await adminEmail(
				request(await token({ ...valid(), iss: 'https://ina.cloudflareaccess.com' })),
				config,
				fetcher
			)
		).toBeNull();

		const other = (await crypto.subtle.generateKey(
			{
				name: 'RSASSA-PKCS1-v1_5',
				modulusLength: 2048,
				publicExponent: new Uint8Array([1, 0, 1]),
				hash: 'SHA-256'
			},
			true,
			['sign', 'verify']
		)) as CryptoKeyPair;
		expect(
			await adminEmail(request(await token(valid(), 'k1', other.privateKey)), config, fetcher)
		).toBeNull();
	});

	it('rejects requests without a token or config', async () => {
		expect(
			await adminEmail(new Request('https://receptio.test/admin'), config, fetcher)
		).toBeNull();
		expect(
			await adminEmail(request(await token(valid())), { ...config, aud: '' }, fetcher)
		).toBeNull();
	});
});
