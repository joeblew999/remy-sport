-- ADR 005 Phase 4: Referee match-scoping join table

CREATE TABLE IF NOT EXISTS match_referee (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES match(id),
  user_id TEXT NOT NULL REFERENCES user(id),
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_match_referee_match ON match_referee(match_id);
CREATE INDEX IF NOT EXISTS idx_match_referee_user ON match_referee(user_id);
