import { describe, expect, it } from 'vitest';
import { exportBackup, importBackup } from './backup';
import { favorites, history, notes, pantry, plan } from './state.svelte';

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
