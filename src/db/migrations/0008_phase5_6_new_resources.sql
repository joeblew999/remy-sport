-- Phase 5: Divisions, registrations, consolation brackets
-- Phase 6: Spoiler preferences, notifications, live streams, moderation

CREATE TABLE IF NOT EXISTS division (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES event(id),
  name TEXT NOT NULL,
  age_group TEXT,
  gender TEXT,
  created_by TEXT NOT NULL REFERENCES user(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_division_event_id ON division(event_id);

CREATE TABLE IF NOT EXISTS registration (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES event(id),
  type TEXT NOT NULL CHECK (type IN ('team', 'player')),
  team_id TEXT REFERENCES team(id),
  player_id TEXT REFERENCES player_profile(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_by TEXT NOT NULL REFERENCES user(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_registration_event_id ON registration(event_id);
CREATE INDEX IF NOT EXISTS idx_registration_created_by ON registration(created_by);

CREATE TABLE IF NOT EXISTS consolation_bracket (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES event(id),
  name TEXT NOT NULL,
  data TEXT,
  created_by TEXT NOT NULL REFERENCES user(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_consolation_bracket_event_id ON consolation_bracket(event_id);

CREATE TABLE IF NOT EXISTS spoiler_preference (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id),
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_spoiler_preference_user_id ON spoiler_preference(user_id);

CREATE TABLE IF NOT EXISTS notification_subscription (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id),
  event_id TEXT REFERENCES event(id),
  type TEXT NOT NULL CHECK (type IN ('push', 'email')),
  endpoint TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL REFERENCES user(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notification_subscription_user_id ON notification_subscription(user_id);

CREATE TABLE IF NOT EXISTS live_stream (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES event(id),
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES user(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_live_stream_event_id ON live_stream(event_id);

CREATE TABLE IF NOT EXISTS moderation_flag (
  id TEXT PRIMARY KEY,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved')),
  created_by TEXT NOT NULL REFERENCES user(id),
  reviewed_by TEXT REFERENCES user(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_moderation_flag_status ON moderation_flag(status);
