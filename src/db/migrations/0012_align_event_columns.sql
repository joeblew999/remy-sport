-- Event columns take the names the fixtures give them.
--
-- `type` and `format` were plain TEXT holding a vocabulary code, named without
-- the `_code` suffix every other such column carries. That cost a rename at the
-- seam every time a fixture row was loaded, and hid the fact that they are
-- foreign keys.
--
-- The values change too: the codes are the fixtures' codes now. This repo used
-- to lowercase event types — migrations 0005 and 0009 recorded the reason as
-- "the published OpenAPI enum is lowercase and changing it would break existing
-- clients". There are no clients yet, so the delta is deleted rather than
-- carried, along with the three functions in the generator that applied it.

ALTER TABLE event RENAME COLUMN type TO type_code;
ALTER TABLE event RENAME COLUMN format TO format_code;

UPDATE event SET type_code = UPPER(type_code), format_code = UPPER(format_code);

-- 5x5 / 3x3 are not alphabetic, so UPPER left them alone; nothing to undo.

-- Migration 0002 pinned the old lowercase values with a CHECK constraint.
-- SQLite cannot drop one, so `event` is rebuilt without it — the vocabulary
-- table and its foreign key are the constraint now, and they enforce the PO's
-- codes rather than a list copied into a migration three years of edits ago.
PRAGMA defer_foreign_keys = true;

CREATE TABLE event_new (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  names             TEXT NOT NULL DEFAULT '{}',
  type_code         TEXT NOT NULL REFERENCES event_type(code),
  format_code       TEXT NOT NULL DEFAULT '5x5' REFERENCES event_format(code),
  description       TEXT,
  start_date        TEXT,
  end_date          TEXT,
  city_code         TEXT REFERENCES city(code),
  province_code     TEXT REFERENCES province(code),
  is_fiba_certified INTEGER NOT NULL DEFAULT 0,
  created_by        TEXT NOT NULL REFERENCES user(id),
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);

-- Rows whose code is not in the vocabulary would violate the new FK. The copy
-- filters rather than letting the rebuild fail halfway, matching how `team` is
-- rebuilt in 0009.
INSERT INTO event_new (id, name, names, type_code, format_code, description,
                       start_date, end_date, city_code, province_code,
                       is_fiba_certified, created_by, created_at, updated_at)
SELECT id, name, names, type_code, format_code, description,
       start_date, end_date, city_code, province_code,
       is_fiba_certified, created_by, created_at, updated_at
FROM event
WHERE type_code   IN (SELECT code FROM event_type)
  AND format_code IN (SELECT code FROM event_format);

DROP TABLE event;
ALTER TABLE event_new RENAME TO event;
CREATE INDEX IF NOT EXISTS event_city_code_idx ON event(city_code);
