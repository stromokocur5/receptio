-- Feedback on recipes: "cooked it, it works" or a reported problem. Read by hand; helps mark recipes as tested.
CREATE TABLE feedback (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	created_at INTEGER NOT NULL DEFAULT (unixepoch()),
	recipe_id TEXT NOT NULL,
	kind TEXT NOT NULL CHECK (kind IN ('worked', 'problem')),
	message TEXT,
	status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'done'))
);

CREATE INDEX feedback_created ON feedback (created_at);
CREATE INDEX feedback_recipe ON feedback (recipe_id);
