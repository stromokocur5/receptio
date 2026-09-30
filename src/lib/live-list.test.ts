import { describe, expect, it } from 'vitest';
import { hasNewer, mergeTicks, parseLiveData } from './live-list.svelte';

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
		expect(hasNewer({ cicer: [true, 20] }, { cicer: [true, 20] })).toBe(false);
		expect(hasNewer({ cicer: [true, 21] }, { cicer: [true, 20] })).toBe(true);
		expect(hasNewer({ tofu: [false, 1] }, {})).toBe(true);
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
		expect(parsed).toEqual({ list: 'abc', ticks: { cicer: [true, 1] } });
	});
});
