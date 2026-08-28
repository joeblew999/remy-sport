# Project Context

<!-- CLAUDE.md and GEMINI.md are aliases for this file. -->

**Only the traps live here.** Anything you can get from `mise tasks`, from the
code, or from a ten-second grep has been deleted — prose rots and nothing checks
it, and this file loads into every session, so a stale line here becomes wrong
work rather than a confused reader. It has done exactly that twice.

What is left is the set of things that have already cost a real bug.

**Seeded sign-in on the deployment is a switch, and the admin is never on it.**
`mise run demo:on` publishes a fixed code so the twelve seeded people can sign in
with one click — their addresses are `.test` and nothing delivers to them. The
seeded **admin** is excluded on any deployment: it holds ban, set-role and
impersonate, and impersonation is the one power that reaches a real person.
`cf:smoke` fails if it is ever offered, and `/api/dev/outbox` must stay 404 —
that one would expose everyone else's codes. It is a Worker secret not because
the value is secret (it is published to the browser and the page says so) but
because a secret flips without a redeploy. **`mise run demo:off` before the
platform has real users.**

**Adding a language is one pass, and Claude does the translating.** This is how
`ja` went from 0 to 196 messages: read `messages/en.json`, write
`messages/<locale>.json`, check the placeholders, `mise run i18n:generate`.
Nothing else is set up and nothing else is needed — inlang's own editor and its
machine-translate CLI both exist, and neither is used here, so neither is
described here as if it were.

**`messages/en.json` is the only file written by hand.** Every other locale is a
translation of it, so a message is added once and translated once. `ja` is
complete and still `status: "draft"` in the PO's model — nobody who speaks
Japanese has read it. Flipping `draft` to `released` in remy-sport-biz offers it
to users; that is the PO's call.

**Placeholders are the failure mode nothing catches.** `check:messages` counts a
non-empty string as translated, so a translation that dropped `{days}` ships as
"Starts in days" and only a reader notices. Compare them when a locale lands —
every `{name}` in `en.json` must appear, spelled identically, in the translation.

**`check:i18n` catches the other half: a string that was never a message.**
`check:messages` cannot — it asks whether every locale has every message, and
answers 196/196 while hardcoded English ships. The ESLint rule walks the AST
instead, and `eslint-suppressions.json` is a ratchet holding the known 66, all
of which are fixture copy on SAMPLE DATA screens.

**Messages compile to `src/paraglide`, not `src/web/paraglide`.** They are the
product's copy, not the SPA's — `src/auth.ts` writes the sign-in email from the
same messages a page renders, so an email and a screen cannot word the same
thing differently. The Worker must not depend on `src/web`, which is what moving
the output settled. It imports the generated module directly rather than
`src/web/lib/i18n`, whose other exports are the SPA's locale runtime.

**Email locale comes from `Accept-Language`, and only for the OTP.** The browser
asking for a code is the one about to read it, so the header is a real signal.
On an invitation it is not: the recipient is somebody else, and the header
describes the sender — that mail stays in the base locale until the invitee has
an account with a preference of its own.

**The API throws codes, not sentences.** `src/api/errors.ts` defines every
refusal a person can read — `TEAM_PLAYS_ITSELF`, `DIVISION_MISMATCH` and its
four facts — and the sentence is a paraglide message rendered client-side. An
English string thrown from a handler reaches a Thai page untranslated, which is
what all seventeen of them used to do. The `message` in a definition is for
non-browser callers and the OpenAPI document; it is not what the product shows.
`UNAUTHORIZED`, `FORBIDDEN` and a bare `NOT_FOUND` stay untyped on purpose — the
page branches on those rather than printing them. The client's table is
`Record<ErrorCode, ...>`, so a new code without a message is a compile error.

**Form errors go through `formErrors(error, paths)` — never `getIssueMessage`
directly.** The obvious shape, `getIssueMessage(err, "email") ?? message`, fails
silently: a path matching no issue returns undefined *and* the fallback stays
quiet because issues exist, so a refused write renders nothing at all and the
reader thinks the button is broken. These paths are strings and nothing
type-checks them, so a rename upstream causes it. `formErrors` takes every path
the form renders and surfaces anything unclaimed at form level — a wrong path
then shows the message in the wrong place, which someone notices, instead of
nowhere. `tests/unit/form-errors.test.ts` asserts it.

**`mise run dev:ensure` — never `pkill`, never a bare `wrangler dev`.** It is
idempotent and no-ops in a second when something is already serving. Starting
things by hand is what produced a day of measuring stale bundles: a
half-replaced server, or two racing for the port, and the thing on screen was
not the thing on disk. `dev:restart` is for the only three changes that need
one — the `dev` task itself, `.dev.vars` (wrangler reads it once at boot), or a
wedged process.

**Never run `web:build` by hand.** `dev` runs `vite build --watch`, so a change
under `src/web` is rebuilt and served in about a second. Typing `web:build`
repeats work already done and puts a second vite alongside the watcher, both
writing `dist/web`. It exists for `setup` and `deploy`, not for you.

| edited | needed |
|---|---|
| `src/**` — Worker or SPA | nothing. Both reload in ~1s |
| `vite.config.ts`, `.dev.vars`, `mise.toml` | `mise run dev:restart` |

The middle row is the one that catches people: **the watcher does not re-read
its own config**, so a vite.config.ts change appears to do nothing at all until
a restart — verified by editing it and watching the bundle hash stay put.

And never pad with `sleep`: poll `/api/health`, which is what `dev:ensure` does.
A full start is ~2s locally, ~4s with the tunnel.

**Flag architectural friction — do not just absorb it.** When a change makes you
fight the shape of the thing, or write the same block a third time, say so to
the Product Owner in your reply. Fix it well enough to finish the task, then
name it: what you hit, what you did instead, and what the real fix would be.
Silently working around a bad seam is how it survives — the workaround ships,
nobody hears about it, and the next person pays the same tax without knowing it
is a tax. `## Next` below is where the ones worth keeping are written down.

```
mise tasks                what you can run, and what each does
mise run check            types + unit + worker + dead code + docs + these rules
mise run check:deps       layer boundaries and import cycles (.dependency-cruiser.cjs)
mise run test:all         every tier, with the seconds each one costs
mise run test:tiers       where the tests are, and which are in the wrong tier
mise run test:render      rendering tests, no Worker, no database
mise run model:coverage   which of the PO's 75 actions the API implements, and which the GUI calls
mise run demo:status      is seeded sign-in live on the deployment, and who does it offer
mise run demo:on|off      turn it on or off — takes effect at once, no redeploy
mise run probe            typecheck a snippet against the real project (WEB=1 for the SPA)
```

## Next

Kept here because this file is the one thing read at the start of every session.
Update it when you finish something; delete the line when it is done.

1. **A page must not carry its own copy of the access matrix.**
   [`src/web/pages/org.tsx`](src/web/pages/org.tsx) is the shape to copy: it
   never asks what the viewer's role is. It asks the server for the member list,
   and a 403 renders as "not yours". Every relation is derived upstream from the
   PO's model, so a mirror in the client is the second answer to "may you" that
   drifts from the first — `admin.tsx`'s ROLE_PERMISSIONS is careful to label
   itself display-only for the same reason.
   Built 2026-08-27 with the primitives that already existed — `.admin-card` +
   `.admin-table` + `.badge` + `.btn` + `.muted` + `.empty` — and no new
   dependency; see item 2.
   [`src/web/components/schedule.tsx`](src/web/components/schedule.tsx) is the
   sharper case: the answer is per *row*. A referee is assigned to one game and
   not the next, so `canEnterScore` and `canSetStatus` arrive per game and the
   component reads them. No rule in a client could have got that right.
   **Sign in as any seeded person to check the GUI against the matrix.** `#/login`
   lists all twelve with the relations each holds — `ORG_ADMIN org_001`,
   `GAME_REFEREE gam_002` — derived from the model server-side, so it is the same
   answer the API gives when you act as them. One click, no inbox, local only.
   Two gaps it exposed, both closed: there was no procedure to *list* an org's
   members, and `addMember` took only a `userId` nobody can discover, so it now
   takes an email too.
2. **Do not install shadcn/ui + Tailwind.** This file used to call
   `src/web/styles.css` "the largest remaining source of per-page boilerplate".
   Measured 2026-08-27, that is false. It is 1093 lines defining **100 classes
   for 9 pages**, and essentially all of them are live — the first audit called
   9 dead and was wrong about 5, which are composed in template literals
   (`` className={`tab ${...}`} ``). It is a design system with an OKLCH token
   palette, not accumulated boilerplate.
   - **71 of the 100 classes are used on exactly one page**, and they are the
     bespoke product: brackets, live score cells, standings rows, team hero.
     shadcn/ui has no bracket component. It would replace maybe 5–8 of the 20
     shared classes — `.btn`, `.badge`, `.dash-card`, a table, tabs.
   - The bundle is **105 KiB gzipped**. Radix, shadcn's foundation, is not free,
     and it buys components that already exist.
   - `body`'s font stack tail is load-bearing: it is what renders Japanese,
     Korean and Chinese, and a declared locale becomes tofu without it.
     Tailwind's preflight is a live hazard to that, for no gain.
   - shadcn's default look is the generic one. Trading a deliberate identity for
     it is a downgrade, not a cleanup.
3. **Never renumber a migration that has been deployed.** wrangler tracks them
   by *filename*: squashing `0001`–`0015` into `0000_init` left production
   recording fifteen names the repo no longer had, so the chain would have
   replayed `0000_init` against a database that already had every table.
   Production was rebuilt from the chain on 2026-08-27 (deleted, recreated,
   migrated, seeded — it had no users) and now matches local exactly: 43 tables,
   ledger `0000`–`0003`, `foreign_key_check` clean. From here the chain is
   append-only. Check with
   `wrangler d1 execute remy-sport-db --remote --command "SELECT name FROM d1_migrations"`.
4. **`test:worker` prints five unhandled rejections on purpose — do not go
   hunting them.** They come from the four tests that assert a *refusal* (wrong
   OTP, reused OTP, superseded OTP, password sign-in). Better Auth returns the
   400 the test asserts and separately leaves the `APIError` floating inside its
   own dispatch; `better-call`'s router catches and converts the error on the
   response path, so this is a second promise, not that one. `withSpan` and
   `runWithEndpointContext` both chain correctly, so it is not either of those.
   `vitest.config.ts` already sets `dangerouslyIgnoreUnhandledErrors` with the
   reasoning written out — the run stays green by decision, not by accident.
   **The residual cost is the part worth knowing:** that flag is all-or-nothing,
   so an unhandled rejection in *our* Worker code would be ignored just as
   quietly. Narrowing it to Better Auth's is not reachable from the setup file —
   vitest intercepts these itself, so an `unhandledrejection` listener in
   `apply-migrations.ts` never fires (probed 2026-08-27). It would take an
   upstream fix or a vitest option that does not exist yet.
5. **Do not re-derive team permissions from org membership.** That was the shape
   this repo had, and it disagreed with the Product Owner's matrix in two
   directions at once — an org member who coached nothing could edit any team,
   and a head coach outside the org was refused. Team writes are scoped by
   `team_coaches`, which is what the model always granted. Resolved 2026-08-27;
   kept here so the next session does not rebuild it.
6. **An action can be about a *pair*, and the model can only name one object.**
   Registering a team asks two things of two different objects: are you this
   team's coach, and is this event one you may enter. `REGISTER_TEAM_FOR_EVENT`
   named EVENT while every relation granting it is about a TEAM, so the check
   resolved `team_coaches.team_id = <an event id>`, matched nothing, and failed
   closed — **no coach could register a team**, only a platform admin. Same class
   as the GAME bug: a relation resolved against the wrong object type is silent,
   because failing closed looks like a policy rather than a defect.
   The action is TEAM-scoped now and `requireAction` takes an event context for
   the `eventTypes` narrowing. **`mise run check` enforces it now** — see
   `check-tables.ts`, which fails if an action is granted to a relation about a
   different object type. Writing that check found two more instances the same
   minute: `EDIT_PLAYER_PROFILE` and `RECORD_ATTENDANCE` are both granted to
   HEAD_COACH and ASSISTANT_COACH, which are about a TEAM. **So a coach cannot
   edit their own player's profile, and cannot record attendance.** Both are
   listed pair-by-pair as known exceptions rather than exempted wholesale, and
   both need the Product Owner: they want "a coach of the team this player is
   on", which is PLAYER → player_teams → team_coaches — an object-side hop two
   joins deep, where the derivation shapes reach one.
7. **Two things I decided not to build, so the next session knows they are
   choices rather than oversights.** Standings are one table per event, not
   grouped by division — the division is on each row, and grouping is a page
   concern the day a league needs it. And **referee assignment has no screen**:
   `game_referees` is what makes score entry safe, and the only way to assign
   one is the seed, so an organiser running a real tournament cannot yet put a
   referee on a game.
8. **No write action is granted to `PUBLIC`, and `mise run check` keeps it that
   way.** I claimed `CREATE_PLAYER` was, on 2026-08-27, and it is not — the
   claim came from a `grep -A 8` whose context ran into the next action's
   grants. `CREATE_PLAYER` is `ANY_COACH` / `ANY_PLAYER` / `PLATFORM_ADMIN`,
   `DELETE_PLAYER` is admin-only, and a full audit found no public write
   anywhere. `check-tables.ts` now asserts that, so the next person does not
   have to trust either the model or me. **Read a grant block whole** — the
   blocks are adjacent and eight lines of context crosses into the next one.
9. **A per-object capability in a list is N queries. Known, accepted, bounded.**
   `games.list` returns `canEnterScore` per row, and each one is a `can()` —
   about two reads for an inherited relation. Three games is six reads; a season
   of three hundred is not acceptable. The right fix is to answer it set-wise:
   every relation is derivable in SQL, so "which of these games may this user
   score" is one query, not N. **Do not fix it by moving the decision into the
   client** — that is the copy of the access matrix items 1 and 2 exist to
   prevent. Revisit when a schedule first exceeds a page.
10. **Reading a row back after a write is written out per procedure.** Both game
   writes end with the same `reload` because the update returns nothing useful
   and the response must carry the joined names and the capability. `orgs.update`
   does its own version, `teams.update` another. Three copies is the point at
   which it should be one helper on the base builder; it is at three now.
11. **The JSONL seed data is fully ported and verified.** All 298 rows of the 42
   deleted `.jsonl` files have an identical counterpart in
   `domain/model/*.ts`, field by field, including every one of the 582 locale
   values that used to live in `translations.jsonl` and `entity_names.jsonl`.
   The only differences are this week's deliberate ones, each in its own commit.
   The old files are safe to delete; they are already gone from biz `HEAD`.
12. **`event.province_code` is the one `*_code` column with no constraint.** The
    other nineteen either have a `.references()` into a vocabulary or a drizzle
    `enum`; this one has a comment. Inert today because only the seed writes it —
    but `events.update` is on the list of writes with no GUI yet, and the day it
    gets one, a typo becomes a row. Give it `.references(() => province.code)`
    when you touch that table, not before: it is a migration for no live gain.

The test classification is **done**. `mise run test:all` for the numbers; the
25 left in e2e are genuine round trips and belong there. Do not "optimise the
runner" — a whole session went into storageState, worker counts and project
ordering and it stopped dead. What worked was moving tests to the right tier and
merging worker files (~3s of workerd startup per file, measured).

Two measurements, so they are not guessed at again: the render tier's cost was
**never `vite preview`** — it starts in 338ms; it was Google Fonts. And
`isolatedStorage: false` and guarding the migration batch each bought nothing.

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

**Four import rules, and `mise run check:deps` enforces them.** They were
enforced by hoping until 2026-08-27; the reasoning for each sits beside it in
[.dependency-cruiser.cjs](.dependency-cruiser.cjs).

- The Worker must not import `src/web`. This one actually happened: sending the
  sign-in email from the product's own messages meant importing the SPA, which
  typechecks only by accident because the Worker's tsconfig excludes `src/web`.
  Shared code goes below both — `src/domain` for the model, `src/paraglide` for
  copy, which is why the messages compile there.
- The SPA may import **types** from the API and nothing else. `import type
  { Router }` is how the client is typed and types erase; importing the
  implementation pulls drizzle, Better Auth and the D1 bindings into the browser
  bundle.
- No cycles. It found one immediately: `src/api/base.ts` imported the relation
  resolver while `relations.ts` imported `type Db` back out of `base`. Invisible
  to tsc, because a type import erases before it forms an opinion — `Db` is
  [src/api/db.ts](src/api/db.ts) now. The two drizzle schema files are exempt
  and say why: `references(() => org.id)` takes a thunk *so that* tables can
  point at each other.
- `src/domain` imports nothing above it. It is the bottom of the chain below.

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

**The dev tasks pass an explicit `--host` and must keep doing so.** With a
`[[routes]]` block, plain `wrangler dev` simulates that route and every request
arrives as `remy.ubuntusoftware.net`. The *value* is free: `mise run dev` passes
the machine's LAN address so a phone on the same wifi can reach it, and sign-in
still works from localhost as well — `trustedOrigins` derives from the request
URL (`src/auth.ts`), so whichever host a request arrives on is trusted. Verified
by signing in over each in turn; note an OTP is single-use, so testing that by
hand fails on the second attempt as `INVALID_OTP` and looks like an origin
refusal. `mise run check` asserts the flag is present.

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

**Every procedure declares how it is authorised, and `mise run check:authz`
walks the real router to prove it.** Model-driven authorisation that a person
has to remember is not enforcement — on 2026-08-28 all fifty-three procedures
declared nothing inspectable, and a whole feature shipped with none, because
"deliberately public" and "somebody forgot" were indistinguishable to every
check here. Four declarations, and the last three are printed on every run
because an unreviewed exception is the failure mode:

| | |
|---|---|
| `requireAction(ACTION)` | the normal case — the model decides |
| `openTo(ACTION)` | public, *and the model grants it to PUBLIC* — verified at load |
| `checkedInHandler(...)` | the action depends on the input, so the handler asks `can()` |
| `stricterThanModel(A, why)` | we permit less than the model does, said out loud |
| `infrastructure(why)` | not a domain object — health, vocabularies |

`listOf` in domain.ts takes the policy as a required argument, so a new table
cannot become an endpoint without one. That factory is how personal data gets
published by accident.

**The check covers the Hono routes too, and that was an afterthought that
mattered.** The first version walked only the oRPC router and reported a clean
53 of 53 — while five sub-routers sat alongside it unexamined, one of them
`POST /api/seed`: an unauthenticated write on a public domain, 330 D1
statements to anyone who found it. A check that enumerates the easy half is
worse than none, because it reads as a clean bill of health. Every non-procedure
route is now listed in `HONO_ROUTES` with a sentence on how it is guarded, and
a new one fails the build until somebody writes that sentence.

Seeding is an operator action: `/api/seed` 404s on a deployment like the outbox
does, and `mise run seed:remote` applies `src/db/seed.sql` through wrangler. A
token was the first fix and the wrong one — `wrangler secret` values cannot be
read back, so the pipeline would have needed its own copy of a secret the
platform already held.

**Authorisation is the model's answer, never a role string compared in a
handler.** Two of these on 2026-08-28, both failing open and silently. Web Push
resolved its audience by reading the `subscription` table — everyone who had
pressed Follow — when the model grants `RECEIVE_TEAM_NOTIFICATIONS` to a team's
coaches, manager and players as well as its followers. So a head coach was told
nothing about their own game, and the model had said otherwise since before push
existed. Separately, `teams.create` compared `user.role !== "admin"` to decide
whether to write a coaching row: a third spelling of a code that lives in the
PO's vocabulary and in Better Auth.

Ask the model. `requireAction` on the procedure, `can()` when the action depends
on the input, `holds(db, "PLATFORM_ADMIN", user, null)` for a role, and
`audienceFor(db, action, objectId)` for the inverse — *who* holds this, which is
the question a notification asks. `mise run check:conventions` enforces this for
`src/api`. Before writing an authorisation check by hand, **grep the model for
an action that already covers it** — there are 75, and roughly a third of what
they describe is built.

**Every Web Push library on npm is a decade out of date.** The obvious pick —
`@block65/webcrypto-web-push`, the one that advertises Workers support — puts
`content-encoding: aesgcm` and `Authorization: WebPush <jwt>` on the wire. Both
are drafts that were superseded in 2017 by `aes128gcm` and `vapid t=,k=`. Chrome
and Firefox still accept the old ones; **Apple does not**, and on iOS a web app
is the only way we reach a phone at all. So it would have failed on the one
platform the feature exists for, as a 400 nobody was watching. `src/api/webpush.ts`
implements both RFCs directly over WebCrypto — no dependency — and
`tests/worker/push.test.ts` implements the *receiving* half from the same specs
so a mistake fails a test instead of reaching nobody. **Check what a push
library emits before trusting it.**

**Rotating the VAPID pair silently breaks every existing subscription.** The
browser pins the public key at `subscribe()` time, so a new key cannot sign for
endpoints the old one created — they fail 403 forever, and no reader is told.
`mise run push:secret:set` therefore generates a pair only when none exists and
never replaces one.

**PWA icons must live in `src/web/public/`.** Anywhere else under `src/web`,
vite treats them as source and content-hashes them into `/assets` — while the
manifest names them unhashed, so every icon 404s. It survives a deploy because
nothing fetches a manifest icon until somebody installs the app. `mise run
cf:smoke` now follows the manifest to each icon.

**Notifications are three separate things, and it matters.** Following an object
(`subscription`), a reachable browser (`userNotificationChannel`), and a per-type
preference (`userNotificationPreference`) fail independently and are fixed
independently. No table was added for push — the PO's model already had all
three. Following is the opt-in; a preference row is how a reader turns one type
off.

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
