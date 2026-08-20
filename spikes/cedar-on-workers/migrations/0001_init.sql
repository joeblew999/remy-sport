-- Minimal slice of remy-sport's real schema, enough to exercise the relations
-- the spike's policies reference (OWNER, CO_ORGANIZER, PLATFORM_ADMIN, HEAD_COACH, etc.).
-- Not the full schema — intentionally small.

CREATE TABLE users (
  id        TEXT PRIMARY KEY,
  role_code TEXT NOT NULL  -- ADMIN / ORGANIZER / COACH / PLAYER / REFEREE / SPECTATOR
);

CREATE TABLE events (
  id                  TEXT PRIMARY KEY,
  type_code           TEXT NOT NULL,  -- TOURNAMENT / LEAGUE / CAMP / SHOWCASE
  organizer_user_id   TEXT NOT NULL REFERENCES users(id)
);

CREATE TABLE event_co_organizers (
  event_id TEXT NOT NULL REFERENCES events(id),
  user_id  TEXT NOT NULL REFERENCES users(id),
  PRIMARY KEY (event_id, user_id)
);

CREATE TABLE teams (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE team_coaches (
  team_id          TEXT NOT NULL REFERENCES teams(id),
  user_id          TEXT NOT NULL REFERENCES users(id),
  coach_role_code  TEXT NOT NULL,  -- HEAD / ASSISTANT / MANAGER
  PRIMARY KEY (team_id, user_id, coach_role_code)
);

-- Seed: covers OWNER, CO_ORGANIZER, PLATFORM_ADMIN, HEAD_COACH, ASSISTANT_COACH
INSERT INTO users (id, role_code) VALUES
  ('alice', 'ORGANIZER'),
  ('bob',   'ORGANIZER'),
  ('carol', 'ADMIN'),
  ('dave',  'SPECTATOR'),
  ('frank', 'COACH'),
  ('gina',  'COACH');

INSERT INTO events (id, type_code, organizer_user_id) VALUES
  ('evt_001', 'TOURNAMENT', 'alice'),
  ('evt_002', 'CAMP',       'alice');

INSERT INTO event_co_organizers (event_id, user_id) VALUES
  ('evt_001', 'bob');

INSERT INTO teams (id, name) VALUES
  ('team_001', 'Lions');

INSERT INTO team_coaches (team_id, user_id, coach_role_code) VALUES
  ('team_001', 'frank', 'HEAD'),
  ('team_001', 'gina',  'ASSISTANT');
