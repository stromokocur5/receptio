import { describe, expect, it } from 'vitest';
import { deleteSync, readSync, writeSync } from './sync';

/** Just enough of D1 for the sync table. */
function fakeDb() {
	const rows = new Map<
		string,
		{ write_hash: string; data: string; created_at: number; updated_at: number }
	>();
	const statement = (sql: string, args: unknown[] = []) => ({
		bind: (...values: unknown[]) => statement(sql, values),
		async first() {
			if (sql.startsWith('SELECT data')) {
				const row = rows.get(args[0] as string);
				return row ? { data: row.data, updated_at: row.updated_at } : null;
			}
			if (sql.startsWith('SELECT write_hash')) return rows.get(args[0] as string) ?? null;
			if (sql.startsWith('SELECT COUNT')) return { n: rows.size };
			throw new Error(sql);
		},
		async run() {
			if (sql.startsWith('INSERT')) {
				const [id, write_hash, data, updated_at] = args as [string, string, string, number];
				if (rows.has(id)) return { meta: { changes: 0 } };
				rows.set(id, { write_hash, data, created_at: updated_at, updated_at });
				return { meta: { changes: 1 } };
			}
			if (sql.startsWith('UPDATE')) {
				const [data, updated_at, id, hash] = args as [string, number, string, string];
				const row = rows.get(id);
				if (!row || row.write_hash !== hash) return { meta: { changes: 0 } };
				Object.assign(row, { data, updated_at });
				return { meta: { changes: 1 } };
			}
			if (sql.startsWith('DELETE')) {
				const [id, hash] = args as [string, string];
				const ok = rows.get(id)?.write_hash === hash;
				if (ok) rows.delete(id);
				return { meta: { changes: ok ? 1 : 0 } };
			}
			throw new Error(sql);
		}
	});
	return { prepare: (sql: string) => statement(sql) } as unknown as D1Database;
}

const ID = 'a'.repeat(64);
const TOKEN = 'b'.repeat(64);

describe('sync storage', () => {
	it('creates, updates with the right token and refuses a wrong one', async () => {
		const db = fakeDb();
		expect((await writeSync(db, ID, TOKEN, 'iv.one', 1_000_000)).result).toBe('saved');
		expect((await writeSync(db, ID, TOKEN, 'iv.two', 2_000_000)).result).toBe('saved');
		expect((await writeSync(db, ID, 'c'.repeat(64), 'iv.evil')).result).toBe('forbidden');
		expect(await readSync(db, ID)).toEqual({ data: 'iv.two', updatedAt: 2000 });
	});

	it('deletes only with the right token', async () => {
		const db = fakeDb();
		await writeSync(db, ID, TOKEN, 'iv.one');
		expect(await deleteSync(db, ID, 'c'.repeat(64))).toBe(false);
		expect(await deleteSync(db, ID, TOKEN)).toBe(true);
		expect(await readSync(db, ID)).toBeNull();
	});
});
