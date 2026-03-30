-- ADR 005: Add role system (Better Auth admin plugin) and events table

-- Admin plugin fields on user table
ALTER TABLE user ADD COLUMN role TEXT DEFAULT 'user';
ALTER TABLE user ADD COLUMN banned INTEGER DEFAULT 0;
ALTER TABLE user ADD COLUMN ban_reason TEXT;
ALTER TABLE user ADD COLUMN ban_expires INTEGER;

-- Events table
CREATE TABLE IF NOT EXISTS event (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('tournament', 'league', 'camp', 'showcase')),
  description TEXT,
  created_by TEXT NOT NULL REFERENCES user(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_event_created_by ON event(created_by);
CREATE INDEX IF NOT EXISTS idx_event_type ON event(type);
