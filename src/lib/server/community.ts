/**
 * What everyone does on Receptio, in aggregate only: no device ids, no single person's activity.
 * A recipe shows up in a list only once at least MIN_COUNT people did the same.
 */
export const MIN_COUNT = 2;
const WEEK_S = 7 * 24 * 60 * 60;

export interface RecipeCount {
	recipe_id: string;
	count: number;
}

export interface CommunityStats {
	generated: string;
	/** Liked and reported as cooked in the last 7 days. */
	week: { liked: RecipeCount[]; cooked: RecipeCount[] };
	/** Highest average stars, recipes with at least 3 ratings. */
	rated: { recipe_id: string; rating: number; ratings: number }[];
	totals: { likes: number; liking_devices: number; cooked_reports: number; ratings: number };
}

export async function communityStats(db: D1Database, now = Date.now()): Promise<CommunityStats> {
	const since = Math.floor(now / 1000) - WEEK_S;
	const [liked, cooked, rated, totals] = await db.batch([
		db
			.prepare(
				'SELECT recipe_id, COUNT(*) AS count FROM likes WHERE created_at > ? GROUP BY recipe_id HAVING count >= ? ORDER BY count DESC LIMIT 10'
			)
			.bind(since, MIN_COUNT),
		db
			.prepare(
				"SELECT recipe_id, COUNT(*) AS count FROM feedback WHERE kind = 'worked' AND created_at > ? GROUP BY recipe_id HAVING count >= ? ORDER BY count DESC LIMIT 10"
			)
			.bind(since, MIN_COUNT),
		db.prepare(
			'SELECT recipe_id, AVG(rating) AS rating, COUNT(rating) AS ratings FROM feedback WHERE rating IS NOT NULL GROUP BY recipe_id HAVING ratings >= 3 ORDER BY rating DESC, ratings DESC LIMIT 10'
		),
		db.prepare(
			`SELECT (SELECT COUNT(*) FROM likes) AS likes,
				(SELECT COUNT(DISTINCT device_id) FROM likes) AS liking_devices,
				(SELECT COUNT(*) FROM feedback WHERE kind = 'worked') AS cooked_reports,
				(SELECT COUNT(rating) FROM feedback) AS ratings`
		)
	]);
	return {
		generated: new Date(now).toISOString(),
		week: {
			liked: liked.results as unknown as RecipeCount[],
			cooked: cooked.results as unknown as RecipeCount[]
		},
		rated: (rated.results as { recipe_id: string; rating: number; ratings: number }[]).map((r) => ({
			...r,
			rating: Math.round(r.rating * 10) / 10
		})),
		totals: totals.results[0] as CommunityStats['totals']
	};
}
