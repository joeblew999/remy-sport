-- Entity names become a JSON column, and city becomes a code.
--
-- Migration 0009 does this for the controlled vocabularies. The entity tables
-- were still carrying `name_th`, so the codebase had one rule for vocabularies
-- and another for events, teams and organisations. This applies one rule
-- everywhere:
--
--   names    JSON object keyed by locale — {"en":"…","th":"…"}
--   name     the English pivot beside it: NOT NULL, so something is always
--            renderable, and sortable without reaching into JSON
--
-- A JSON column rather than a `translation` join table on purpose. A name is a
-- property of the row, and keeping it one means it travels the whole stack
-- unaided: drizzle types the column, drizzle-zod derives the response schema
-- from the table, oRPC publishes that schema, and the client infers it. A join
-- table would need a query, a merge, and a hand-written mapping at every layer
-- — which is exactly the boilerplate this replaces. Coverage is enforced
-- upstream by remy-sport-biz's `data:check`, so nothing here needs to audit it.
--
-- `city` was free text holding an English name that nothing validated and a
-- Thai reader could only ever see in English. It becomes `city_code` against
-- the `city` vocabulary seeded in 0009, matching how biz models it.
--
-- No backfill: there are no rows worth preserving yet. `team` is not touched
-- here — 0009 rebuilds it with `names` already.

-- Better Auth owns `organization`; these columns are declared as
-- additionalFields in src/auth.config.ts and generated into auth-schema.ts.
-- Change them there first, regenerate, then match it here.
ALTER TABLE organization DROP COLUMN name_th;
ALTER TABLE organization DROP COLUMN city;
ALTER TABLE organization ADD COLUMN city_code TEXT;
-- Nullable, unlike our own tables: Better Auth writes an explicit NULL for an
-- optional additionalField, which overrides a DEFAULT and trips NOT NULL.
ALTER TABLE organization ADD COLUMN names TEXT;

-- Migration 0005 indexed `event(city)`. SQLite refuses to drop a column an
-- index still references, so the index goes first and comes back on the code —
-- which is what discover filters by now.
DROP INDEX IF EXISTS event_city_idx;

ALTER TABLE event DROP COLUMN name_th;
ALTER TABLE event DROP COLUMN city;
ALTER TABLE event ADD COLUMN city_code TEXT;
ALTER TABLE event ADD COLUMN names TEXT NOT NULL DEFAULT '{}';


-- Seed the pivot into the JSON for any row that predates the column, so a
-- reader in any language takes the same code path from the start.
UPDATE organization SET names = json_object('en', name) WHERE names IS NULL AND name IS NOT NULL;
UPDATE event        SET names = json_object('en', name) WHERE names = '{}' AND name IS NOT NULL;
UPDATE team         SET names = json_object('en', name) WHERE names = '{}' AND name IS NOT NULL;
