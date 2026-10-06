-- Supplement reminders (Web Push), next to the water ones. Only the push address, the times of day
-- and which of today's times were already ticked off; the names of the supplements stay on the
-- device, the service worker writes them into the notification.
CREATE TABLE supplement_reminders (
	id TEXT PRIMARY KEY,
	token_hash TEXT NOT NULL,
	endpoint TEXT NOT NULL,
	times TEXT NOT NULL,
	tz TEXT NOT NULL,
	done_date TEXT,
	done_times TEXT NOT NULL DEFAULT '',
	created_at INTEGER NOT NULL DEFAULT (unixepoch()),
	updated_at INTEGER NOT NULL
);

CREATE INDEX supplement_reminders_updated ON supplement_reminders (updated_at);
