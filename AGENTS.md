# Project Context

<!-- CLAUDE.md and GEMINI.md are aliases for this file. -->

**Only the traps live here.** Anything you can get from `mise tasks`, from the
code, or from a ten-second grep has been deleted — prose rots and nothing checks
it, and this file loads into every session, so a stale line here becomes wrong
work rather than a confused reader. It has done exactly that twice
([ADR 020](docs/dev/adr/020-keeping-the-map-honest.md)).

What is left is the set of things that have already cost a real bug.

```
mise tasks                what you can run, and what each does
mise run check            types + unit + worker + dead code + docs + these rules
mise run test:tiers       where the tests are, and which are in the wrong tier
mise run probe            typecheck a snippet against the real project (WEB=1 for the SPA)
mise run followups        every open follow-up across the ADRs
```

> **Unfinished: the test migration.** 71 Playwright tests, target ~23. The
> per-file plan is [docs/dev/test-migration.md](docs/dev/test-migration.md);
> progress is `mise run test:tiers`. Do not optimise the runner — that was tried
> for a whole session and stopped dead at 1.6m. The population is the problem.

## Companion repo

[remy-sport-biz](https://github.com/joeblew999/remy-sport-biz) is the Product
Owner's source of truth, cloned at `../remy-sport-biz/`.

**biz wins unless there's an ADR here.** Schema changes go through biz first —
the canonical model is
[data/seed/schema.md](https://github.com/joeblew999/remy-sport-biz/blob/main/data/seed/schema.md).

## Traps

**Never pass the platform `ac`/`roles` to a Better Auth plugin.** Custom roles
*replace* the plugin's own. Broken twice: `organization()` made `"owner"` — the
role `createOrganization` writes — resolve to nothing, and `admin()` locked the
seeded admin out of every admin endpoint. Both invisible until something called
those endpoints. Plugins get their own scoped controllers ([`src/auth/`](src/auth/));
`mise run check` asserts it.

**Do not merge the statement sets to "fix" that.** The admin plugin declares
`user` and `session`, and both names are taken by the domain model — where
`session` means a *camp session*. Merging makes "may define a camp session" and
"may revoke someone's login" the same permission.

**Two tables are called "team".** `team` is a roster of players; `org_team` is a
group of *users who log in*. Rosters cannot move into `org_team_member` — its
`user_id` is a non-null FK, and biz makes `players.user_id` nullable because
minors usually have no account.

**A write needs both access-control questions.** `requirePermission` asks whether
this actor type may do this at all; `requireOrgMember` asks whether they stand in
the right relation to *this* object. Both in [`src/api/base.ts`](src/api/base.ts),
composed in [`src/api/teams.ts`](src/api/teams.ts). Check the biz access matrix
before adding either.

**`better-auth` is pinned to 1.7.1 exactly. Do not restore the caret.** Two things
are not guessable: the CLI was renamed (`@better-auth/cli` is frozen at 1.4.22
forever; it is plain `auth` now, and checking the old package makes upgrades look
permanently blocked — verify with `bun pm why @better-auth/core`), and 1.7 needed
the `account.issuer` backfill in
[migration 0007](src/db/migrations/0007_account_issuer.sql) or every sign-in fails
with `User not found`. The pin also guards `session.cookieCache`, whose
invalidation semantics better-auth defines.

**There is no `translation` table.** One was specified and deliberately not built
— [migration 0010](src/db/migrations/0010_localised_entity_names.sql) says why.
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
needs its own database, secrets and migrations — give it an ADR, not a flag.

**The dev tasks pass `--host localhost` and must keep doing so.** With a
`[[routes]]` block, plain `wrangler dev` simulates that route and every request
arrives as `remy.ubuntusoftware.net`. `mise run check` asserts it.

**`src/db/auth-schema.ts` is generated. Never edit it.** The hand-maintained
version drifted once and every sign-in 500'd the moment the schema became correct.

**`/` → `/#/x` is a same-document navigation.** React does not remount and
`useSession` does not refetch, so a page renders against whoever was signed in
before. Any test that changes identity uses `gotoFresh()`.

## ADRs

An ADR is a dated record of what someone believed, **not a measurement of what is
true.** Read it for intent; never cite it as evidence about the tree. One commit
invalidated the transport mechanism in four of them at once.

Before writing a "because X": **measure X this session** — `mise run probe` takes
two seconds — or write "unverified". Check the **Status** line of anything you
lean on; *Proposed* means nobody built it. When a grep says a file is unused, run
`mise run check:dead` first.

Write **one** ADR and surface it before starting the next. Better still, don't: a
decision inside one file is a code comment, and a decision you can test is a test.

When an ADR is overtaken, update its **Status** to point forward. Do not rewrite it.

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

- [docs/dev/README.md](docs/dev/README.md) — ADR index
- [docs/dev/test-migration.md](docs/dev/test-migration.md) — the unfinished work
- biz [data/access/matrix.md](https://github.com/joeblew999/remy-sport-biz/blob/main/data/access/matrix.md)
  — who may do what
