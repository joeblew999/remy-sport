-- ADR 009: adopt the organization plugin's teams and dynamic access control.
--
-- Three new tables plus two nullable columns. Purely additive — nothing
-- existing is rewritten, so unlike 0007 this needs no table rebuild.
--
-- The plugin's own team tables are named `org_team` / `org_team_member` via
-- `schema: { team: { modelName: "orgTeam" } }` in auth.config.ts. `team` is
-- already the domain roster table from 0006, and the two are different nouns:
-- org_team groups *users who log in* (staff, coaching groups), while `team` is
-- a roster of players who mostly do not have accounts at all. See ADR 009.

-- Dynamic access control: roles created at runtime, scoped to one organization.
-- `permission` holds the serialised statement subset the role grants.
CREATE TABLE IF NOT EXISTS organization_role (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  role            TEXT NOT NULL,
  permission      TEXT NOT NULL,
  created_at      INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  updated_at      INTEGER
);
CREATE INDEX IF NOT EXISTS organizationRole_organizationId_idx ON organization_role(organization_id);
CREATE INDEX IF NOT EXISTS organizationRole_role_idx           ON organization_role(role);

CREATE TABLE IF NOT EXISTS org_team (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  member_count    INTEGER NOT NULL DEFAULT 0,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER
);
CREATE INDEX IF NOT EXISTS orgTeam_organizationId_idx ON org_team(organization_id);

-- membership_key is the plugin's own uniqueness guard against double-adding a
-- user to a team; it is unique globally, not per team.
CREATE TABLE IF NOT EXISTS org_team_member (
  id             TEXT PRIMARY KEY,
  team_id        TEXT NOT NULL REFERENCES org_team(id) ON DELETE CASCADE,
  user_id        TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  membership_key TEXT UNIQUE,
  created_at     INTEGER
);
CREATE INDEX IF NOT EXISTS orgTeamMember_teamId_idx ON org_team_member(team_id);
CREATE INDEX IF NOT EXISTS orgTeamMember_userId_idx ON org_team_member(user_id);

-- Both nullable: existing sessions have no active team, and invitations that
-- predate this migration were not scoped to one.
ALTER TABLE session    ADD COLUMN active_team_id TEXT;
ALTER TABLE invitation ADD COLUMN team_id        TEXT;
