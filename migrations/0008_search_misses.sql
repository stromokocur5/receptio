-- Searches that found no recipe at all: only the words typed (cleaned, without anything that looks
-- like a contact), how often and when last. Shows which recipes to write next.
CREATE TABLE search_misses (
	term TEXT PRIMARY KEY,
	count INTEGER NOT NULL DEFAULT 1,
	first_at INTEGER NOT NULL DEFAULT (unixepoch()),
	last_at INTEGER NOT NULL
);

CREATE INDEX search_misses_last ON search_misses (last_at);
