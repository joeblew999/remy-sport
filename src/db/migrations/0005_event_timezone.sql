-- The clock a game is played on.
--
-- `starts_at` is an instant in UTC, which is unambiguous and not enough: a
-- schedule has to say what time a game starts *where it is played*, and only
-- the event knows that. With this, a viewer in another zone can be shown both.
--
-- Nullable, and deliberately not backfilled from `city_code`. Every existing
-- row is a Thai event and "Asia/Bangkok" would be right for all of them today —
-- but writing it would record a guess as a fact, and a null reads honestly as
-- "nobody said". The seed sets it for the fixtures.

ALTER TABLE `event` ADD `timezone` text;