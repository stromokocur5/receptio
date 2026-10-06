-- Cron health check: whether the API answered on the last run, and since when it fails. One row.
CREATE TABLE health (
	id INTEGER PRIMARY KEY CHECK (id = 1),
	failing_since INTEGER,
	last_error TEXT,
	checked_at INTEGER NOT NULL,
	alerted_at INTEGER
);

-- The admin's devices that want a push when the check starts failing.
CREATE TABLE admin_alerts (
	endpoint TEXT PRIMARY KEY,
	created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
