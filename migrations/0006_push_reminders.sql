-- Water reminders (Web Push). Only the browser's push address and the chosen times are stored;
-- the push has no content, the service worker writes the text. `token_hash` lets the device that
-- created a row change or delete it.
CREATE TABLE push_reminders (
	id TEXT PRIMARY KEY,
	token_hash TEXT NOT NULL,
	endpoint TEXT NOT NULL,
	from_min INTEGER NOT NULL,
	to_min INTEGER NOT NULL,
	every_min INTEGER NOT NULL,
	tz TEXT NOT NULL,
	skip_date TEXT,
	created_at INTEGER NOT NULL DEFAULT (unixepoch()),
	updated_at INTEGER NOT NULL
);

CREATE INDEX push_reminders_updated ON push_reminders (updated_at);
