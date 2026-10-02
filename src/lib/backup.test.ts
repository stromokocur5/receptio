import { describe, expect, it } from 'vitest';
import { exportBackup, importBackup } from './backup';
import {
	activeGarden,
	favorites,
	gardenName,
	gardens,
	history,
	notes,
	openGarden,
	pantry,
	plan,
	removeGarden,
	saveGarden,
	type GardenDiary
} from './state.svelte';

const garden = (id: string, name: string, place: GardenDiary['place'] = 'balkon'): GardenDiary => ({
	id,
	name,
	place,
	area: 2,
	sun: 'slnko',
	level: 1,
	combos: [],
	plants: [],
	done: {},
	harvests: [],
	beds: [],
	savedAt: '2026-10-01'
});

describe('backup', () => {
	it('restores everything it exported', () => {
		pantry.current = { cibula: 300 };
		plan.current = [{ recipeId: 'hummus', servings: 4 }];
		favorites.current = { hummus: true };
		notes.current = { hummus: 'viac citróna' };
		history.current = [{ recipeId: 'hummus', servings: 4, date: '2026-09-26' }];
		const backup = exportBackup(new Date('2026-09-26T10:00:00Z'));

		pantry.current = {};
		plan.current = [];
		notes.current = {};
		expect(importBackup(backup)).toContain('pantry');
		expect(pantry.current).toEqual({ cibula: 300 });
		expect(plan.current).toEqual([{ recipeId: 'hummus', servings: 4 }]);
		expect(notes.current).toEqual({ hummus: 'viac citróna' });
	});

	it('rejects foreign files and skips invalid parts', () => {
		expect(importBackup('not json')).toBeNull();
		expect(importBackup(JSON.stringify({ app: 'other', version: 1, data: {} }))).toBeNull();

		pantry.current = { cibula: 300 };
		const restored = importBackup(
			JSON.stringify({ app: 'receptio', version: 1, data: { pantry: 'oops', plan: [] } })
		);
		expect(restored).toEqual(['plan']);
		expect(pantry.current).toEqual({ cibula: 300 });
	});
});

describe('gardens', () => {
	it('keeps several gardens next to each other and opens the one saved last', () => {
		gardens.current = [];
		saveGarden(garden('a', 'Balkón'));
		saveGarden(garden('b', 'Záhrada u babky', 'zahrada'));
		expect(gardens.current.map((g) => g.name)).toEqual(['Balkón', 'Záhrada u babky']);
		expect(activeGarden()?.id).toBe('b');

		openGarden('a');
		saveGarden({
			...activeGarden()!,
			harvests: [{ ingredientId: 'salat', grams: 300, date: '2026-10-02' }]
		});
		expect(gardens.current).toHaveLength(2);
		expect(gardens.current[0].harvests).toHaveLength(1);
		expect(gardens.current[1].harvests).toEqual([]);

		removeGarden('a');
		expect(activeGarden()?.id).toBe('b');
		removeGarden('b');
		expect(activeGarden()).toBeNull();
	});

	it('numbers a second garden of the same kind', () => {
		expect(gardenName('balkon', [])).toBe('Balkón');
		expect(gardenName('balkon', [{ name: 'Balkón' }, { name: 'Záhrada' }])).toBe('Balkón 2');
	});

	it('takes the single garden of an older backup', () => {
		gardens.current = [];
		const { id: _id, name: _name, ...single } = garden('x', 'x', 'zahrada');
		const restored = importBackup(
			JSON.stringify({ app: 'receptio', version: 1, data: { garden: single } })
		);
		expect(restored).toEqual(['gardens']);
		expect(gardens.current).toHaveLength(1);
		expect(gardens.current[0]).toMatchObject({ name: 'Záhrada', place: 'zahrada', area: 2 });
		expect(gardens.current[0].id).toMatch(/^[a-z0-9-]{8}$/);
	});
});
