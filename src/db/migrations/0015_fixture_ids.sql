-- Give the seeded users and organisations the ids the fixtures give them.
--
-- `POST /api/seed` used to create these rows through Better Auth's `createUser`
-- and `createOrganization`, which generate their own primary keys. The fixture
-- identity was carried alongside — `user.biz_id` (migration 0011) and
-- `organization.slug` — and every seeded row that named a user or an org was
-- resolved through that bridge at runtime.
--
-- The seed is now a generated SQL file that uses the fixtures' own ids, so the
-- bridge is unnecessary. But it cannot simply be applied to a database that was
-- seeded the old way: `INSERT OR IGNORE INTO user (id, email, …)` collides on
-- the unique email, the row is skipped, and the next statement that references
-- `usr_coach_001` fails with FOREIGN KEY constraint failed. That is what a
-- freshly built database never shows and every existing one does.
--
-- So the old ids are rewritten to the fixture ids, in place. Nothing is
-- deleted: rows created since — events, sessions, memberships — follow their
-- owner across and keep pointing at the same person.
--
-- The pragma is not optional. Children and parents cannot both be consistent
-- halfway through a rename, so every foreign key is violated at some point in
-- the middle of this file; `defer_foreign_keys` holds the check until the
-- commit at the end.
--
-- It needs no explicit one, because D1 wraps each migration file in a
-- transaction of its own — and refuses a hand-written one, pointing at the
-- state.storage APIs instead. Both halves were established by running it, not
-- assumed: the pragma resets to false at every commit, so where each statement
-- autocommits this file fails on its first UPDATE.
--
-- Do not write the two words wrangler looks for to detect a hand-rolled
-- transaction, even inside a comment. Its scanner does not exclude comments, so
-- quoting that phrase here made `readD1Migrations` reject the file with
-- "contains several transactions" and took the whole worker tier down with it.
--
-- Idempotent: the remap only ever selects rows whose id differs from the one
-- the fixtures give, so a second run finds nothing to do.

PRAGMA defer_foreign_keys = true;

CREATE TABLE IF NOT EXISTS _id_remap (old TEXT PRIMARY KEY, new TEXT NOT NULL);

-- Users bridge on `biz_id`, which the old route wrote for exactly this purpose.
INSERT OR IGNORE INTO _id_remap (old, new)
  SELECT id, biz_id FROM user WHERE biz_id IS NOT NULL AND id <> biz_id;

-- Organisations bridge on `slug`, the one field both sides always agreed on.
-- The five pairs are the PO's, from data/seed/entities/orgs.jsonl. They are
-- written out here rather than read, because a migration is a fixed historical
-- statement about a database — if the fixtures gain a sixth school, this file
-- must still describe what it did on the day it ran.
INSERT OR IGNORE INTO _id_remap (old, new)
  SELECT o.id, m.fixture
  FROM organization o
  JOIN (           SELECT 'assumption-college'                    AS slug, 'org_001' AS fixture
         UNION ALL SELECT 'triam-udom-suksa',                           'org_002'
         UNION ALL SELECT 'montfort-college',                           'org_003'
         UNION ALL SELECT 'basketball-sport-association-thailand',      'org_004'
         UNION ALL SELECT 'bangkok-basketball-club',                    'org_005'
  ) m ON m.slug = o.slug
  WHERE o.id <> m.fixture;

-- Every column that references user.id or organization.id, from
-- PRAGMA foreign_key_list on the built schema rather than from memory.
UPDATE session SET user_id = (SELECT new FROM _id_remap WHERE old = session.user_id) WHERE user_id IN (SELECT old FROM _id_remap);
UPDATE account SET user_id = (SELECT new FROM _id_remap WHERE old = account.user_id) WHERE user_id IN (SELECT old FROM _id_remap);
UPDATE member SET user_id = (SELECT new FROM _id_remap WHERE old = member.user_id) WHERE user_id IN (SELECT old FROM _id_remap);
UPDATE member SET organization_id = (SELECT new FROM _id_remap WHERE old = member.organization_id) WHERE organization_id IN (SELECT old FROM _id_remap);
UPDATE invitation SET inviter_id = (SELECT new FROM _id_remap WHERE old = invitation.inviter_id) WHERE inviter_id IN (SELECT old FROM _id_remap);
UPDATE invitation SET organization_id = (SELECT new FROM _id_remap WHERE old = invitation.organization_id) WHERE organization_id IN (SELECT old FROM _id_remap);
UPDATE organization_role SET organization_id = (SELECT new FROM _id_remap WHERE old = organization_role.organization_id) WHERE organization_id IN (SELECT old FROM _id_remap);
UPDATE org_team SET organization_id = (SELECT new FROM _id_remap WHERE old = org_team.organization_id) WHERE organization_id IN (SELECT old FROM _id_remap);
UPDATE org_team_member SET user_id = (SELECT new FROM _id_remap WHERE old = org_team_member.user_id) WHERE user_id IN (SELECT old FROM _id_remap);
UPDATE team SET org_id = (SELECT new FROM _id_remap WHERE old = team.org_id) WHERE org_id IN (SELECT old FROM _id_remap);
UPDATE event SET created_by = (SELECT new FROM _id_remap WHERE old = event.created_by) WHERE created_by IN (SELECT old FROM _id_remap);
UPDATE player SET user_id = (SELECT new FROM _id_remap WHERE old = player.user_id) WHERE user_id IN (SELECT old FROM _id_remap);
UPDATE eventCoOrganizer SET user_id = (SELECT new FROM _id_remap WHERE old = eventCoOrganizer.user_id) WHERE user_id IN (SELECT old FROM _id_remap);
UPDATE guardian SET user_id = (SELECT new FROM _id_remap WHERE old = guardian.user_id) WHERE user_id IN (SELECT old FROM _id_remap);
UPDATE subscription SET user_id = (SELECT new FROM _id_remap WHERE old = subscription.user_id) WHERE user_id IN (SELECT old FROM _id_remap);
UPDATE teamCoach SET user_id = (SELECT new FROM _id_remap WHERE old = teamCoach.user_id) WHERE user_id IN (SELECT old FROM _id_remap);
UPDATE userNotificationChannel SET user_id = (SELECT new FROM _id_remap WHERE old = userNotificationChannel.user_id) WHERE user_id IN (SELECT old FROM _id_remap);
UPDATE userNotificationPreference SET user_id = (SELECT new FROM _id_remap WHERE old = userNotificationPreference.user_id) WHERE user_id IN (SELECT old FROM _id_remap);

-- The parents last, so the statements above still read the old values.
UPDATE user SET id = (SELECT new FROM _id_remap WHERE old = user.id) WHERE id IN (SELECT old FROM _id_remap);
UPDATE organization SET id = (SELECT new FROM _id_remap WHERE old = organization.id) WHERE id IN (SELECT old FROM _id_remap);

DROP TABLE _id_remap;
