import { describe, expect, it } from 'vitest';
import { hasNewer, mergeLive, mergeTicks, parseLiveData, type Ticks } from './live-list.svelte';

const data = (ticks: Ticks, listAt = 0, list = 'l') => ({ list, listAt, ticks });

describe('live shopping list', () => {
	it('keeps the newer tick from either side', () => {
		const mine = { cicer: [true, 20] as [boolean, number], ryza: [true, 5] as [boolean, number] };
		const theirs = { ryza: [false, 10] as [boolean, number], tofu: [true, 3] as [boolean, number] };
		expect(mergeTicks(theirs, mine)).toEqual({
			cicer: [true, 20],
			ryza: [false, 10],
			tofu: [true, 3]
		});
	});

	it('knows when the server is missing a local tick', () => {
		expect(hasNewer(data({ cicer: [true, 20] }), data({ cicer: [true, 20] }))).toBe(false);
		expect(hasNewer(data({ cicer: [true, 21] }), data({ cicer: [true, 20] }))).toBe(true);
		expect(hasNewer(data({ tofu: [false, 1] }), data({}))).toBe(true);
		expect(hasNewer(data({}, 5), data({}, 2))).toBe(true);
	});

	it('takes the newer list and every newest tick', () => {
		expect(mergeLive(data({ a: [true, 1] }, 9, 'new'), data({ b: [true, 2] }, 3, 'old'))).toEqual(
			data({ a: [true, 1], b: [true, 2] }, 9, 'new')
		);
	});

	it('drops malformed data from the server', () => {
		expect(parseLiveData('nope')).toBeNull();
		expect(parseLiveData(JSON.stringify({ list: 5 }))).toBeNull();
		const parsed = parseLiveData(
			JSON.stringify({
				list: 'abc',
				ticks: { cicer: [true, 1], 'Bad Id': [true, 1], tofu: ['yes', 1], ryza: [false, 'x'] }
			})
		);
		expect(parsed).toEqual({ list: 'abc', listAt: 0, ticks: { cicer: [true, 1] } });
	});
});
