-- ADR 007: organization plugin tables and wired access control.
--
-- Generated from src/db/auth-schema.ts after adding organization() to
-- src/auth.config.ts. `mise run auth:schema:check` fails the deploy pipeline if
-- this and the generated schema ever disagree.

-- Better Auth tracks which organization a session is acting within.
ALTER TABLE session ADD COLUMN active_organization_id TEXT;

CREATE TABLE IF NOT EXISTS organization (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  logo       TEXT,
  created_at INTEGER NOT NULL,
  metadata   TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS organization_slug_uidx ON organization(slug);

-- Membership roles here are Better Auth's own (owner/admin/member) and are
-- distinct from the six domain roles in src/auth/access-control.ts: a user has
-- exactly one platform role and may additionally belong to organizations.
CREATE TABLE IF NOT EXISTS member (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'member',
  created_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS member_organizationId_idx ON member(organization_id);
CREATE INDEX IF NOT EXISTS member_userId_idx ON member(user_id);

CREATE TABLE IF NOT EXISTS invitation (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  role            TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',
  expires_at      INTEGER NOT NULL,
  created_at      INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  inviter_id      TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS invitation_organizationId_idx ON invitation(organization_id);
CREATE INDEX IF NOT EXISTS invitation_email_idx ON invitation(email);
