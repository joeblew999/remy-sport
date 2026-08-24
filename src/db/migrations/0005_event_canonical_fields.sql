-- ADR 008: move `event` toward the canonical biz schema so the React SPA can be
-- fed from D1 instead of the fixtures in src/web/data.ts.
--
-- Canonical shape (remy-sport-biz/data/seed/schema.md, "events.jsonl"):
--   id  name_th  name_en  type_code  format_code  organizer_user_id
--   org_id  start_date  end_date  city  province_code  is_fiba_certified
--
-- Additive on purpose. Every existing column stays, so the API, the seed route,
-- the auth harness in src/views/ and tests/authz.spec.ts keep working untouched.
-- Two deltas from canonical remain, both deliberate:
--
--   * `name` stands in for `name_en` and `created_by` for `organizer_user_id`.
--     Renaming them churns all five endpoints and the only authorization test
--     coverage in the repo for no functional gain — do it when something needs it.
--   * `type` keeps its lowercase vocabulary ('tournament') rather than canonical
--     SCREAMING_SNAKE ('TOURNAMENT'). Same reason: the dashboard, the OpenAPI
--     enum and the seeded fixtures all speak lowercase today.
--
-- `org_id` is omitted entirely: canonical points it at an `orgs` table that does
-- not exist here yet. Better Auth's `organization` table (migration 0004) is a
-- different thing — membership for auth, not the organising body. Adding a
-- dangling FK now would be inventing a fourth shape.
--
-- The date/city columns are nullable because rows created before this migration
-- have no value for them and SQLite cannot back-fill what was never collected.
-- Canonical marks them required; the API defaults them on create instead.

ALTER TABLE event ADD COLUMN name_th TEXT;
ALTER TABLE event ADD COLUMN format TEXT NOT NULL DEFAULT '5x5';
ALTER TABLE event ADD COLUMN start_date TEXT;
ALTER TABLE event ADD COLUMN end_date TEXT;
ALTER TABLE event ADD COLUMN city TEXT;
ALTER TABLE event ADD COLUMN province_code TEXT;
ALTER TABLE event ADD COLUMN is_fiba_certified INTEGER NOT NULL DEFAULT 0;

-- Browse/filter path for the SPA's discover page: list by date, narrow by city.
CREATE INDEX IF NOT EXISTS event_start_date_idx ON event(start_date);
CREATE INDEX IF NOT EXISTS event_city_idx       ON event(city);
