import { describe, expect, it } from 'vitest';
import {
	EMPTY_BODY,
	STALE_OWNER_MS,
	acceptMember,
	newDoc,
	validateDoc,
	type Member
} from './household';
import { canonical, newSigner, signMember, verifyMember } from './member-keys';

const kid: Member = {
	id: 'ema',
	name: 'Ema',
	allergens: [],
	avoid: [],
	mild: false,
	glutenFree: false,
	meals: { ranajky: true, obed: true, vecera: true },
	portion: null,
	body: EMPTY_BODY,
	away: null,
	removed: false,
	at: 1
};

describe('owned profiles', () => {
	it('writes the same JSON whatever the key order', () => {
		expect(canonical({ b: 1, a: [{ d: 2, c: 3 }], e: undefined })).toBe(
			'{"a":[{"c":3,"d":2}],"b":1}'
		);
	});

	it('verifies the owner’s signature and nothing else', async () => {
		const owner = await newSigner();
		const signed = await signMember(kid, owner);
		expect(await verifyMember(signed)).toBe(true);
		// Survives the trip through storage and validation.
		const doc = validateDoc(
			JSON.parse(JSON.stringify({ ...newDoc('x', 1), members: { ema: signed } }))
		);
		expect(await verifyMember(doc!.members.ema)).toBe(true);
		expect(await verifyMember({ ...signed, mild: true })).toBe(false);
		const other = await newSigner();
		expect(await verifyMember({ ...signed, owner: other.pub })).toBe(false);
	});

	it('lets only the owner change an owned profile', async () => {
		const owner = await newSigner();
		const mine = await signMember(kid, owner);
		const edited = { ...mine, mild: true, at: 2 };
		const now = 10;
		expect(acceptMember(mine, await signMember(edited, owner), true, now)).toBe(true);
		expect(acceptMember(mine, edited, false, now)).toBe(false);
		// Someone else signing it as theirs is a takeover, not an edit.
		const thief = await newSigner();
		expect(acceptMember(mine, await signMember(edited, thief), true, now)).toBe(false);
		// A profile nobody owns: anyone edits it, and one phone can claim it.
		expect(acceptMember(kid, { ...kid, mild: true, at: 2 }, false, now)).toBe(true);
		expect(acceptMember(kid, { ...kid, owner: owner.pub, at: 2 }, false, now)).toBe(false);
	});

	it('lets the others remove a profile whose phone has been gone for long', async () => {
		const owner = await newSigner();
		const mine = await signMember(kid, owner);
		const removed = { ...mine, removed: true, at: 5 };
		expect(acceptMember(mine, removed, false, 1 + STALE_OWNER_MS / 2)).toBe(false);
		expect(acceptMember(mine, removed, false, 2 + STALE_OWNER_MS)).toBe(true);
		expect(acceptMember(mine, { ...removed, name: 'Iná' }, false, 2 + STALE_OWNER_MS)).toBe(false);
	});
});
