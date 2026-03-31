-- ADR 005 Phase 1: Team and player profile tables

CREATE TABLE IF NOT EXISTS team (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  event_id TEXT NOT NULL REFERENCES event(id),
  created_by TEXT NOT NULL REFERENCES user(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_team_event_id ON team(event_id);
CREATE INDEX IF NOT EXISTS idx_team_created_by ON team(created_by);

CREATE TABLE IF NOT EXISTS player_profile (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  position TEXT,
  created_by TEXT NOT NULL REFERENCES user(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_player_profile_created_by ON player_profile(created_by);
