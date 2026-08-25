-- Entity names become rows, and city becomes a code.
--
-- Migration 0009 did this for the controlled vocabularies: no `name_th`
-- column, an English pivot on the row, and every language as a `translation`
-- row. The entity tables were still on the old shape, so the codebase had one
-- rule for vocabularies and another for events, teams and organisations.
-- This applies the same rule everywhere.
--
--   name / name_en  the English pivot. NOT NULL where it already was: it is the
--                   guaranteed fallback and the column things are sorted by.
--   translation     ('event', <id>, 'name', <locale>) -> value, for every
--                   language including English.
--
-- Adding a language is INSERTs into `translation`. It is never an ALTER TABLE,
-- a Better Auth schema regeneration, or an edit to a route.
--
-- `city` was free text holding an English name — "Bangkok" — which a Thai
-- reader could only ever be shown in English, and which nothing validated. It
-- becomes `city_code` against the `city` vocabulary seeded in 0009, matching
-- how biz models orgs/venues/events. `province_code` was already a code.
--
-- No backfill: there are no rows worth preserving yet. `team` is not touched
-- here — 0009 rebuilds it without `name_th` already.

-- Better Auth owns `organization`; these columns are declared as
-- additionalFields in src/auth.config.ts and generated into auth-schema.ts.
-- Change them there first, regenerate, then match it here.
ALTER TABLE organization DROP COLUMN name_th;
ALTER TABLE organization DROP COLUMN city;
ALTER TABLE organization ADD COLUMN city_code TEXT;

-- Migration 0005 indexed `event(city)`. SQLite refuses to drop a column an
-- index still references, so the index goes first and comes back on the code —
-- which is what discover filters by now.
DROP INDEX IF EXISTS event_city_idx;

ALTER TABLE event DROP COLUMN name_th;
ALTER TABLE event DROP COLUMN city;
ALTER TABLE event ADD COLUMN city_code TEXT;

CREATE INDEX IF NOT EXISTS event_city_code_idx ON event(city_code);

-- Names for rows that already exist. `translation` carries every locale, so
-- English is seeded from the pivot too and a reader in any language takes the
-- same code path.
INSERT OR IGNORE INTO translation (table_name, record_key, field_name, locale_code, value)
SELECT 'organization', id, 'name', 'en', name FROM organization WHERE name IS NOT NULL;
INSERT OR IGNORE INTO translation (table_name, record_key, field_name, locale_code, value)
SELECT 'event', id, 'name', 'en', name FROM event WHERE name IS NOT NULL;
INSERT OR IGNORE INTO translation (table_name, record_key, field_name, locale_code, value)
SELECT 'team', id, 'name', 'en', name FROM team WHERE name IS NOT NULL;
