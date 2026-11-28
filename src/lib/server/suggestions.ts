import { z } from 'zod';
import { SUGGESTION_LIMITS as L } from '$lib/suggestion';
import { HANDLED_RETENTION_DAYS } from '$lib/retention';

/** Stops a flood even if it comes from many IPs; far above what friends will ever send. */
export const MAX_SUGGESTIONS_PER_DAY = 50;
export const MAX_BODY_BYTES = 20_000;

const text = (min: number, max: number) => z.string().trim().min(min).max(max);

export const suggestionSchema = z
	.object({
		title: text(L.title.min, L.title.max),
		ingredients: text(L.ingredients.min, L.ingredients.max),
		steps: text(L.steps.min, L.steps.max),
		note: text(L.note.min, L.note.max).optional(),
		author: text(L.author.min, L.author.max).optional(),
		/** Turnstile token from the form. */
		turnstile: z.string().max(2048),
		/** Honeypot: hidden from people, filled in by naive bots. */
		website: z.string().max(200).optional()
	})
	.strict();

export type Suggestion = z.infer<typeof suggestionSchema>;

export async function suggestionsToday(db: D1Database, now = Date.now()): Promise<number> {
	const row = await db
		.prepare('SELECT COUNT(*) AS n FROM suggestions WHERE created_at > ?')
		.bind(Math.floor(now / 1000) - 24 * 60 * 60)
		.first<{ n: number }>();
	return row?.n ?? 0;
}

export async function saveSuggestion(db: D1Database, s: Suggestion): Promise<void> {
	await db
		.prepare(
			'INSERT INTO suggestions (title, ingredients, steps, note, author) VALUES (?, ?, ?, ?, ?)'
		)
		.bind(s.title, s.ingredients, s.steps, s.note || null, s.author || null)
		.run();
	// Handled messages are kept a year, then deleted (promised on /sukromie).
	await db
		.prepare(`DELETE FROM suggestions WHERE status != 'new' AND created_at < ?`)
		.bind(Math.floor(Date.now() / 1000) - HANDLED_RETENTION_DAYS * 24 * 60 * 60)
		.run();
}
