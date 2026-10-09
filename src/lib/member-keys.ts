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

export interface Signer {
	/** Raw public key, base64url – what goes into `Member.owner`. */
	pub: string;
	/** The private key, kept only on this phone. */
	jwk: JsonWebKey;
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

export async function newSigner(): Promise<Signer> {
	const pair = await crypto.subtle.generateKey(ALGORITHM, true, ['sign', 'verify']);
	const raw = await crypto.subtle.exportKey('raw', pair.publicKey);
	return { pub: toBase64Url(raw), jwk: await crypto.subtle.exportKey('jwk', pair.privateKey) };
}

export async function signMember(member: Member, signer: Signer): Promise<Member> {
	const owned = { ...member, owner: signer.pub };
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
