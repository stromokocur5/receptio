import { describe, expect, it } from 'vitest';
import {
	bestBefore,
	jarsFromYield,
	preserveAge,
	sortPreserves,
	validatePreserves,
	type Preserve
} from './preserves';

describe('preserves', () => {
	it('knows how long each kind keeps', () => {
		expect(bestBefore({ name: 'Marhuľový lekvár', made: '2025-07-10', place: 'pivnica' })).toBe(
			'2027-07-10'
		);
		expect(bestBefore({ name: 'Lečo', made: '2025-08-31', place: 'pivnica' })).toBe('2026-08-31');
		expect(bestBefore({ name: 'Fazuľky', made: '2025-12-31', place: 'mraznicka' })).toBe(
			'2026-10-31'
		);
		expect(bestBefore({ name: 'Chlieb', made: '2026-01-31', place: 'mraznicka' })).toBe(
			'2026-04-30'
		);
		// The recipe's own freezer time beats the guess from the name.
		expect(
			bestBefore(
				{ name: 'Dal makhani', made: '2026-09-01', place: 'mraznicka' },
				{
					fridge: 4,
					freezer: 3
				}
			)
		).toBe('2026-12-01');
		expect(
			bestBefore(
				{ name: 'Dal', made: '2026-05-01', place: 'chladnicka', thawed: '2026-10-08' },
				{
					fridge: 4,
					freezer: 3
				}
			)
		).toBe('2026-10-10');
		// Cooked and not eaten: days in the fridge, as the recipe says or 3.
		expect(
			bestBefore(
				{ name: 'Kari s tofu', made: '2026-10-10', place: 'chladnicka', leftover: true },
				{ fridge: 4, freezer: 3 }
			)
		).toBe('2026-10-14');
		expect(
			bestBefore({ name: 'Kari s tofu', made: '2026-10-10', place: 'chladnicka', leftover: true })
		).toBe('2026-10-13');
	});

	it('flags jars and bags as they get old', () => {
		expect(preserveAge({ name: 'Lečo', made: '2026-09-01', place: 'pivnica' }, '2026-12-01')).toBe(
			'fresh'
		);
		expect(preserveAge({ name: 'Lečo', made: '2025-11-01', place: 'pivnica' }, '2026-09-28')).toBe(
			'soon'
		);
		expect(preserveAge({ name: 'Lečo', made: '2025-09-01', place: 'pivnica' }, '2026-09-28')).toBe(
			'old'
		);
		expect(
			preserveAge({ name: 'Lekvár', made: '2025-09-01', place: 'pivnica' }, '2026-09-28')
		).toBe('fresh');
		expect(
			preserveAge({ name: 'Fazuľky', made: '2025-11-01', place: 'mraznicka' }, '2026-09-28')
		).toBe('old');
		expect(
			preserveAge(
				{ name: 'Dal', made: '2026-05-01', place: 'chladnicka', thawed: '2026-09-27' },
				'2026-09-28'
			)
		).toBe('soon');
	});

	it('puts what to eat first on top of each place', () => {
		const list: Preserve[] = [
			{ id: 'a', name: 'Lečo', count: 3, made: '2026-08-20', place: 'pivnica' },
			{ id: 'b', name: 'Fazuľky', count: 2, made: '2026-07-01', place: 'mraznicka' },
			{ id: 'c', name: 'Lekvár', count: 4, made: '2025-09-10', place: 'pivnica' }
		];
		// The jam is older but keeps two years, the lečo only one.
		expect(sortPreserves(list).map((p) => p.id)).toEqual(['a', 'c', 'b']);
	});

	it('reads the number of jars a recipe makes', () => {
		expect(jarsFromYield('cca 8 pohárov po 0,5 l')).toBe(8);
		expect(jarsFromYield('cca 1 l sirupu')).toBe(1);
		expect(jarsFromYield('cca 8 vreciek po 0,5 l')).toBe(8);
		expect(jarsFromYield(undefined)).toBe(1);
	});

	it('keeps only valid entries from storage', () => {
		expect(validatePreserves('x')).toBeUndefined();
		expect(
			validatePreserves([
				{
					id: 'a',
					name: ' Lečo ',
					count: 2,
					made: '2026-09-01',
					place: 'pivnica',
					recipeId: 'leco'
				},
				{ id: 'b', name: 'Zlé', count: 0, made: '2026-09-01', place: 'pivnica' },
				{ id: 'c', name: 'Zlé miesto', count: 1, made: '2026-09-01', place: 'garáž' },
				{
					id: 'd',
					name: 'Dal',
					count: 1,
					made: '2026-09-01',
					place: 'pivnica',
					thawed: '2026-09-02'
				}
			])
		).toEqual([
			{ id: 'a', name: 'Lečo', count: 2, made: '2026-09-01', place: 'pivnica', recipeId: 'leco' },
			{ id: 'd', name: 'Dal', count: 1, made: '2026-09-01', place: 'pivnica' }
		]);
	});
});
