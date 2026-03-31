-- ADR 005 Phase 2: Match, score, bracket, fixture tables

CREATE TABLE IF NOT EXISTS match (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES event(id),
  home_team_id TEXT REFERENCES team(id),
  away_team_id TEXT REFERENCES team(id),
  status TEXT NOT NULL DEFAULT 'scheduled',
  scheduled_at INTEGER,
  created_by TEXT NOT NULL REFERENCES user(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_match_event_id ON match(event_id);

CREATE TABLE IF NOT EXISTS score (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES match(id),
  home_score INTEGER NOT NULL DEFAULT 0,
  away_score INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES user(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_score_match_id ON score(match_id);

CREATE TABLE IF NOT EXISTS bracket (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES event(id),
  name TEXT NOT NULL,
  data TEXT,
  created_by TEXT NOT NULL REFERENCES user(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bracket_event_id ON bracket(event_id);

CREATE TABLE IF NOT EXISTS fixture (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES event(id),
  name TEXT NOT NULL,
  data TEXT,
  created_by TEXT NOT NULL REFERENCES user(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fixture_event_id ON fixture(event_id);
