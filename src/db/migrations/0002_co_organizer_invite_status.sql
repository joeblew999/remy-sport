-- A co-organizer invitation gains a state to be in.
--
-- ACCEPT_CO_ORGANIZER_INVITE is granted to ANY_SIGNED_IN and had nothing to
-- accept: eventCoOrganizer recorded a co-organizer or it did not. An invite and
-- an accept action only mean something with a state between them, so
-- CO_ORGANIZER now filters on ACCEPTED and an outstanding invitation grants
-- nothing.
--
-- Rebuilt rather than altered, twice over. `drizzle-kit generate` emitted
--   ALTER TABLE eventCoOrganizer ADD status_code TEXT NOT NULL REFERENCES ...
-- which SQLite refuses on a table with rows ("Cannot add a NOT NULL column with
-- default value NULL"). Adding a default instead is refused for a different
-- reason — "Cannot add a REFERENCES column with non-NULL default value" — so a
-- column that is both a foreign key and non-null cannot be added at all. The
-- table has no children, so recreating it costs nothing.
--
-- ACCEPTED for what is already there. Anyone recorded as a co-organizer before
-- today is one; defaulting them to PENDING would silently revoke a relation
-- they hold.

CREATE TABLE eventCoOrganizer_new (
  event_id     TEXT NOT NULL REFERENCES event(id),
  user_id      TEXT NOT NULL REFERENCES user(id),
  added_at     TEXT NOT NULL,
  status_code  TEXT NOT NULL REFERENCES invite_status(code)
);

INSERT INTO eventCoOrganizer_new (event_id, user_id, added_at, status_code)
SELECT event_id, user_id, added_at, 'ACCEPTED' FROM eventCoOrganizer;

DROP TABLE eventCoOrganizer;
ALTER TABLE eventCoOrganizer_new RENAME TO eventCoOrganizer;
CREATE UNIQUE INDEX IF NOT EXISTS eventCoOrganizer_key ON eventCoOrganizer (event_id, user_id);
