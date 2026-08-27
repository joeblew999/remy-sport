# Project Context

<!-- CLAUDE.md and GEMINI.md are aliases for this file. -->

**Only the traps live here.** Anything you can get from `mise tasks`, from the
code, or from a ten-second grep has been deleted — prose rots and nothing checks
it, and this file loads into every session, so a stale line here becomes wrong
work rather than a confused reader. It has done exactly that twice.

What is left is the set of things that have already cost a real bug.

```
mise tasks                what you can run, and what each does
mise run check            types + unit + worker + dead code + docs + these rules
mise run test:all         every tier, with the seconds each one costs
mise run test:tiers       where the tests are, and which are in the wrong tier
mise run test:render      rendering tests, no Worker, no database
mise run probe            typecheck a snippet against the real project (WEB=1 for the SPA)
```

## Next

Kept here because this file is the one thing read at the start of every session.
Update it when you finish something; delete the line when it is done.

1. **The org API exists; no GUI reaches it.** `/api/orgs` reads, edits and
   manages members, and `src/web/` calls none of it — the only org page accepts
   Better Auth invitations the product still cannot send. The backend is no
   longer the gap; the front end is.
2. **shadcn/ui + Tailwind are still not installed.** `src/web/styles.css` is
   ~1000 hand-written lines and the admin console added ~60 more. This is the
   largest remaining source of per-page boilerplate and nothing has been done
   about it.
3. **Production is four migrations behind.** `0000`–`0003` are written, applied
   locally and never deployed — 0003 drops the organization plugin's six tables
   after copying `member` into `org_member`. `mise run deploy` runs them and ends
   with `cf:smoke`. Nobody uses production yet, so the window is now.
4. **Five unhandled rejections in `test:worker`, and vitest exits 0 anyway.**
   All from the four tests that assert a *refusal* (wrong OTP, reused OTP,
   superseded OTP, password sign-in): Better Auth returns the 400 the test
   asserts and also leaves the `APIError` floating. Pre-existing, not a
   regression, and the tests are correct. It matters because a real unhandled
   rejection would hide in that count.
5. **Do not re-derive team permissions from org membership.** That was the shape
   this repo had, and it disagreed with the Product Owner's matrix in two
   directions at once — an org member who coached nothing could edit any team,
   and a head coach outside the org was refused. Team writes are scoped by
   `team_coaches`, which is what the model always granted. Resolved 2026-08-27;
   kept here so the next session does not rebuild it.
6. **The JSONL seed data is fully ported and verified.** All 298 rows of the 42
   deleted `.jsonl` files have an identical counterpart in
   `domain/model/*.ts`, field by field, including every one of the 582 locale
   values that used to live in `translations.jsonl` and `entity_names.jsonl`.
   The only differences are this week's deliberate ones, each in its own commit.
   The old files are safe to delete; they are already gone from biz `HEAD`.

The test classification is **done**. `mise run test:all` for the numbers; the
38 left in e2e are genuine round trips and belong there. Do not "optimise the
runner" — a whole session went into storageState, worker counts and project
ordering and it stopped dead. What worked was moving tests to the right tier and
merging worker files (~3s of workerd startup per file, measured).

> Four tiers, and the rule for choosing one:
>
> | Asserts | Goes in |
> |---|---|
> | a pure function | `tests/unit/` — `mise run test:unit` |
> | what the **API returns** | `tests/worker/` — `mise run test:worker` |
> | what the **UI renders** given data | `tests/render/` — `mise run test:render` |
> | a **real round trip** | `tests/e2e/` — `mise run test` |
>
> If a test signs in only so a page will render, seed the cache instead
> (`tests/helpers/seed-cache.ts`). Plan: [docs/dev/test-migration.md](docs/dev/test-migration.md).

## Companion repo

[remy-sport-biz](https://github.com/joeblew999/remy-sport-biz) is the Product
Owner's source of truth, cloned at `../remy-sport-biz/`. Its `domain/model/` is
TypeScript, and [`mise run domain:sync`](scripts/domain-sync.ts) copies it into
[src/domain/model/](src/domain/model/) **verbatim** — nothing transforms it.

**Never write a transform between the two.** That is what this was until
2026-08-27: 42 JSONL files compiled by a 900-line generator, and every silent
failure it produced was the transform going wrong quietly — a key spelled
`full_names` here and `fullNames` there, a NOT NULL pivot column left out of an
INSERT so twenty-one vocabularies inserted nothing and reported success, a
column type inferred from a sample value, one naming rule written three times
and matching nothing in two of them.

What proves the model agrees with this database is the seed:
`db.insert(city).values(CITY)` does not compile if a field and a column
disagree. Do not add a script that checks the same thing more weakly.

The copies are committed, so a build never needs biz — it is private, and
requiring it would put a credential in every deploy. `mise run check` verifies
they have not drifted.

**biz wins unless the code here says otherwise, with the reason in the commit.**

## Traps

**The schema is the root, and everything derives upward from it.**

```
src/db/*-schema.ts  ->  createSelectSchema  ->  oRPC .output()  ->  RouterClient  ->  React
```

The drizzle tables are **authored**. Nothing generates them, and nothing should:
the generator that used to had to be taught about `$type<Names>()`, the
vocabulary-derived enums and the unique indexes one feature at a time, and each
thing it had not been taught was silently dropped. The PO's model still decides
what a table *is* — a person reads it and writes the table.

**Schema is drizzle-kit's; data is the seed's. Nothing else writes a migration.**
`mise run db:generate` diffs [src/db/schema.ts](src/db/schema.ts) against the
snapshot under `src/db/migrations/meta/` and emits only the delta. Run it in a
real terminal — a rename prompts, because "renamed, or dropped and recreated?"
needs a person, and **read what it produces**: two of its migrations have been
wrong so far, one selecting a renamed column out of the old table and one
creating a table then pointing a foreign key at it while it was still empty.

The twenty migrations before this were squashed into `0000_init` on 2026-08-27.
They had accumulated a generated-migration problem — `domain:sync` emitted
two of them whole on every run, so a rename rewrote history — and the app was
pre-launch, so the history was worth less than the simplicity.

**Reference rows are not schema.** Every vocabulary row lives in
[src/db/seed.sql](src/db/seed.sql), ahead of the entities that reference them,
so changing a vocabulary is a re-seed and never a migration — a migration runs
once, and a corrected label would never reach a database already seeded.

The exception is narrow and 0001 is the only case: **a migration must leave the
database valid on its own.** 0002 backfills existing co-organizers to
`ACCEPTED`, so the two `invite_status` rows have to exist by then, so they are
in 0001. Only put rows in a migration when a migration would otherwise violate
its own foreign key.

**An index the database has and the drizzle schema does not is one a generated
migration can drop.** All ten join-table composite keys were in that state until
2026-08-27; they exist because a re-seed silently duplicated all 58 join rows
without them. They are emitted now from the `**Uniqueness**` lines in the PO's
schema.md, parsed the same way `the model's own gate.nu` parses them upstream. Two
remain undeclared — `organization_slug_uidx` and `user_biz_id_idx`, on tables
Better Auth generates — so never run `drizzle-kit push`, and read a generated
migration before applying it.

**Never set `TEST_OTP` on a deployed Worker.** It makes `generateOTP` return a
constant for every address the fixtures seed, so the admin account's sign-in
code becomes public knowledge. It is a local-dev value. `mise run deploy` ends
with [`cf:smoke`](scripts/smoke.ts), which verifies a deployment without one;
`test:deployed` needs it and is deliberately out of the pipeline.

**Better Auth owns authentication and nothing else.** Four tables: `user`,
`session`, `account`, `verification`. It owned six more — organization, member,
invitation, organizationRole, orgTeam, orgTeamMember — and every one was the
domain's, which is why the model ended up naming an auth library's columns and
the app needed two mappings to read its own data. Membership is `org_member`.
If a plugin wants to own a domain table, that is the signal not to use it.

**Never pass the platform `ac`/`roles` to the admin plugin.** Custom roles
*replace* the plugin's own, so `admin()` locked the seeded admin out of every
admin endpoint — invisible until something called one. It gets its own scoped
controller ([`src/auth/admin-access-control.ts`](src/auth/admin-access-control.ts));
`mise run check` asserts it.

**Do not merge the statement sets to "fix" that.** The admin plugin declares
`user` and `session`, and both names are taken by the domain model — where
`session` means a *camp session*. Merging makes "may define a camp session" and
"may revoke someone's login" the same permission.

**A write asks one question, and the answer is upstream.**
`requireAction("EDIT_TEAM_PROFILE")` reads the grants: the action names the
relations that satisfy it, each relation resolves itself from the table it
derives from, and the object comes from the action's own `object_type`. Nothing
about which table or which relations is written here. There is no
`requirePermission` and no `requireOrgMember` — the second of those was a
relation the model does not define, and it disagreed with the matrix in both
directions at once. [`src/api/base.ts`](src/api/base.ts) and
[`src/api/relations.ts`](src/api/relations.ts) are the whole of it.

**`better-auth` is pinned to 1.7.1 exactly. Do not restore the caret.** Two things
are not guessable: the CLI was renamed (`@better-auth/cli` is frozen at 1.4.22
forever; it is plain `auth` now, and checking the old package makes upgrades look
permanently blocked — verify with `bun pm why @better-auth/core`), and 1.7 needed
the `account.issuer` backfill in
`0000_init`, which carries it forward or every sign-in fails
with `User not found`. The pin also guards `session.cookieCache`, whose
invalidation semantics better-auth defines.

**There is no `translation` table.** One was specified and deliberately not built
— the `names` column's shape says why.
Names are a `names` JSON column on the row with a NOT NULL English pivot beside
it. There is no `nameTh` field and there should never be one again. Helpers:
[`src/domain/names.ts`](src/domain/names.ts).

**Never invent a value for a field with no table.** Render `—` or "Venue TBC", and
label a fixture-backed section beside real data as `SAMPLE DATA`.

**Derive, don't store, anything that is a function of other columns.** Event
status comes from the date window; a stored `status` is wrong the moment an event
starts.

**`MAIL_TRANSPORT` defaults to `outbox`** — captured in the isolate, not sent.
`/api/dev/outbox` 404s when the real transport is active and must never exist in
production. **Build links in email from `BETTER_AUTH_URL`**, never the request
origin: an email outlives its request. That is the one place this rule is
inverted relative to `trustedOrigins`.

**There is one environment.** `--env staging` once existed while `wrangler.toml`
declared no such environment; wrangler only *warns*, so it would have deployed a
second worker bound to the **production** D1 and R2. A real staging environment
needs its own database, secrets and migrations, not a flag.

**The dev tasks pass `--host localhost` and must keep doing so.** With a
`[[routes]]` block, plain `wrangler dev` simulates that route and every request
arrives as `remy.ubuntusoftware.net`. `mise run check` asserts it.

**`src/db/auth-schema.ts` is generated. Never edit it.** The hand-maintained
version drifted once and every sign-in 500'd the moment the schema became correct.

**Two e2e specs must never sign in as the same person.** A fixed `TEST_OTP`
does *not* make sign-in concurrency-safe: `generateOTP` returns a constant, but
Better Auth still writes and consumes a verification row per request, so two
in flight for one address invalidate each other and the loser gets
`INVALID_OTP` — which surfaces as a 20s `topbar-user` timeout, not as an auth
error. With `fullyParallel: true` this cost 4 failed runs in 5, and it bites
*within* one file as much as across two. If a spec only needs to **be** someone,
adopt a saved session — `adoptSession(page, X)`, or
`test.use({ storageState: stateFor(X) })` when the subject is the `request`
fixture. `auth.setup.ts` saves one per seeded address before anything runs.

Sign in for real only where sign-in is the subject (`spa-login`), where the
account did not exist beforehand (`organization`'s default-role test), or where
the test needs two genuinely separate sessions (`devices`). `admin-console` is
the other exception: impersonation mutates the session, so those tests cannot
share one — they are `describe.serial` instead. Do not reach for worker counts
or project ordering; a whole session went that way and stopped dead.

**`/` → `/#/x` is a same-document navigation.** React does not remount and
`useSession` does not refetch, so a page renders against whoever was signed in
before. Any test that changes identity uses `gotoFresh()`.

## Don't write documents

The ADRs are deleted. Fourteen of them, ~2,500 lines, and by the end four
described a transport that one commit had replaced, two described things that
were never built, and the newest had gone stale within a day of being written
about staleness. Git has them if anyone wants the archaeology.

A decision inside one file is a **code comment** — it moves in the same diff and
gets reviewed with it. A decision you can test is a **test** — it fails when it
stops being true. A decision about how to run something is a **mise task**.
Nothing else earns a file.

If you must record something that fits none of those, put it in the commit
message: dated, immutable, attached to the diff it describes, and incapable of
drifting from it.

Before writing "because X" anywhere: **measure X this session** — `mise run
probe` takes two seconds — or write "unverified". When a grep says a file is
unused, run `mise run check:dead` first.

## Conventions

- **If you change your mind while building, re-read the section of this file it
  touches before you commit.** No tool enforces this and it is the rule that has
  already failed: commit `21213e6` planned a `translation` table, changed to a
  JSON column mid-implementation, shipped the better design, and left this file
  describing the table. A brief written from it later asked for code that had
  never existed.
- `mise run check` before committing, not just `tsc`.
- Always `mise run`; never raw `bun`/`bunx wrangler` when a task exists. Tasks
  must be idempotent and work with no user args.
- Sessions should be **net-negative on lines**.
- Use well-known `autocomplete` attributes on form fields.

## Further reading

There is almost none, on purpose.

- [docs/dev/test-migration.md](docs/dev/test-migration.md) — the unfinished work
- [docs/dev/roadmap.md](docs/dev/roadmap.md) — what is being built, in what order
- biz [data/access/matrix.md](https://github.com/joeblew999/remy-sport-biz/blob/main/data/access/matrix.md)
  — who may do what
