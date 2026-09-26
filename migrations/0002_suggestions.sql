-- Recipes sent in by visitors through /navrhni. Read and curated by hand; nothing is published automatically.
CREATE TABLE suggestions (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	created_at INTEGER NOT NULL DEFAULT (unixepoch()),
	title TEXT NOT NULL,
	ingredients TEXT NOT NULL,
	steps TEXT NOT NULL,
	note TEXT,
	author TEXT,
	status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'added', 'rejected'))
);

CREATE INDEX suggestions_created ON suggestions (created_at);
