-- Anonymous likes: one row per (recipe, device). device_id is a random UUID kept in an httpOnly cookie.
CREATE TABLE likes (
	recipe_id TEXT NOT NULL,
	device_id TEXT NOT NULL,
	created_at INTEGER NOT NULL DEFAULT (unixepoch()),
	PRIMARY KEY (recipe_id, device_id)
);

CREATE INDEX likes_device ON likes (device_id);
