import { error, type RequestEvent } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { adminEmail } from './access';

/** The signed-in admin's e-mail; anyone else gets 403. In `vite dev` there's no Access, so it's open. */
export async function requireAdmin(event: RequestEvent): Promise<string> {
	if (dev) return 'dev@localhost';
	const env = event.platform?.env;
	const email = env
		? await adminEmail(event.request, {
				teamDomain: env.ACCESS_TEAM_DOMAIN,
				aud: env.ACCESS_AUD,
				adminEmails: env.ADMIN_EMAILS
			})
		: null;
	if (!email) error(403, 'Sem má prístup len správca');
	return email;
}

export interface FeedbackRow {
	id: number;
	created_at: number;
	recipe_id: string;
	kind: 'worked' | 'problem';
	message: string | null;
	status: 'new' | 'done';
}

export interface SuggestionRow {
	id: number;
	created_at: number;
	title: string;
	ingredients: string;
	steps: string;
	note: string | null;
	author: string | null;
	status: 'new' | 'added' | 'rejected';
}

export async function adminData(db: D1Database) {
	const [feedback, perRecipe, suggestions, likes] = await db.batch([
		db.prepare("SELECT * FROM feedback ORDER BY status = 'new' DESC, created_at DESC LIMIT 200"),
		db.prepare(
			"SELECT recipe_id, SUM(kind = 'worked') AS worked, SUM(kind = 'problem') AS problems FROM feedback GROUP BY recipe_id ORDER BY worked DESC"
		),
		db.prepare("SELECT * FROM suggestions ORDER BY status = 'new' DESC, created_at DESC LIMIT 100"),
		db.prepare(
			'SELECT recipe_id, COUNT(*) AS n FROM likes GROUP BY recipe_id ORDER BY n DESC LIMIT 30'
		)
	]);
	return {
		feedback: feedback.results as unknown as FeedbackRow[],
		perRecipe: perRecipe.results as unknown as {
			recipe_id: string;
			worked: number;
			problems: number;
		}[],
		suggestions: suggestions.results as unknown as SuggestionRow[],
		likes: likes.results as unknown as { recipe_id: string; n: number }[]
	};
}

export async function setFeedbackStatus(db: D1Database, id: number, status: 'new' | 'done') {
	await db.prepare('UPDATE feedback SET status = ? WHERE id = ?').bind(status, id).run();
}

export async function setSuggestionStatus(
	db: D1Database,
	id: number,
	status: 'new' | 'added' | 'rejected'
) {
	await db.prepare('UPDATE suggestions SET status = ? WHERE id = ?').bind(status, id).run();
}
