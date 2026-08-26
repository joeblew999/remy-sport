-- `event.created_by` takes the name the fixtures give it.
--
-- Migration 0012 aligned `type` and `format` to the fixtures and stopped there,
-- leaving this one column named for how the row was made rather than for what it
-- means. The PO's model calls it `events.organizer_user_id`, and the OWNER
-- relation in relations.jsonl derives its tuples from that column by name.
--
-- Without this rename the relation resolver needs a per-column alias table
-- mapping the PO's names to ours — one entry today, and a place for a second.
-- Renaming instead means the derivation compiles straight through.
--
-- Nothing else in the schema disagrees with the fixtures after this.

ALTER TABLE event RENAME COLUMN created_by TO organizer_user_id;
