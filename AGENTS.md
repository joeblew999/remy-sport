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

1. **shadcn/ui + Tailwind are still not installed.** `src/web/styles.css` is
   ~1000 hand-written lines and the admin console added ~60 more. This is the
   largest remaining source of per-page boilerplate and nothing has been done
   about it.
2. **Memberships are the one part of the seed that is not the PO's.**
   [`scripts/seed-sql.ts`](scripts/seed-sql.ts) hardcodes who belongs to which
   school, because biz `data/seed/relationships/` models rosters, guardians and
   follows but not org membership. It belongs upstream; when biz grows a
   membership file, read it.
3. **Several specs still sign in when they only need to *be* someone** —
   `accept-invitation`, `organization`, `invitations`. Each live sign-in is a
   chance to collide with another spec on the same address (see the trap
   below). They should load `stateFor(...)` like the two that now do.

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
Owner's source of truth, cloned at `../remy-sport-biz/`.

**biz wins unless the code here says otherwise, with the reason in the commit.** Schema changes go through biz first —
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
error. With `fullyParallel: true` this cost 4 failed runs in 5. If a spec only
needs to *be* someone, use `test.use({ storageState: stateFor(ACTORS.X) })`;
`auth.setup.ts` already saves one per actor. Sign in for real only where
sign-in is the subject. Do not reach for worker counts or project ordering —
a whole session went that way and stopped dead.

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
