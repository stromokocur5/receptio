import { error, type RequestEvent } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { isPushEndpoint } from '$lib/push';
import { readHealth } from './health';
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
	const [feedback, perRecipe, suggestions, likes, misses, usage] = await db.batch([
		db.prepare("SELECT * FROM feedback ORDER BY status = 'new' DESC, created_at DESC LIMIT 200"),
		db.prepare(
			"SELECT recipe_id, SUM(kind = 'worked') AS worked, SUM(kind = 'problem') AS problems, AVG(rating) AS rating, COUNT(rating) AS ratings FROM feedback GROUP BY recipe_id ORDER BY worked DESC"
		),
		db.prepare("SELECT * FROM suggestions ORDER BY status = 'new' DESC, created_at DESC LIMIT 100"),
		db.prepare(
			'SELECT recipe_id, COUNT(*) AS n FROM likes GROUP BY recipe_id ORDER BY n DESC LIMIT 30'
		),
		db.prepare(
			'SELECT term, count, last_at FROM search_misses ORDER BY count DESC, last_at DESC LIMIT 60'
		),
		// How many devices use each server feature; nothing about who.
		db.prepare(
			`SELECT
				(SELECT COUNT(*) FROM sync) AS sync,
				(SELECT COUNT(*) FROM push_reminders) AS water,
				(SELECT COUNT(*) FROM supplement_reminders) AS supplements,
				(SELECT COUNT(DISTINCT device_id) FROM likes) AS likers,
				(SELECT COUNT(*) FROM likes) AS likes,
				(SELECT COUNT(*) FROM feedback) AS feedback`
		)
	]);
	return {
		feedback: feedback.results as unknown as FeedbackRow[],
		perRecipe: perRecipe.results as unknown as {
			recipe_id: string;
			worked: number;
			problems: number;
			rating: number | null;
			ratings: number;
		}[],
		suggestions: suggestions.results as unknown as SuggestionRow[],
		likes: likes.results as unknown as { recipe_id: string; n: number }[],
		misses: misses.results as unknown as { term: string; count: number; last_at: number }[],
		usage: usage.results[0] as unknown as {
			sync: number;
			water: number;
			supplements: number;
			likers: number;
			likes: number;
			feedback: number;
		}
	};
}

export async function adminHealth(db: D1Database) {
	const [health, alerts] = await Promise.all([
		readHealth(db),
		db.prepare('SELECT COUNT(*) AS n FROM admin_alerts').first<{ n: number }>()
	]);
	return { health, alertDevices: alerts?.n ?? 0 };
}

/** Adds or removes a device that gets a push when the health check starts failing. */
export async function setAdminAlert(db: D1Database, endpoint: string, on: boolean) {
	if (!isPushEndpoint(endpoint)) return false;
	await db
		.prepare(
			on
				? 'INSERT OR IGNORE INTO admin_alerts (endpoint) VALUES (?)'
				: 'DELETE FROM admin_alerts WHERE endpoint = ?'
		)
		.bind(endpoint)
		.run();
	return true;
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
