-- Whether an invitation is outstanding or taken up.
--
-- The rows are here rather than in the seed, and this is the one place that is
-- right. Reference data normally lives in src/db/seed.sql — a migration runs
-- once, so a corrected label would never reach a database that had already been
-- seeded. But 0002 backfills existing co-organizers to 'ACCEPTED', and a
-- migration has to leave the database valid on its own: without these two rows
-- that backfill violates its own foreign key.
--
-- Two values that will not change. Anything that might belongs in the seed.

CREATE TABLE `invite_status` (
	`code` text PRIMARY KEY NOT NULL,
	`name_en` text NOT NULL,
	`names` text NOT NULL,
	`sort` integer NOT NULL
);

INSERT OR IGNORE INTO invite_status (code, name_en, names, sort) VALUES
  ('PENDING',  'Pending',  '{"th":"รอการตอบรับ","en":"Pending"}',  1),
  ('ACCEPTED', 'Accepted', '{"th":"ตอบรับแล้ว","en":"Accepted"}', 2);
