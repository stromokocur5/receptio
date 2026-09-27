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
		.prepare('INSERT INTO feedback (recipe_id, kind, message) VALUES (?, ?, ?)')
		.bind(f.recipeId, f.kind, f.message || null)
		.run();
	// Handled messages are kept a year, then deleted (promised on /sukromie).
	await db
		.prepare(`DELETE FROM feedback WHERE status != 'new' AND created_at < ?`)
		.bind(Math.floor(Date.now() / 1000) - HANDLED_RETENTION_DAYS * 24 * 60 * 60)
		.run();
}
