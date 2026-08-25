-- The demo users become the Product Owner's people.
--
-- The six seeded accounts were invented here: admin@remy.dev, coach@remy.dev
-- and so on, one per role, with English names. The fixtures already describe
-- twelve realistic Thai users — named in both languages, with the roles,
-- statuses and contact channels the domain actually has, including a referee in
-- PENDING_APPROVAL that the invented set had no way to express.
--
-- `biz_id` is the bridge. Better Auth generates user ids at runtime, so a
-- fixture row naming `usr_coach_001` has nothing to join against once seeded;
-- carrying the fixture id lets the seeder resolve one to the other, and lets a
-- relationship row that names a user find them. It is the same job `slug` does
-- for organisations, and it is null for anyone who signs up for real.
--
-- Declared as an additionalField in src/auth.config.ts and generated into
-- auth-schema.ts — change it there first, regenerate, then match it here.

ALTER TABLE user ADD COLUMN biz_id TEXT;

-- One user per fixture row, so re-seeding updates rather than duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS user_biz_id_idx ON user(biz_id) WHERE biz_id IS NOT NULL;
