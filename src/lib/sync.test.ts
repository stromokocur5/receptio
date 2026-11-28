import { describe, expect, it } from 'vitest';
import {
	CODE_LENGTH,
	decrypt,
	deriveKeys,
	encrypt,
	formatCode,
	generateCode,
	normalizeCode
} from './sync.svelte';

describe('recovery code', () => {
	it('is 20 unambiguous characters, shown in groups of four', () => {
		const code = generateCode();
		expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{20}$/);
		expect(formatCode(code)).toMatch(/^(\w{4}-){4}\w{4}$/);
		expect(generateCode(new Uint8Array(CODE_LENGTH).fill(33))).toBe('1'.repeat(20));
	});

	it('forgives dashes, case and O/I/L typos, rejects short codes', () => {
		expect(normalizeCode('7k3m-qx9a-oil0-aaaa-bbbb')).toBe('7K3MQX9A0110AAAABBBB');
		expect(normalizeCode('7K3M-QX9A')).toBeNull();
		expect(normalizeCode('UUUU-UUUU-UUUU-UUUU-UUUU')).toBeNull();
	});
});

describe('encryption', () => {
	it('derives the same id and token from the same code and different ones otherwise', async () => {
		const a = await deriveKeys('7K3MQX9A0110AAAABBBB');
		const b = await deriveKeys('7K3MQX9A0110AAAABBBB');
		const c = await deriveKeys('7K3MQX9A0110AAAABBBC');
		expect(a.id).toBe(b.id);
		expect(a.id).toMatch(/^[0-9a-f]{64}$/);
		expect(a.token).not.toBe(a.id);
		expect(c.id).not.toBe(a.id);
	});

	it('round-trips data and fails with the wrong code', async () => {
		const { key } = await deriveKeys('7K3MQX9A0110AAAABBBB');
		const other = (await deriveKeys('7K3MQX9A0110AAAABBBC')).key;
		const payload = await encrypt(key, '{"pantry":{"tofu":400},"note":"čučoriedky"}');
		expect(payload).not.toContain('tofu');
		expect(await decrypt(key, payload)).toBe('{"pantry":{"tofu":400},"note":"čučoriedky"}');
		await expect(decrypt(other, payload)).rejects.toThrow();
	});
});
