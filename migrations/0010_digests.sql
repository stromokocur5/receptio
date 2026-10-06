-- Weekly summary (Sunday evening) and morning overview (Web Push). Only the push address, the time
-- zone and which of the two the device wants; the text is written by the page into the device's
-- own storage and shown by the service worker.
CREATE TABLE digest_reminders (
	id TEXT PRIMARY KEY,
	token_hash TEXT NOT NULL,
	endpoint TEXT NOT NULL,
	tz TEXT NOT NULL,
	weekly INTEGER NOT NULL DEFAULT 0,
	morning INTEGER NOT NULL DEFAULT 0,
	created_at INTEGER NOT NULL DEFAULT (unixepoch()),
	updated_at INTEGER NOT NULL
);

CREATE INDEX digest_reminders_updated ON digest_reminders (updated_at);
