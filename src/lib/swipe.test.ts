import { describe, expect, it } from 'vitest';
import type { Member } from './household';
import { almost, matches, swipeDeck } from './swipe';

const m = (id: string) => ({ id, name: id }) as Member;
const ema = m('ema');
const jano = m('jano');
const ivo = m('ivo');
const recipes = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));

describe('swiping recipes together', () => {
	it('shows first what the others want, and nothing already decided', () => {
		const wishes = new Map([
			['c', [jano]],
			['d', [jano, ivo]],
			['e', [ema]]
		]);
		const deck = swipeDeck(recipes, wishes, 'ema', { a: 'no' }, new Set(['b']), '2026-10-09');
		expect(deck.map((r) => r.id)).toEqual(['d', 'c']);
	});

	it('the order of the rest changes by day but not within it', () => {
		const ids = (day: string) =>
			swipeDeck(recipes, new Map(), 'ema', {}, new Set(), day).map((r) => r.id);
		expect(ids('2026-10-09')).toEqual(ids('2026-10-09'));
		expect(new Set(ids('2026-10-10'))).toEqual(new Set(['a', 'b', 'c', 'd', 'e']));
	});

	it('a match is everyone; almost is all but one', () => {
		const wishes = new Map([
			['a', [ema, jano]],
			['b', [ema, jano, ivo]],
			['c', [ema]]
		]);
		expect(matches(wishes, [ema, jano])).toEqual(['a', 'b']);
		expect(matches(wishes, [ema, jano, ivo])).toEqual(['b']);
		expect(matches(wishes, [ema])).toEqual([]);
		expect(almost(wishes, [ema, jano, ivo])).toEqual([{ id: 'a', missing: ivo }]);
	});
});
