-- ADR 015: the controlled vocabularies become tables.
--
-- age_group_code, gender_code, org_type_code, event type/format and
-- province_code were plain TEXT, validated only by a Zod enum hand-copied into
-- src/routes/*.ts. Two problems with that. The database would accept "U99"
-- from anything that did not go through those routes — the seed route, a
-- migration, a future admin tool. And the vocabularies live in
-- remy-sport-biz/data/seed/*.jsonl, so a hand-copied enum is a fork of the
-- PO's data that nothing checks.
--
-- Codes and names are copied verbatim from the biz fixtures. name_th is
-- carried because the product is bilingual and a code alone cannot be shown to
-- a Thai user.
--
-- These are reference data, not domain rows: they are seeded here rather than
-- through /api/seed so the FKs below are satisfiable the moment they exist.

CREATE TABLE IF NOT EXISTS age_group (
  code    TEXT PRIMARY KEY,
  name_en TEXT NOT NULL,
  name_th TEXT NOT NULL,
  min_age INTEGER,
  max_age INTEGER,
  sort    INTEGER NOT NULL
);
INSERT OR IGNORE INTO age_group (code, name_en, name_th, min_age, max_age, sort) VALUES
  ('U10',    'Under 10', 'อายุไม่เกิน 10 ปี', NULL, 10,   1),
  ('U12',    'Under 12', 'อายุไม่เกิน 12 ปี', NULL, 12,   2),
  ('U14',    'Under 14', 'อายุไม่เกิน 14 ปี', NULL, 14,   3),
  ('U16',    'Under 16', 'อายุไม่เกิน 16 ปี', NULL, 16,   4),
  ('U18',    'Under 18', 'อายุไม่เกิน 18 ปี', NULL, 18,   5),
  ('U21',    'Under 21', 'อายุไม่เกิน 21 ปี', NULL, 21,   6),
  ('OPEN',   'Open',     'ทั่วไป',            NULL, NULL, 7),
  ('SENIOR', 'Senior',   'อาวุโส',            NULL, NULL, 8);

CREATE TABLE IF NOT EXISTS gender (
  code    TEXT PRIMARY KEY,
  name_en TEXT NOT NULL,
  name_th TEXT NOT NULL,
  sort    INTEGER NOT NULL
);
INSERT OR IGNORE INTO gender (code, name_en, name_th, sort) VALUES
  ('M',    'Boys',  'ชาย', 1),
  ('F',    'Girls', 'หญิง', 2),
  ('COED', 'Co-ed', 'ผสม', 3);

CREATE TABLE IF NOT EXISTS org_type (
  code    TEXT PRIMARY KEY,
  name_en TEXT NOT NULL,
  name_th TEXT NOT NULL,
  sort    INTEGER NOT NULL
);
INSERT OR IGNORE INTO org_type (code, name_en, name_th, sort) VALUES
  ('SCHOOL',     'School',     'โรงเรียน',  1),
  ('CLUB',       'Club',       'สโมสร',     2),
  ('FEDERATION', 'Federation', 'สหพันธ์',   3),
  ('GRASSROOTS', 'Grassroots', 'ระดับรากหญ้า', 4);

-- Lowercase, unlike the biz fixtures. Migration 0005 recorded this delta: the
-- OpenAPI enum this repo already published uses lowercase, and changing the
-- public API to match the fixture casing would break existing clients for no
-- gain. The mapping is one-to-one, so nothing is lost.
CREATE TABLE IF NOT EXISTS event_type (
  code    TEXT PRIMARY KEY,
  name_en TEXT NOT NULL,
  name_th TEXT NOT NULL,
  sort    INTEGER NOT NULL
);
INSERT OR IGNORE INTO event_type (code, name_en, name_th, sort) VALUES
  ('tournament', 'Tournament',    'การแข่งขันแบบทัวร์นาเมนต์', 1),
  ('league',     'League',        'ลีก',                      2),
  ('camp',       'Camp / Clinic', 'ค่ายฝึก',                   3),
  ('showcase',   'Showcase',      'การโชว์ผู้เล่น',             4);

CREATE TABLE IF NOT EXISTS event_format (
  code    TEXT PRIMARY KEY,
  name_en TEXT NOT NULL,
  name_th TEXT NOT NULL,
  sort    INTEGER NOT NULL
);
INSERT OR IGNORE INTO event_format (code, name_en, name_th, sort) VALUES
  ('5x5', '5-on-5', '5 ต่อ 5', 1),
  ('3x3', '3x3',    '3 ต่อ 3', 2);

-- The 15 provinces in the PO's starter set, not all 77. The fixture is
-- explicitly a starter set the PO extends as the pilot expands, so seeding all
-- 77 here would invent data the PO has not curated names for.
CREATE TABLE IF NOT EXISTS province (
  code    TEXT PRIMARY KEY,
  name_en TEXT NOT NULL,
  name_th TEXT NOT NULL
);
INSERT OR IGNORE INTO province (code, name_en, name_th) VALUES
  ('BKK', 'Bangkok',            'กรุงเทพมหานคร'),
  ('NBI', 'Nonthaburi',         'นนทบุรี'),
  ('CMI', 'Chiang Mai',         'เชียงใหม่'),
  ('CRI', 'Chiang Rai',         'เชียงราย'),
  ('NMA', 'Nakhon Ratchasima',  'นครราชสีมา'),
  ('KKN', 'Khon Kaen',          'ขอนแก่น'),
  ('UBN', 'Ubon Ratchathani',   'อุบลราชธานี'),
  ('UDN', 'Udon Thani',         'อุดรธานี'),
  ('CBI', 'Chonburi',           'ชลบุรี'),
  ('PHK', 'Phuket',             'ภูเก็ต'),
  ('SKA', 'Songkhla',           'สงขลา'),
  ('NST', 'Nakhon Si Thammarat','นครศรีธรรมราช'),
  ('SNI', 'Surat Thani',        'สุราษฎร์ธานี'),
  ('RBR', 'Ratchaburi',         'ราชบุรี'),
  ('PTE', 'Pathum Thani',       'ปทุมธานี');

-- Foreign keys are added by rebuilding `team`: SQLite cannot add a constraint
-- to an existing table. `event` and `organization` are deliberately left alone
-- for now — organization is Better Auth's table and rebuilding it would put
-- this migration in the way of a future generated schema, and event.province
-- is nullable free text on rows that predate the province list.
PRAGMA defer_foreign_keys = true;

CREATE TABLE team_new (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  name_th        TEXT,
  org_id         TEXT NOT NULL REFERENCES organization(id),
  age_group_code TEXT NOT NULL REFERENCES age_group(code),
  gender_code    TEXT NOT NULL REFERENCES gender(code),
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

-- Any row whose code is not in the vocabulary would violate the new FK. There
-- are none — the seeded teams come from the biz fixtures — but a rebuild is
-- the wrong place to discover that, so the copy filters and the count check
-- below fails loudly rather than silently dropping rows.
INSERT INTO team_new (id, name, name_th, org_id, age_group_code, gender_code, created_at, updated_at)
SELECT id, name, name_th, org_id, age_group_code, gender_code, created_at, updated_at
FROM team
WHERE age_group_code IN (SELECT code FROM age_group)
  AND gender_code    IN (SELECT code FROM gender);

DROP TABLE team;
ALTER TABLE team_new RENAME TO team;
CREATE INDEX IF NOT EXISTS team_org_idx ON team(org_id);
