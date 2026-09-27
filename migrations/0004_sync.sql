-- Account-free sync: one encrypted backup per recovery code. The browser derives `id` and a write
-- token from the code and encrypts the data itself, so the server never sees the code or the data.
CREATE TABLE sync (
	id TEXT PRIMARY KEY,
	write_hash TEXT NOT NULL,
	data TEXT NOT NULL,
	created_at INTEGER NOT NULL DEFAULT (unixepoch()),
	updated_at INTEGER NOT NULL
);

CREATE INDEX sync_created ON sync (created_at);
