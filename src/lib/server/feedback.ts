import { z } from 'zod';
import { HANDLED_RETENTION_DAYS } from '$lib/retention';

/** Far above what friends will send; stops a flood from many IPs. */
export const MAX_FEEDBACK_PER_DAY = 200;
export const MAX_FEEDBACK_BYTES = 5_000;

export const feedbackSchema = z
	.object({
		recipeId: z.string().regex(/^[a-z0-9-]{1,80}$/),
		kind: z.enum(['worked', 'problem']),
		message: z.string().trim().max(2000).optional(),
		/** Stars, 1–5. */
		rating: z.number().int().min(1).max(5).optional(),
		/** Turnstile token from the widget. */
		turnstile: z.string().max(2048),
		/** Honeypot, see suggestions. */
		website: z.string().max(200).optional()
	})
	.strict()
	.refine((f) => f.kind === 'worked' || (f.message?.length ?? 0) >= 5, {
		message: 'Pri chybe napíš, čo nesedí'
	});

export type Feedback = z.infer<typeof feedbackSchema>;

export async function feedbackToday(db: D1Database, now = Date.now()): Promise<number> {
	const row = await db
		.prepare('SELECT COUNT(*) AS n FROM feedback WHERE created_at > ?')
		.bind(Math.floor(now / 1000) - 24 * 60 * 60)
		.first<{ n: number }>();
	return row?.n ?? 0;
}

export async function saveFeedback(db: D1Database, f: Feedback): Promise<void> {
	await db
		.prepare('INSERT INTO feedback (recipe_id, kind, message, rating) VALUES (?, ?, ?, ?)')
		.bind(f.recipeId, f.kind, f.message || null, f.rating ?? null)
		.run();
	// Handled messages are kept a year, then deleted (promised on /sukromie).
	await db
		.prepare(`DELETE FROM feedback WHERE status != 'new' AND created_at < ?`)
		.bind(Math.floor(Date.now() / 1000) - HANDLED_RETENTION_DAYS * 24 * 60 * 60)
		.run();
}

export interface CookedStats {
	/** How many times someone reported the recipe works as written. */
	cooked: number;
	/** Average stars, when anyone gave them. */
	rating?: number;
	ratings: number;
}

/** What cooks reported per recipe, for the cards. Recipes nobody reported on are left out. */
export async function cookedStats(db: D1Database): Promise<Record<string, CookedStats>> {
	const { results } = await db
		.prepare(
			`SELECT recipe_id, SUM(kind = 'worked') AS cooked, AVG(rating) AS rating, COUNT(rating) AS ratings
			 FROM feedback GROUP BY recipe_id`
		)
		.all<{ recipe_id: string; cooked: number; rating: number | null; ratings: number }>();
	return Object.fromEntries(
		results
			.filter((r) => r.cooked > 0 || r.ratings > 0)
			.map((r) => [
				r.recipe_id,
				{
					cooked: r.cooked,
					ratings: r.ratings,
					...(r.rating === null ? {} : { rating: Math.round(r.rating * 10) / 10 })
				}
			])
	);
}
