-- Better Auth 1.7: account identity becomes the pair (issuer, account_id).
--
-- 1.7 recognises an external account by (issuer, account_id) rather than by
-- (provider_id, account_id). The generated src/db/auth-schema.ts therefore
-- declares a NOT NULL `issuer` column and a compound unique index over the
-- pair, and the database has to grow both.
--
-- The upgrade guide deliberately does not generate this step: it cannot know
-- which issuer each row belongs to. Here it can be answered from the config —
-- auth.config.ts enables emailAndPassword and registers no social provider, so
-- every row is a credential row and takes upstream's credential issuer,
-- 'local:credential'. (OAuth rows would take the issuer each provider declares,
-- or 'local:oauth:<providerId>' for providers that declare none. Add that
-- branch here if a social provider is ever configured.)
--
-- Verified before writing this: 24 rows, all provider_id='credential', all
-- account_id distinct — so the new unique index cannot collide.
--
-- Note the contrast with 0003, which cleared the auth tables instead of
-- converting them. 0003 said in as many words that deleting rows was a one-off
-- licensed by there being no real users, and not a pattern to repeat. This
-- converts in place.

-- SQLite cannot add a NOT NULL column with no default, and cannot promote a
-- column to NOT NULL in place, so the table is rebuilt. Leaving `issuer`
-- nullable in SQL while auth-schema.ts declares it NOT NULL would recreate
-- exactly the ORM/database drift 0003 exists to clean up, and
-- `auth:schema:check` would not catch it — that task diffs the generated file
-- against itself, not against D1.
PRAGMA defer_foreign_keys = true;

-- Column order follows the generated schema rather than the old table's, since
-- the rebuild is free. `created_at` also picks up the default the generated
-- schema has always declared and the hand-written DDL never had; that drift
-- predates this upgrade and is cheapest to close while the table is being
-- rewritten anyway.
CREATE TABLE account_new (
  id                        TEXT PRIMARY KEY,
  issuer                    TEXT NOT NULL,
  account_id                TEXT NOT NULL,
  provider_id               TEXT NOT NULL,
  user_id                   TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  access_token              TEXT,
  refresh_token             TEXT,
  id_token                  TEXT,
  access_token_expires_at   INTEGER,
  refresh_token_expires_at  INTEGER,
  scope                     TEXT,
  password                  TEXT,
  created_at                INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  updated_at                INTEGER NOT NULL
);

INSERT INTO account_new (
  id, issuer, account_id, provider_id, user_id,
  access_token, refresh_token, id_token,
  access_token_expires_at, refresh_token_expires_at,
  scope, password, created_at, updated_at
)
SELECT
  id, 'local:credential', account_id, provider_id, user_id,
  access_token, refresh_token, id_token,
  access_token_expires_at, refresh_token_expires_at,
  scope, password, created_at, updated_at
FROM account;

DROP TABLE account;
ALTER TABLE account_new RENAME TO account;

-- Both indexes have to be recreated: dropping the old table dropped them with
-- it. account_userId_idx is the one 0003 renamed into place.
CREATE UNIQUE INDEX IF NOT EXISTS account_issuer_accountId_uidx ON account(issuer, account_id);
CREATE INDEX IF NOT EXISTS account_userId_idx ON account(user_id);
