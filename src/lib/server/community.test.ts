import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { communityStats } from './community';

/** The real schema in SQLite, behind just enough of the D1 API for these queries. */
function database() {
	const sqlite = new DatabaseSync(':memory:');
	for (const file of readdirSync('migrations').sort()) {
		sqlite.exec(readFileSync(`migrations/${file}`, 'utf8'));
	}
	const statement = (sql: string, params: unknown[] = []) => ({
		bind: (...values: unknown[]) => statement(sql, values),
		all: async () => ({ results: sqlite.prepare(sql).all(...(params as never[])) }),
		run: async () => sqlite.prepare(sql).run(...(params as never[]))
	});
	const db = {
		prepare: (sql: string) => statement(sql),
		batch: (statements: ReturnType<typeof statement>[]) =>
			Promise.all(statements.map((s) => s.all()))
	};
	return { sqlite, db: db as unknown as D1Database };
}

describe('communityStats', () => {
	const now = Date.UTC(2026, 9, 6);
	const day = 24 * 60 * 60;
	const t = (daysAgo: number) => Math.floor(now / 1000) - daysAgo * day;

	it('lists only recipes several people liked or cooked this week, and well-rated ones', async () => {
		const { sqlite, db } = database();
		const like = sqlite.prepare(
			'INSERT INTO likes (recipe_id, device_id, created_at) VALUES (?, ?, ?)'
		);
		like.run('dal', 'a', t(1));
		like.run('dal', 'b', t(2));
		like.run('pizza', 'a', t(1));
		like.run('kari', 'a', t(20));
		like.run('kari', 'b', t(20));
		const feedback = sqlite.prepare(
			'INSERT INTO feedback (recipe_id, kind, rating, created_at) VALUES (?, ?, ?, ?)'
		);
		for (const rating of [5, 4, 5]) feedback.run('dal', 'worked', rating, t(1));
		feedback.run('pizza', 'worked', 5, t(1));
		feedback.run('pizza', 'problem', null, t(1));

		const stats = await communityStats(db, now);
		expect(stats.week.liked).toEqual([{ recipe_id: 'dal', count: 2 }]);
		expect(stats.week.cooked).toEqual([{ recipe_id: 'dal', count: 3 }]);
		expect(stats.rated).toEqual([{ recipe_id: 'dal', rating: 4.7, ratings: 3 }]);
		expect(stats.totals).toEqual({ likes: 5, liking_devices: 2, cooked_reports: 4, ratings: 4 });
	});
});
