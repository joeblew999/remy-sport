-- ADR 005: Add API key table (Better Auth apiKey plugin) and bearer token support

CREATE TABLE IF NOT EXISTS apikey (
  id TEXT PRIMARY KEY,
  name TEXT,
  start TEXT,
  prefix TEXT,
  key TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  refill_interval INTEGER,
  refill_amount INTEGER,
  last_refill_at INTEGER,
  enabled INTEGER DEFAULT 1,
  rate_limit_enabled INTEGER DEFAULT 1,
  rate_limit_time_window INTEGER DEFAULT 86400000,
  rate_limit_max INTEGER DEFAULT 10,
  request_count INTEGER DEFAULT 0,
  remaining INTEGER,
  last_request INTEGER,
  expires_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  permissions TEXT,
  metadata TEXT
);

CREATE INDEX IF NOT EXISTS idx_apikey_key ON apikey(key);
CREATE INDEX IF NOT EXISTS idx_apikey_user_id ON apikey(user_id);
