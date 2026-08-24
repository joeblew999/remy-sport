-- ADR 008 step 2: teams, so the SPA's team page can read D1 instead of the
-- fixtures in src/web/data.ts.
--
-- Two halves.
--
-- 1. `organization` gains the canonical `orgs` columns from
--    remy-sport-biz/data/seed/schema.md. Better Auth's organization IS the
--    domain's organising body — the school a coach is a member of is the school
--    its teams play for. Modelling those separately would leave two org tables
--    to keep in step by hand.
--
--    These columns are declared as organization `additionalFields` in
--    src/auth.config.ts, so the generated src/db/auth-schema.ts carries them and
--    `mise run auth:schema:check` guards the pair. Adding them here only would
--    reproduce the 0003 incident: a column the ORM could not see.
--
--    Nullable because Better Auth creates organizations through its own API and
--    cannot be made to supply domain fields at creation time.

ALTER TABLE organization ADD COLUMN name_th       TEXT;
ALTER TABLE organization ADD COLUMN org_type_code TEXT;  -- SCHOOL|CLUB|FEDERATION|GRASSROOTS
ALTER TABLE organization ADD COLUMN city          TEXT;
ALTER TABLE organization ADD COLUMN province_code TEXT;  -- e.g. BKK, CMI

-- 2. `team`, following canonical `teams`: id, name_th, name_en, org_id,
--    age_group_code, gender_code.
--
--    `name` stands in for `name_en`, matching the same choice made for `event`
--    in migration 0005 — the two stay consistent with each other rather than
--    each drifting toward canonical separately.
--
--    age_group_code and gender_code are controlled vocabularies that canonical
--    keeps in reference tables (age_groups, genders). They are stored as text
--    and validated in Zod at the API boundary instead, which is how `event.type`
--    and `event.format` are already handled. Reference tables become worthwhile
--    when something needs their bilingual labels; nothing does yet.

CREATE TABLE IF NOT EXISTS team (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,             -- canonical: name_en
  name_th        TEXT,
  org_id         TEXT NOT NULL REFERENCES organization(id),
  age_group_code TEXT NOT NULL,             -- U10|U12|U14|U16|U18|U21|OPEN|SENIOR
  gender_code    TEXT NOT NULL,             -- M|F|COED
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

-- "every team belonging to this school" is the query the team and org pages run.
CREATE INDEX IF NOT EXISTS team_org_idx ON team(org_id);
