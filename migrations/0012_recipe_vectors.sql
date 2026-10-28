-- Which recipe text each vector in the RECIPE_INDEX (Vectorize) was made from, so the cron
-- embeds only recipes that changed.
CREATE TABLE recipe_vectors (
	id TEXT PRIMARY KEY,
	hash TEXT NOT NULL
);
