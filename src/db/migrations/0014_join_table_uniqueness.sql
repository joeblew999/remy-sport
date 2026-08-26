-- The composite keys the PO's model has always declared.
--
-- Migration 0013 created ten join tables with no PRIMARY KEY and no UNIQUE
-- constraint, so nothing stopped the same row being written twice. That was
-- invisible while seeding went through `POST /api/seed`, because the route
-- reported per-user "created | exists" from its own bookkeeping rather than
-- from the database, and its `onConflictDoNothing()` needs a constraint to
-- have anything to do. Seeding a live database a second time — which
-- `mise run deploy` does on every deploy — silently duplicated all 58 join
-- rows: a player on a roster twice, a coach counted twice on a team.
--
-- Every rule below is copied from remy-sport-biz data/seed/schema.md, which
-- declares uniqueness for each of these tables. None of it is invented here.
-- Two are worth reading rather than assuming:
--
--   event_teams   (event_id, team_id, division_id) — a team may register in
--                 more than one division of the same event, so the obvious
--                 (event_id, team_id) would have been wrong.
--   player_teams  (player_id, team_id, from_date) — a player can rejoin a team
--                 they left, so the spell is part of the identity of the row.
--
-- Each table is de-duplicated before its index is built. Every database that
-- has been seeded more than once already holds duplicates, so creating the
-- index first fails with "UNIQUE constraint failed" and takes the deploy with
-- it. The worker tests cannot catch that — `isolatedStorage` gives each file an
-- empty database, where there is nothing to collide.
--
-- MIN(rowid) keeps the first row written and drops the later copies. These
-- tables carry no data of their own beyond the key, so the survivor is not a
-- choice between different values; the duplicates are identical.
--
-- Indexes rather than a table rebuild: adding a PRIMARY KEY to an existing
-- SQLite table means create-copy-drop-rename, and a UNIQUE index enforces the
-- same constraint and gives INSERT OR IGNORE the conflict target it needs.

DELETE FROM eventCoOrganizer WHERE rowid NOT IN (
  SELECT MIN(rowid) FROM eventCoOrganizer GROUP BY event_id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS eventCoOrganizer_key
  ON eventCoOrganizer (event_id, user_id);

DELETE FROM eventPlayer WHERE rowid NOT IN (
  SELECT MIN(rowid) FROM eventPlayer GROUP BY event_id, player_id);
CREATE UNIQUE INDEX IF NOT EXISTS eventPlayer_key
  ON eventPlayer (event_id, player_id);

DELETE FROM eventTeam WHERE rowid NOT IN (
  SELECT MIN(rowid) FROM eventTeam GROUP BY event_id, team_id, division_id);
CREATE UNIQUE INDEX IF NOT EXISTS eventTeam_key
  ON eventTeam (event_id, team_id, division_id);

DELETE FROM eventVenue WHERE rowid NOT IN (
  SELECT MIN(rowid) FROM eventVenue GROUP BY event_id, venue_id);
CREATE UNIQUE INDEX IF NOT EXISTS eventVenue_key
  ON eventVenue (event_id, venue_id);

DELETE FROM guardian WHERE rowid NOT IN (
  SELECT MIN(rowid) FROM guardian GROUP BY user_id, player_id);
CREATE UNIQUE INDEX IF NOT EXISTS guardian_key
  ON guardian (user_id, player_id);

DELETE FROM playerTeam WHERE rowid NOT IN (
  SELECT MIN(rowid) FROM playerTeam GROUP BY player_id, team_id, from_date);
CREATE UNIQUE INDEX IF NOT EXISTS playerTeam_key
  ON playerTeam (player_id, team_id, from_date);

DELETE FROM subscription WHERE rowid NOT IN (
  SELECT MIN(rowid) FROM subscription GROUP BY user_id, object_type_code, object_id);
CREATE UNIQUE INDEX IF NOT EXISTS subscription_key
  ON subscription (user_id, object_type_code, object_id);

DELETE FROM teamCoach WHERE rowid NOT IN (
  SELECT MIN(rowid) FROM teamCoach GROUP BY team_id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS teamCoach_key
  ON teamCoach (team_id, user_id);

DELETE FROM userNotificationChannel WHERE rowid NOT IN (
  SELECT MIN(rowid) FROM userNotificationChannel GROUP BY user_id, channel_code, address_label);
CREATE UNIQUE INDEX IF NOT EXISTS userNotificationChannel_key
  ON userNotificationChannel (user_id, channel_code, address_label);

DELETE FROM userNotificationPreference WHERE rowid NOT IN (
  SELECT MIN(rowid) FROM userNotificationPreference GROUP BY user_id, notification_type_code, channel_code);
CREATE UNIQUE INDEX IF NOT EXISTS userNotificationPreference_key
  ON userNotificationPreference (user_id, notification_type_code, channel_code);
