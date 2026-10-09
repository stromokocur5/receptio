/**
 * Signed household profiles. Everyone in a household holds the same encryption key, so the
 * encryption alone can't tell who changed a profile. A person's own profile carries the public
 * key of their phone (`owner`) and a signature over everything else; the other phones only take a
 * newer copy of it when the signature checks out with that key. Profiles without an owner (a child
 * without a phone) anyone can change.
 */

import type { Member } from './household';

const ALGORITHM = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const SIGNING = { name: 'ECDSA', hash: 'SHA-256' } as const;
const EXCHANGE = { name: 'ECDH', namedCurve: 'P-256' } as const;

export interface KeyPair {
	/** Raw public key, base64url. */
	pub: string;
	/** The private key, kept only on this phone. */
	jwk: JsonWebKey;
}

export interface Signer extends KeyPair {
	/** For things only this phone may read (a changed household link) – `Member.inbox`. */
	inbox?: KeyPair;
}

const toBase64Url = (bytes: ArrayBuffer) =>
	btoa(String.fromCharCode(...new Uint8Array(bytes)))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
	const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
	return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** JSON with sorted keys, so the same profile always gives the same bytes. */
export function canonical(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
	if (value && typeof value === 'object') {
		const entries = Object.entries(value)
			.filter(([, v]) => v !== undefined)
			.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
		return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
	}
	return JSON.stringify(value);
}

/** Everything but the signature itself. */
const signedBytes = (m: Member) => {
	const { sig: _sig, ...rest } = m;
	return new TextEncoder().encode(canonical(rest));
};

async function newPair(algorithm: EcKeyGenParams, usages: KeyUsage[]): Promise<KeyPair> {
	const pair = await crypto.subtle.generateKey(algorithm, true, usages);
	const raw = await crypto.subtle.exportKey('raw', pair.publicKey);
	return { pub: toBase64Url(raw), jwk: await crypto.subtle.exportKey('jwk', pair.privateKey) };
}

export const newInbox = () => newPair(EXCHANGE, ['deriveBits']);

export async function newSigner(): Promise<Signer> {
	return { ...(await newPair(ALGORITHM, ['sign', 'verify'])), inbox: await newInbox() };
}

export async function signMember(member: Member, signer: Signer): Promise<Member> {
	const owned = { ...member, owner: signer.pub, ...(signer.inbox && { inbox: signer.inbox.pub }) };
	const key = await crypto.subtle.importKey('jwk', signer.jwk, ALGORITHM, false, ['sign']);
	const sig = await crypto.subtle.sign(SIGNING, key, signedBytes(owned));
	return { ...owned, sig: toBase64Url(sig) };
}

/** True when the profile is signed by the key it names as its owner. */
export async function verifyMember(member: Member): Promise<boolean> {
	if (!member.owner || !member.sig) return false;
	try {
		const key = await crypto.subtle.importKey(
			'raw',
			fromBase64Url(member.owner),
			ALGORITHM,
			false,
			['verify']
		);
		return await crypto.subtle.verify(SIGNING, key, fromBase64Url(member.sig), signedBytes(member));
	} catch {
		return false;
	}
}

/** Code sealed for chosen phones: only the holder of an inbox key can open its box. */
export interface Sealed {
	/** One-time public key the boxes were sealed with. */
	from: string;
	/** Member id → base64url(iv).base64url(ciphertext). */
	boxes: Record<string, string>;
}

/** AES key shared by the one-time key and an inbox: ECDH, then HKDF over the secret. */
async function boxKey(privateJwk: JsonWebKey, publicRaw: string, usage: KeyUsage) {
	const priv = await crypto.subtle.importKey('jwk', privateJwk, EXCHANGE, false, ['deriveBits']);
	const pub = await crypto.subtle.importKey('raw', fromBase64Url(publicRaw), EXCHANGE, false, []);
	const secret = await crypto.subtle.deriveBits({ name: 'ECDH', public: pub }, priv, 256);
	const hkdf = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey']);
	return crypto.subtle.deriveKey(
		{
			name: 'HKDF',
			hash: 'SHA-256',
			salt: new TextEncoder().encode('receptio-inbox-v1'),
			info: new Uint8Array()
		},
		hkdf,
		{ name: 'AES-GCM', length: 256 },
		false,
		[usage]
	);
}

/** Seals `text` for each recipient (member id → inbox public key). */
export async function seal(text: string, recipients: Record<string, string>): Promise<Sealed> {
	const once = await newInbox();
	const boxes: Record<string, string> = {};
	for (const [id, inbox] of Object.entries(recipients)) {
		const key = await boxKey(once.jwk, inbox, 'encrypt');
		const iv = crypto.getRandomValues(new Uint8Array(12));
		const cipher = await crypto.subtle.encrypt(
			{ name: 'AES-GCM', iv },
			key,
			new TextEncoder().encode(text)
		);
		boxes[id] = `${toBase64Url(iv.buffer)}.${toBase64Url(cipher)}`;
	}
	return { from: once.pub, boxes };
}

/** The text in `id`'s box, or null when there's none or this inbox can't open it. */
export async function openSealed(
	sealed: Sealed,
	id: string,
	inbox: KeyPair
): Promise<string | null> {
	const box = sealed.boxes[id];
	if (!box) return null;
	try {
		const [iv, cipher] = box.split('.');
		const key = await boxKey(inbox.jwk, sealed.from, 'decrypt');
		const plain = await crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv: fromBase64Url(iv) },
			key,
			fromBase64Url(cipher)
		);
		return new TextDecoder().decode(plain);
	} catch {
		return null;
	}
}
