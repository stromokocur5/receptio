import { vapidAuthorization } from './push';

/**
 * Web Push with a payload (RFC 8291, aes128gcm): the push service relays it without being able
 * to read it, and only the browser that subscribed can open it. The reminders send none (the
 * service worker knows what's due); household news says it's the household, so the service
 * worker can tell it apart from a reminder.
 */

export interface PushTarget {
	endpoint: string;
	/** The browser's ECDH public key (`keys.p256dh`), base64url. */
	p256dh: string;
	/** The browser's auth secret (`keys.auth`), base64url. */
	auth: string;
}

const fromB64url = (text: string): Uint8Array<ArrayBuffer> => {
	const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
	return Uint8Array.from(atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4)), (c) =>
		c.charCodeAt(0)
	);
};

const concat = (...parts: Uint8Array[]) => {
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let at = 0;
	for (const p of parts) {
		out.set(p, at);
		at += p.length;
	}
	return out;
};

const utf8 = (text: string) => new TextEncoder().encode(text);

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number) {
	const key = await crypto.subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, [
		'deriveBits'
	]);
	return new Uint8Array(
		await crypto.subtle.deriveBits(
			{ name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: info as BufferSource },
			key,
			bytes * 8
		)
	);
}

/** The encrypted body for one browser (a single aes128gcm record). */
export async function encryptPayload(target: PushTarget, payload: string): Promise<Uint8Array> {
	const browserKey = fromB64url(target.p256dh);
	const auth = fromB64url(target.auth);
	const own = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
		'deriveBits'
	])) as CryptoKeyPair;
	const ownPublic = new Uint8Array(
		(await crypto.subtle.exportKey('raw', own.publicKey)) as ArrayBuffer
	);
	const browserPublic = await crypto.subtle.importKey(
		'raw',
		browserKey,
		{ name: 'ECDH', namedCurve: 'P-256' },
		false,
		[]
	);
	const shared = new Uint8Array(
		await crypto.subtle.deriveBits({ name: 'ECDH', public: browserPublic }, own.privateKey, 256)
	);
	const ikm = await hkdf(
		auth,
		shared,
		concat(utf8('WebPush: info'), new Uint8Array([0]), browserKey, ownPublic),
		32
	);
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const cek = await hkdf(salt, ikm, utf8('Content-Encoding: aes128gcm\0'), 16);
	const nonce = await hkdf(salt, ikm, utf8('Content-Encoding: nonce\0'), 12);
	const key = await crypto.subtle.importKey('raw', cek as BufferSource, 'AES-GCM', false, [
		'encrypt'
	]);
	// The last (and only) record ends with the 0x02 delimiter.
	const plain = concat(utf8(payload), new Uint8Array([2]));
	const cipher = new Uint8Array(
		await crypto.subtle.encrypt(
			{ name: 'AES-GCM', iv: nonce as BufferSource },
			key,
			plain as BufferSource
		)
	);
	const header = new Uint8Array(16 + 4 + 1 + ownPublic.length);
	header.set(salt, 0);
	new DataView(header.buffer).setUint32(16, 4096);
	header[20] = ownPublic.length;
	header.set(ownPublic, 21);
	return concat(header, cipher);
}

/** Sends `payload` to one browser; the push service's status (404/410: gone for good). */
export async function sendPayload(
	target: PushTarget,
	payload: string,
	privateJwk: JsonWebKey,
	now = Date.now()
): Promise<number> {
	try {
		const body = await encryptPayload(target, payload);
		const res = await fetch(target.endpoint, {
			method: 'POST',
			headers: {
				authorization: await vapidAuthorization(target.endpoint, privateJwk, now),
				'content-encoding': 'aes128gcm',
				'content-type': 'application/octet-stream',
				// News a day old is still worth a look; older isn't.
				ttl: String(24 * 3600),
				urgency: 'normal'
			},
			body: body as BufferSource
		});
		return res.status;
	} catch (err) {
		console.error('push: payload send failed', err);
		return 0;
	}
}
