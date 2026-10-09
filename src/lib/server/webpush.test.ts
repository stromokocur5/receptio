import { describe, expect, it } from 'vitest';
import { encryptPayload } from './webpush';

const b64url = (bytes: Uint8Array) =>
	btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');

/** What a browser does with the body (RFC 8291), to check the server's side round-trips. */
async function decryptAsBrowser(
	body: Uint8Array,
	browser: CryptoKeyPair,
	browserPub: Uint8Array,
	auth: Uint8Array
) {
	const salt = body.slice(0, 16) as Uint8Array<ArrayBuffer>;
	const idlen = body[20];
	const serverPub = body.slice(21, 21 + idlen) as Uint8Array<ArrayBuffer>;
	const cipher = body.slice(21 + idlen) as Uint8Array<ArrayBuffer>;
	const serverKey = await crypto.subtle.importKey(
		'raw',
		serverPub,
		{ name: 'ECDH', namedCurve: 'P-256' },
		false,
		[]
	);
	const shared = new Uint8Array(
		await crypto.subtle.deriveBits({ name: 'ECDH', public: serverKey }, browser.privateKey, 256)
	);
	const hkdf = async (s: Uint8Array, ikm: Uint8Array, info: Uint8Array, n: number) =>
		new Uint8Array(
			await crypto.subtle.deriveBits(
				{ name: 'HKDF', hash: 'SHA-256', salt: s as BufferSource, info: info as BufferSource },
				await crypto.subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, ['deriveBits']),
				n * 8
			)
		);
	const enc = new TextEncoder();
	const info = new Uint8Array([...enc.encode('WebPush: info'), 0, ...browserPub, ...serverPub]);
	const ikm = await hkdf(auth, shared, info, 32);
	const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
	const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
	const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
	const plain = new Uint8Array(
		await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, cipher)
	);
	expect(plain[plain.length - 1]).toBe(2);
	return new TextDecoder().decode(plain.slice(0, -1));
}

describe('web push payload', () => {
	it('can be opened only with the browser’s keys', async () => {
		const browser = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
			'deriveBits'
		])) as CryptoKeyPair;
		const browserPub = new Uint8Array(
			(await crypto.subtle.exportKey('raw', browser.publicKey)) as ArrayBuffer
		);
		const auth = crypto.getRandomValues(new Uint8Array(16));
		const body = await encryptPayload(
			{ endpoint: 'https://push.example/x', p256dh: b64url(browserPub), auth: b64url(auth) },
			'{"t":"household"}'
		);
		expect(new DataView(body.buffer).getUint32(16)).toBe(4096);
		expect(await decryptAsBrowser(body, browser, browserPub, auth)).toBe('{"t":"household"}');
	});
});
