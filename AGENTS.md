# Project Context

<!-- The main agent context file (AGENTS.md, the open standard). CLAUDE.md and GEMINI.md are aliases. -->

**This file is the only document that must describe the repo as it is now.** Everything else is either
history (ADRs), or lives next to the code it explains. It is kept short on purpose: it loads into every
session, so a stale paragraph here does not merely mislead a reader — it becomes wrong work. It has
already done so twice (see [ADR 020](docs/dev/adr/020-keeping-the-map-honest.md)).

If something here can be derived from the code in ten seconds, it should not be here. What belongs is
the set of traps that have already cost a real bug.

## Companion repo

[remy-sport-biz](https://github.com/joeblew999/remy-sport-biz) is the Product Owner's source of truth for
*what* to build. Cloned at `../remy-sport-biz/`.

**Conflict rule: biz wins unless there's an ADR in this repo.** Check biz before touching
`src/db/schema.ts` or `src/web/data.ts`. **Schema changes go through biz first** — the canonical model is
[data/seed/schema.md](https://github.com/joeblew999/remy-sport-biz/blob/main/data/seed/schema.md) there.

## Getting started

```bash
mise trust && mise install && mise run setup
mise run dev:seed            # http://localhost:8787 — SPA at /app, auth harness at /
```

**`mise run web:dev` on its own does not work.** Vite serves the SPA and nothing else, so `/api/*` has no
backend: the session never resolves, sign-in 404s, every page renders empty — which looks like a broken
SPA rather than a missing API. It needs `mise run dev` in another terminal.

`mise run test` starts its own server. If `jq` install fails on a rate limit, retry with
`GITHUB_TOKEN="" mise install jq`.

## Stack

Cloudflare Workers + D1 + R2. Hono as the outer shell; **oRPC** for all domain logic, mounted twice over
one router — `/api` speaks REST and generates `/openapi.json`, `/rpc` serves the SPA. Better Auth,
Drizzle, Zod 4. React 19 + Vite for the product frontend. Playwright for tests. bun + mise for tooling.

~~Datastar / Lit~~ — proposed once, superseded by the React SPA, never implemented. Do not add either.

### Dependencies

`mise run deps:update` only moves within existing ranges, so it cannot cross a major silently. Follow with
`mise run test`.

**`better-auth` is on 1.7.1, and two things about it are not guessable:**

- **The CLI was renamed.** `@better-auth/cli` is frozen at 1.4.22 forever; the package moved to plain
  **`auth`**, which versions in lockstep with core. Checking `@better-auth/cli` makes upgrades look
  permanently blocked — it is the wrong package to check. Verify with `bun pm why @better-auth/core`:
  exactly one, matching `better-auth`.
- **`account.issuer` needed a backfill.** 1.7 matches `sign-in/email` on
  `createLocalAccountIssuer("credential")`, so before
  [migration 0007](src/db/migrations/0007_account_issuer.sql) every sign-in failed with `User not found`
  while `/api/seed` still reported the users as existing.

`deps:outdated` sees neither — a rename looks like abandonment, a required backfill like a normal minor.

## Three access-control scopes, and two tables called "team"

See [ADR 009](docs/dev/adr/009-full-organization-adoption.md). Both pairs are easy to conflate and each
conflation has already caused a bug.

**Roles.** Three scopes, three controllers — [access-control.ts](src/auth/access-control.ts) (event, team,
player), [org-access-control.ts](src/auth/org-access-control.ts) (organization, member, invitation),
[admin-access-control.ts](src/auth/admin-access-control.ts) (user, session).

**Never pass the platform `ac`/`roles` to a Better Auth plugin.** Supplying custom roles *replaces* the
plugin's own. This has broken twice: `organization()` made `"owner"` resolve to nothing (ADR 009), and
`admin()` left the seeded admin unable to call any admin endpoint (ADR 013). Both were invisible until
something called those endpoints.

**Do not merge the statement sets to "fix" it.** The admin plugin declares `user` and `session`, and both
names are taken by the domain model — where `session` means a *camp session*. Merging would make "may
define a camp session" and "may revoke someone's login" the same permission.

**Teams.** `team` is a roster of players (migration 0006). `org_team` is a group of *users who log in*
(migration 0008). Rosters cannot move into `org_team_member` — its `user_id` is a non-null FK, and biz
makes `players.user_id` nullable because minors usually have no account.

**Authorizing a write needs both questions.** `requirePermission` asks whether this actor type may do this
at all; `requireOrgMember` asks whether they stand in the right relation to *this* object. Both live in
[src/api/base.ts](src/api/base.ts); [src/api/teams.ts](src/api/teams.ts) shows the composition. Check the
biz access matrix before adding either.

## Sign-in is passwordless

See [ADR 012](docs/dev/adr/012-passwordless-email-otp.md). Email OTP is the **only** way in —
`emailAndPassword` is off, `POST /api/auth/sign-in/email` 400s, and **there are no passwords anywhere,
including the seed.** An address that receives a code gets an account, defaulted to `spectator`.

**Tests never post a password.** Use [tests/helpers/auth.ts](tests/helpers/auth.ts). The six seeded
`@remy.dev` actors sign in with a fixed `TEST_OTP`; everyone else gets a real emailed code from the dev
outbox. Codes are single-use, so the suite runs `workers: 1`.

`TEST_OTP` must be unset in production before the platform has real users.

## Email

See [ADR 010](docs/dev/adr/010-outbound-email.md). Cloudflare Email Service behind a `Mailer` seam in
[mail/mailer.ts](src/mail/mailer.ts).

`MAIL_TRANSPORT` **defaults to `outbox`**, which captures messages in the isolate instead of sending.
Production sets `cloudflare`; `.dev.vars` overrides back to `outbox` locally. `/api/dev/outbox` 404s
whenever the real transport is active — mail bodies carry invitation links, so that route must never exist
in production.

**Build links from `BETTER_AUTH_URL`, never from the request origin** — an email outlives its request. This
is the one place that rule is inverted relative to `trustedOrigins`.

Sending to people outside the account needs the Workers **Paid** plan *and* the sending domain onboarded.
Neither is checkable from the repo.

## Where the data comes from

The PO's fixtures live in `remy-sport-biz`. Nothing reads them at runtime — the path is a **build-time
generator** whose output is committed, so builds and deploys work without the biz repo or a token.

```
remy-sport-biz/data/seed/{reference,entities,relationships,localization}
        |   mise run domain:generate
        v
  src/db/vocabularies-schema.ts    20 drizzle tables + a registry
  src/domain/vocabularies.ts       typed constants and *_CODES unions
  src/db/migrations/0009_*.sql     the DDL and every row
  src/db/seed-data.ts              entities + relationships, for /api/seed
        |   drizzle-zod derives response schemas from those tables
        v
  src/api/*.ts  -->  /openapi.json  -->  the SPA (types inferred, nothing hand-written)
```

```sh
mise run biz:sync          # pull the PO's latest fixtures
mise run domain:generate   # regenerate the four files above
mise run cf:d1:reset       # replay migrations so the database picks it up
```

`mise run domain:check` fails when those files are stale. Deliberately **not** in `mise run check` or the
deploy pipeline — wiring it in would make every build depend on a private repo and a token.

Adding a vocabulary upstream is a file in `reference/` plus `domain:generate`: a table, a migration, typed
constants, an API field and a client type all appear with nothing edited here. Never an `ALTER TABLE`.

**Languages have a status.** `LOCALES` is what a reader is offered; `ALL_LOCALES` is everything declared,
drafts included. A draft is compiled so it can be exercised, but never appears in the switcher — half a
translation is worse than English. Promotion is one word in the PO's `locales.jsonl`.

**What it does not cover.** Better Auth owns `user` and `organization` — it generates their schema from
`src/auth.config.ts` and their ids at runtime, so the fixtures seed rather than define them. `event` and
`team` carry columns the fixtures do not model. Those four are the hand-mapped seam.

## Languages are rows, not columns — everywhere

One rule for every display string: the English value is a NOT NULL pivot on the row (`name` / `name_en`),
and every language including English is a key in a `names` JSON column beside it — `{"th":"…","en":"…"}`.
Migrations 0009 and 0010.

**There is no `translation` table.** One was specified and then deliberately not built, so a search finds
nothing and a plan that assumes it is wrong.
[Migration 0010](src/db/migrations/0010_localised_entity_names.sql) states why: a name is a property of its
row, so keeping it *on* the row lets it travel the whole stack unaided — drizzle types the column,
drizzle-zod derives the schema, oRPC publishes it, the client infers it.

- Backend: [src/domain/names.ts](src/domain/names.ts) — `pick`, `pivot`, `clean`. There is no catalogue to
  read or write.
- API: requests and responses speak `names`. There is no `nameTh` field and there should never be one.
- SPA: [lib/locale.tsx](src/web/lib/locale.tsx) resolves names and codes into the reader's language;
  [lib/i18n.tsx](src/web/lib/i18n.tsx) is for UI copy only.
- City is a code (`city_code` → the `city` vocabulary), so it renders in the reader's language.

Shipping a language is fixtures + `domain:generate` + `cf:d1:reset`.
[tests/reference.spec.ts](tests/reference.spec.ts) fails if a per-language field reappears.

**The organising body is Better Auth's `organization` table**, not a separate `orgs` table. Its canonical
columns (`names`, `org_type_code`, `city_code`, `province_code`) are `additionalFields` in
`src/auth.config.ts` so the generated schema carries them. Adding one in SQL alone recreates the 0003
drift bug.

## Database schema

**`src/db/auth-schema.ts` is generated. Never edit it.** `mise run auth:schema:generate` regenerates from
`src/auth.config.ts`; `auth:schema:check` fails on staleness and runs in the deploy pipeline.

`app-schema.ts` is hand-written (`event`, `team`), `fixtures-schema.ts` is generated, `schema.ts` re-exports
all three and is the only import site.

This split exists because the hand-maintained schema drifted: the admin plugin's `session.impersonated_by`
was never declared or migrated. Nothing failed while schema and database were wrong in the *same* way — the
moment the schema became correct, every sign-in 500'd.

## Two GUIs, for now

[src/web/](src/web/) is **the product** — React 19 + Vite, hash routing, EN/TH, also shipping as Tauri
desktop and iOS. New features go here. [src/views/](src/views/) is the admin console (ADR 013): account
list, role assignment, ban, impersonation.

They are being merged: `src/views/` goes once the SPA absorbs the console. Until then, both exist.

Two rules from wiring the first pages:

- **Never invent a value for a field with no table.** Render `—` or "Venue TBC", and label a
  fixture-backed section beside real data as `SAMPLE DATA`.
- **Derive, don't store, anything that is a function of other columns.** Event status comes from the date
  window; a stored `status` is wrong the moment an event starts.

Five accessors in [lib/data.tsx](src/web/lib/data.tsx) still return fixtures because no endpoint backs
them.

## ADRs

**An ADR is a dated record of what someone believed, not a measurement of what is true.** Read it for
*intent*. Never cite it as evidence about the current tree — `c4d326a` alone invalidated the transport
mechanism in ADRs 003, 005, 008 and 015 in one commit.

This has caused real harm. ADRs 016–019 were drafted citing ADR 003 ("the MCP server needs the REST
surface" — it is *Proposed*, with zero code) and ADR 005 ("this specified the API" — *Partially
implemented*, describing middleware since deleted). Both conclusions had to be rewritten.

Before writing a "because X" into an ADR:

- **Measure X this session.** A probe file, a `bun x` one-liner, a grep you checked twice. Prefer a failing
  command to a confident sentence.
- **If you cannot measure it, write "unverified".** That is legitimate; a plausible assertion is not.
- **Check the Status line of anything you lean on.** *Proposed* means nobody built it.
- **When a grep says a file is unused, run `mise run check:dead` before believing it.** A grep for
  `views/versions` misses `from "./versions"`. That mistake reached an ADR here.

When an ADR is overtaken, **do not rewrite it** — update its **Status** to point forward, in the style of
[ADR 015](docs/dev/adr/015-reference-vocabularies.md).

- `docs/dev/adr/NNN-short-title.md`. Format: Status, Context, Decision, Implementation, Consequences. <!-- docs-check-ignore -->
- Write **one** ADR and surface it before starting the next. Four in a burst meant three needed correcting.
- ADRs that add a workflow **must define the mise tasks** by name.
- Prefer not writing one. A decision inside a single file is a code comment; a decision you can test is a
  test. An ADR is for a decision spanning many files that needs review before code exists.

## Conventions

- **If you change your mind while building, re-read this file's section on it before you commit.** No tool
  enforces this and it is the rule that has already failed. Commit `21213e6` planned a `translation` table,
  changed to a JSON column during implementation, shipped the better design — and left this file describing
  the table. It was wrong on the day it was written, and a task brief written from it later asked for code
  that had never existed. `mise run check` catches a path that no longer resolves; it cannot catch a
  paragraph whose every path resolves and whose meaning is wrong.
- `mise run check` — types + dead code + documented paths + **the rules in this file**. Run it before
  committing, not just `tsc`. [scripts/check-conventions.ts](scripts/check-conventions.ts) asserts eight
  load-bearing claims from this document against the tree, so a rule here cannot quietly stop being true.
  If one fails, the code regressed *or* the rule changed — fix both together, in one commit. Never delete
  the check to make it pass.
- **`mise run probe` — measure instead of asserting.** Pipe a snippet in; it is typechecked against the
  real project and deleted. `WEB=1` probes the SPA instead of the Worker, which is usually the question.

  ```sh
  echo 'import type { Router } from "../api/index"
        export type P = Router' | WEB=1 mise run probe
  ```

  Every wrong belief corrected in the [ADR 020](docs/dev/adr/020-keeping-the-map-honest.md) session died to
  exactly this, in about a minute each. Cheaper than being wrong in a document that another session reads.
- `mise run followups` — every outstanding follow-up across all ADRs, in one list.
- Always use `mise run`; never raw `bun`/`bunx wrangler` when a task exists. Tasks must be idempotent and
  work with no user args.
- Use well-known `autocomplete` attributes on form fields so password managers work.
- Run `mise run test` after changes.

## Deployment

**https://remy.ubuntusoftware.net** — custom domain, see [ADR 006](docs/dev/adr/006-environment-provisioning.md).

```bash
mise run deploy             # check → test → bootstrap → deploy → wait → migrate → seed → test:deployed
mise run cf:env:bootstrap   # provision D1 + R2 + secret, if rebuilding from nothing
```

- **There is one environment.** `--env staging` once existed while `wrangler.toml` declared no such
  environment; wrangler only *warns*, so it would have deployed a second worker bound to the
  **production** D1 and R2. A real staging environment needs its own database, secrets and migrations —
  give it an ADR, not a flag.
- **The dev tasks pass `--host localhost` and must keep doing so.** With a `[[routes]]` block, plain
  `wrangler dev` simulates that route and `c.req.url`, `Host`, `Origin` and `Referer` all arrive as
  `remy.ubuntusoftware.net`. The flag is on `dev`, `dev:seed`, `dev:ensure`, `dev:remote` and the
  Playwright `webServer`.
- **`src/auth.ts` derives `trustedOrigins` from the request.** That is what makes auth correct on
  localhost, workers.dev and production. Do not replace it with a fixed list.
- **`database_id` is written by `cf:d1:ensure`**, never by hand. If `wrangler.toml` changes after a
  bootstrap, review and commit it.
- **A first deploy is not instantly reachable** — DNS and certificate issuance take minutes, which is what
  `cf:wait` covers.

`mise.toml` scopes wrangler/Playwright/gem state into `.wrangler/`, `.playwright/` and `.gem/` rather than
`$HOME`. Nothing is installed globally. Two mise limitations that look like config mistakes: `_.path` is
appended after `/usr/bin` so it cannot shadow a system binary (the iOS tasks prepend `$RUBY_BIN`
themselves), and per-task `tools = {}` is silently ignored.

Scoping cannot protect Cloudflare resources — they live in one flat account namespace, and the only control
is a least-privilege API token.

## Tauri (desktop + iOS)

```bash
mise run dev                # in one terminal — the shells need it
mise run tauri:dev          # desktop      mise run tauri:ios:dev   # Simulator
mise run tauri:build        # macOS .app + .dmg
```

`tauri.conf.json` points `devUrl` at `http://localhost:8787/app`, so the shells load the SPA from the
running Worker and the same relative `/api/*` calls work. It already runs `mise run web:build` via
`beforeDevCommand`, so the Tauri tasks deliberately omit `web:build` from `depends`.

`src-tauri/gen/apple` is committed; `gen/schemas` is not. If `tauri info` says `@tauri-apps/plugin-log` is
not installed, the SPA's log forwarding in `src/web/main.tsx` has lost its dependency.

## Seed actors (dev/test only)

`admin@`, `organizer@`, `coach@`, `player@`, `spectator@`, `referee@` — all `@remy.dev`, all signing in with
`TEST_OTP`. **No passwords.** Seeded via `mise run seed` / `seed:remote`. See ADR 002.

## Further reading

- [docs/dev/README.md](docs/dev/README.md) — dev docs index, including all ADRs
- biz: [data/access/matrix.md](https://github.com/joeblew999/remy-sport-biz/blob/main/data/access/matrix.md)
  is the primary reference for who may do what
- https://hono.dev/llms.txt · https://www.better-auth.com/llms.txt
