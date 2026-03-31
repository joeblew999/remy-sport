-- ADR 005 Phase 3: Roster, court, camp session, attendance tables

CREATE TABLE IF NOT EXISTS roster (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES team(id),
  player_id TEXT NOT NULL REFERENCES player_profile(id),
  created_by TEXT NOT NULL REFERENCES user(id),
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_roster_team_id ON roster(team_id);
CREATE INDEX IF NOT EXISTS idx_roster_player_id ON roster(player_id);

CREATE TABLE IF NOT EXISTS court (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  event_id TEXT NOT NULL REFERENCES event(id),
  created_by TEXT NOT NULL REFERENCES user(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_court_event_id ON court(event_id);

CREATE TABLE IF NOT EXISTS camp_session (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES event(id),
  name TEXT NOT NULL,
  scheduled_at INTEGER,
  created_by TEXT NOT NULL REFERENCES user(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_camp_session_event_id ON camp_session(event_id);

CREATE TABLE IF NOT EXISTS attendance (
  id TEXT PRIMARY KEY,
  camp_session_id TEXT NOT NULL REFERENCES camp_session(id),
  player_id TEXT NOT NULL REFERENCES player_profile(id),
  present INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL REFERENCES user(id),
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attendance_session_id ON attendance(camp_session_id);
