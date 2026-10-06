import { describe, expect, it } from 'vitest';
import { probe } from './health';

describe('probe', () => {
	it('passes when the API answers, even with a client error', async () => {
		expect(await probe(async () => new Response('{}', { status: 200 }))).toBeNull();
		expect(await probe(async () => new Response('', { status: 404 }))).toBeNull();
	});

	it('names the path and status of a server error or a crash', async () => {
		expect(await probe(async () => new Response('', { status: 503 }))).toBe('/api/likes: 503');
		expect(
			await probe(async () => {
				throw new Error('error code: 1102');
			})
		).toBe('/api/likes: error code: 1102');
	});
});
