import { describe, expect, it } from 'vitest';
import { TEST_SECRET, verifyTurnstile } from './turnstile';

const reply = (body: unknown, ok = true) =>
	(async () =>
		new Response(JSON.stringify(body), { status: ok ? 200 : 500 })) as unknown as typeof fetch;

const base = {
	secret: 'real-secret',
	hostnames: 'receptio.kohut.xyz, receptio.gabrielkohut3.workers.dev',
	action: 'suggest',
	token: 'tok'
};

describe('verifyTurnstile', () => {
	it('accepts a successful token for our action and hostname', async () => {
		expect(
			await verifyTurnstile(
				base,
				reply({ success: true, action: 'suggest', hostname: 'receptio.kohut.xyz' })
			)
		).toBe(true);
	});

	it('rejects failed, foreign-action, foreign-host and errored verifications', async () => {
		expect(await verifyTurnstile(base, reply({ success: false }))).toBe(false);
		expect(
			await verifyTurnstile(
				base,
				reply({ success: true, action: 'feedback', hostname: 'receptio.kohut.xyz' })
			)
		).toBe(false);
		expect(
			await verifyTurnstile(
				base,
				reply({ success: true, action: 'suggest', hostname: 'evil.example' })
			)
		).toBe(false);
		expect(await verifyTurnstile(base, reply({}, false))).toBe(false);
		const broken = (async () => {
			throw new Error('network');
		}) as unknown as typeof fetch;
		expect(await verifyTurnstile(base, broken)).toBe(false);
	});

	it('rejects missing tokens and unconfigured deployments without calling Cloudflare', async () => {
		const never = (async () => {
			throw new Error('should not be called');
		}) as unknown as typeof fetch;
		expect(await verifyTurnstile({ ...base, token: undefined }, never)).toBe(false);
		expect(await verifyTurnstile({ ...base, token: 'x'.repeat(3000) }, never)).toBe(false);
		expect(await verifyTurnstile({ ...base, secret: undefined }, never)).toBe(false);
		expect(await verifyTurnstile({ ...base, hostnames: '' }, never)).toBe(false);
	});

	it('trusts the documented test secret locally', async () => {
		expect(
			await verifyTurnstile(
				{ ...base, secret: TEST_SECRET, hostnames: '' },
				reply({ success: true })
			)
		).toBe(true);
	});
});
