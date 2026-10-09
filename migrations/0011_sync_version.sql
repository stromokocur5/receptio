-- A counter bumped on every write, so a household phone can write only over the copy it merged
-- with; two phones saving at once no longer overwrite each other's changes.
ALTER TABLE sync ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
