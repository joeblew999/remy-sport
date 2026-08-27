-- `relationships` becomes `guardian_types`, and `GUARDIAN` becomes `LEGAL_GUARDIAN`.
--
-- The word was doing three jobs: this vocabulary, the `relationships/` folder of
-- join tables, and `relations.jsonl` — the access-control relations, one letter
-- away in the same directory and meaning something else entirely. `GUARDIAN` was
-- simultaneously a kind of guardian here and an access relation there. The
-- folder became `links/` upstream; this is the rest.
--
-- HAND-WRITTEN, replacing what `drizzle-kit generate` produced. Its version
-- rebuilt `guardian` and copied with
--   INSERT INTO __new_guardian(...) SELECT "guardian_type_code" FROM guardian
-- selecting the *new* column name out of the *old* table, and wrapped it in
-- `PRAGMA foreign_keys=OFF`, which is a no-op inside the transaction D1 puts a
-- migration in. It failed on a copy of the local database with FOREIGN KEY
-- constraint failed. Generated migrations get read before they are applied.
--
-- SQLite rewrites foreign keys that reference a renamed table, so `guardian`'s
-- FK follows `relationship` to `guardian_type` without being touched. The
-- pragma covers the two UPDATEs: the code is a foreign key, so parent and child
-- cannot both be right in the middle of changing it.

PRAGMA defer_foreign_keys = true;

ALTER TABLE relationship RENAME TO guardian_type;
ALTER TABLE guardian RENAME COLUMN relationship_code TO guardian_type_code;

UPDATE guardian_type SET code = 'LEGAL_GUARDIAN' WHERE code = 'GUARDIAN';
UPDATE guardian SET guardian_type_code = 'LEGAL_GUARDIAN' WHERE guardian_type_code = 'GUARDIAN';
