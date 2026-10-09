/**
 * The recovery code and what it unlocks: from the code alone the browser derives the record id,
 * a write token and an AES key (HKDF), and encrypts with AES-GCM. Plain functions, so the
 * service worker can read a household's news too.
 */

/** Crockford base32: no I, L, O, U, so the code survives being read aloud or written by hand. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
/** 20 characters × 5 bits = 100 bits, far beyond guessing. */
export const CODE_LENGTH = 20;

const encoder = new TextEncoder();

export function formatCode(code: string): string {
	return code.match(/.{1,4}/g)!.join('-');
}

export function generateCode(random = crypto.getRandomValues(new Uint8Array(CODE_LENGTH))): string {
	// 256 is a multiple of 32, so taking each byte modulo 32 stays uniform.
	return [...random].map((b) => ALPHABET[b % 32]).join('');
}

/** Accepts the code with or without dashes, in any case, with O/I/L typed for 0/1. */
export function normalizeCode(input: string): string | null {
	const code = input
		.toUpperCase()
		.replace(/[^0-9A-Z]/g, '')
		.replace(/O/g, '0')
		.replace(/[IL]/g, '1');
	if (code.length !== CODE_LENGTH || [...code].some((c) => !ALPHABET.includes(c))) return null;
	return code;
}

function hex(bytes: Uint8Array): string {
	return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function toBase64(bytes: Uint8Array): string {
	let binary = '';
	for (let i = 0; i < bytes.length; i += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	return btoa(binary);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
	return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

export interface SyncKeys {
	id: string;
	token: string;
	key: CryptoKey;
}

export async function deriveKeys(code: string): Promise<SyncKeys> {
	const base = await crypto.subtle.importKey('raw', encoder.encode(code), 'HKDF', false, [
		'deriveBits',
		'deriveKey'
	]);
	const params = (info: string): HkdfParams => ({
		name: 'HKDF',
		hash: 'SHA-256',
		salt: encoder.encode('receptio-sync-v1'),
		info: encoder.encode(info)
	});
	const bits = async (info: string) =>
		hex(new Uint8Array(await crypto.subtle.deriveBits(params(info), base, 256)));
	return {
		id: await bits('id'),
		token: await bits('write'),
		key: await crypto.subtle.deriveKey(
			params('data'),
			base,
			{ name: 'AES-GCM', length: 256 },
			false,
			['encrypt', 'decrypt']
		)
	};
}

export async function encrypt(key: CryptoKey, text: string): Promise<string> {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(text));
	return `${toBase64(iv)}.${toBase64(new Uint8Array(cipher))}`;
}

export async function decrypt(key: CryptoKey, payload: string): Promise<string> {
	const [iv, cipher] = payload.split('.');
	const plain = await crypto.subtle.decrypt(
		{ name: 'AES-GCM', iv: fromBase64(iv) },
		key,
		fromBase64(cipher)
	);
	return new TextDecoder().decode(plain);
}
