import { describe, expect, it } from 'vitest';
import {
	jarsFromYield,
	monthsBetween,
	preserveAge,
	sortPreserves,
	validatePreserves,
	type Preserve
} from './preserves';

describe('preserves', () => {
	it('counts whole months', () => {
		expect(monthsBetween('2026-09-15', '2026-10-14')).toBe(0);
		expect(monthsBetween('2026-09-15', '2026-10-15')).toBe(1);
		expect(monthsBetween('2025-09-28', '2026-09-28')).toBe(12);
	});

	it('flags jars and bags as they get old', () => {
		expect(preserveAge({ made: '2026-09-01', place: 'pivnica' }, '2026-12-01')).toBe('fresh');
		expect(preserveAge({ made: '2025-11-01', place: 'pivnica' }, '2026-09-28')).toBe('soon');
		expect(preserveAge({ made: '2025-09-01', place: 'pivnica' }, '2026-09-28')).toBe('old');
		expect(preserveAge({ made: '2025-11-01', place: 'mraznicka' }, '2026-09-28')).toBe('old');
		expect(preserveAge({ made: '2026-08-01', place: 'chladnicka' }, '2026-09-28')).toBe('old');
	});

	it('puts the oldest of each place first', () => {
		const list: Preserve[] = [
			{ id: 'a', name: 'Lečo', count: 3, made: '2026-08-20', place: 'pivnica' },
			{ id: 'b', name: 'Fazuľky', count: 2, made: '2026-07-01', place: 'mraznicka' },
			{ id: 'c', name: 'Lekvár', count: 4, made: '2025-09-10', place: 'pivnica' }
		];
		expect(sortPreserves(list).map((p) => p.id)).toEqual(['c', 'a', 'b']);
	});

	it('reads the number of jars a recipe makes', () => {
		expect(jarsFromYield('cca 8 pohárov po 0,5 l')).toBe(8);
		expect(jarsFromYield('cca 1 l sirupu')).toBe(1);
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
				{ id: 'c', name: 'Zlé miesto', count: 1, made: '2026-09-01', place: 'garáž' }
			])
		).toEqual([
			{ id: 'a', name: 'Lečo', count: 2, made: '2026-09-01', place: 'pivnica', recipeId: 'leco' }
		]);
	});
});
