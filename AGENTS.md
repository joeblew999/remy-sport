# Project Context

<!-- CLAUDE.md and GEMINI.md are aliases for this file. -->

**Only the traps live here.** Anything you can get from `mise tasks`, from the
code, or from a ten-second grep has been deleted — prose rots and nothing checks
it, and this file loads into every session, so a stale line here becomes wrong
work rather than a confused reader. It has done exactly that twice.

What is left is the set of things that have already cost a real bug.

**Seeded sign-in on the deployment is a switch, and the admin is never on it.**
`mise run demo:on` publishes a fixed code so the seeded people can sign in
with one click — their addresses are `.test` and nothing delivers to them. The
seeded **admin** is excluded on any deployment: it holds ban, set-role and
impersonate, and impersonation is the one power that reaches a real person.
`cf:smoke` fails if it is ever offered, and `/api/dev/outbox` must stay 404 —
that one would expose everyone else's codes. It is a Worker secret not because
the value is secret (it is published to the browser and the page says so) but
because a secret flips without a redeploy. **`mise run demo:off` before the
platform has real users.**

**Adding a language is one pass, and Claude does the translating.** This is how
`ja` went from nothing to complete: read `messages/en.json`, write
`messages/<locale>.json`, check the placeholders, `mise run i18n:generate`.
Nothing else is set up and nothing else is needed — inlang's own editor and its
machine-translate CLI both exist, and neither is used here, so neither is
described here as if it were.

**`messages/en.json` is the only file written by hand.** Every other locale is a
translation of it, so a message is added once and translated once. All three are
`status: "released"` in the PO's model — `ja` was flipped in biz `a4d9c8c`, so
the caveat that used to live here, that no Japanese speaker had read it, is the
PO's to re-raise and not a standing warning.

**Placeholders are the failure mode nothing catches.** `check:messages` counts a
non-empty string as translated, so a translation that dropped `{days}` ships as
"Starts in days" and only a reader notices. Compare them when a locale lands —
every `{name}` in `en.json` must appear, spelled identically, in the translation.

**`check:i18n` catches the other half: a string that was never a message.**
`check:messages` cannot — it asks whether every locale has every message, and
answers 100% while hardcoded English ships. The ESLint rule walks the AST
instead. There is no suppressions file any more: it held the fixture copy on the
SAMPLE DATA screens, and those screens are real data now, so the ratchet was
paid off and deleted rather than carried.

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

## Open

Items with a live consequence. **Delete a line when it is done** — this section
had grown to twelve numbered entries, of which four described finished work, one
told the next session not to investigate a problem that had been fixed, and two
cited triggers that had already fired. A list nobody prunes stops being read.

1. **A per-object capability in a list is N queries, and the schedule has now
   exceeded a page.** This entry used to end "revisit when a schedule first
   exceeds a page". Measured 2026-08-30: `/api/games/gam_001` is 0.02s and
   `/api/games?eventId=evt_002` — 28 games — is **0.25s**, because `serialize`
   makes five `can()` calls and three queries per row. Roughly 220 round trips
   for one page.
   The fix is set-wise: every relation is derivable in SQL, so "which of these
   games may this user score" is one query, not N. `objectsHeldBy` in
   `src/api/relations.ts` is half of it already.
   **Do not fix it by moving the decision into the client.** That is the copy of
   the access matrix this file exists to prevent.
2. **`can()` results are named eleven different things on the wire.**
   `canEdit` ×13, `canEnterScore`, `canManageFixture` *and* `canManageFixtures`,
   `canBroadcast`, `canSetStatus`, `canInviteCoOrganizer`, `canCreateTeam`,
   `canManage`, `canWithdraw`, `canAssignReferee` — each invented at a call site.
   The model already has a vocabulary for this: ACTION codes. Same fix as item 1;
   a set-wise resolver has one natural shape to return.
3. **Three representations of every domain object, hand-synced.** `EventSchema`
   → `interface Event` → `toEvent()`. Adding `divisionNames` meant three edits
   and broke eleven tests at once, which is what `tests/helpers/api-fixtures.ts`
   now papers over. The view model should derive from the API type.
4. **An action can be about a *pair*, and the model can only name one object.**
   `REGISTER_TEAM_FOR_EVENT` named EVENT while every relation granting it is
   about a TEAM, so the check resolved `team_coaches.team_id = <an event id>`,
   matched nothing, and failed closed — no coach could register a team. Failing
   closed looks like a policy rather than a defect, which is why it survived.
   `check-tables.ts` enforces it now, and finding it exposed two more:
   `EDIT_PLAYER_PROFILE` and `RECORD_ATTENDANCE` are granted to HEAD_COACH and
   ASSISTANT_COACH, which are TEAM relations. **So a coach still cannot edit a
   player's profile** — a guardian can, since GUARDIAN is a PLAYER relation, and
   that half shipped 2026-08-30. Both are listed pair-by-pair as known
   exceptions and both need the Product Owner: they want "a coach of the team
   this player is on", which is PLAYER → player_teams → team_coaches, an
   object-side hop two joins deep where the derivations reach one.
5. **Reading a row back after a write is written out per procedure.** Both game
   writes end with the same `reload`; `orgs.update` has its own version,
   `teams.update` another, `players.update` a fourth. Four copies is past the
   point where it should be one helper on the base builder.
6. **`event.province_code` is the one `*_code` column with no constraint.** The
   others have a `.references()` or a drizzle enum; this has a comment. It was
   inert while only the seed wrote it — `events.update` got a GUI on 2026-08-30,
   so a typo can now become a row. Give it `.references(() => province.code)`
   next time that table is touched.
7. **Two things deliberately not built, so they read as choices.** Standings are
   one table per event rather than grouped by division — the division is on each
   row, and grouping is a page concern the day a league needs it. And there is
   no client-side error retry for failed writes: a refused write shows its
   reason and stays on screen, which is the honest behaviour while every write
   is a single request.

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

**The database is the source of truth, and a feature is not done until every
layer above it agrees. Three legs, all three required.**

A schema change is not finished when it compiles. It is finished when the data
exists, the API carries it, the GUI renders it, and each of those is either true
or written down as a decision. Anything else is a half-built feature that looks
finished, which is the failure this repo keeps producing.

**Leg 1 — every column has a declared fate.** For each column: which procedure
exposes it, which component renders it, or `internal` with a one-line reason.
22 of this schema's 282 columns are correctly reachable from nowhere — Better
Auth's unused OAuth fields, `description_en` on the vocabulary tables,
`notification_sent.sent_at` — so the rule cannot be "everything must be shown".
It is "nothing is undeclared". Same shape as `check:authz`, which has never
rotted precisely because of this: 35 procedures enforced by the model, 26
declared otherwise with a sentence each.

**Leg 2 — trace every change up to React, in writing.** When a table, a Drizzle
schema or a contract changes: name each field added, removed or altered, follow
it through procedure → output schema → view model → component, and write the
trace down rather than assuming it. Where a component does not render the new
intent, build it or declare it. `event.format_code`, `event.is_fiba_certified`
and `event.description` sat in the API rendering nowhere while the Rules tab
said "not built yet"; the `guardians` table had no API and no screen for months;
`event_venue` and `team_coach` the same. Every one was found by hand, late.

**Leg 3 — the seed must exercise what the GUI renders.** A renderer for a column
no fixture populates has never been seen working, and no test covers it. Measured
on 2026-08-30, five domain columns are NULL in every seeded row:

    event.description                     0 of 4
    event.org_id                          0 of 4
    playerTeam.to_date                    0 of 120
    userNotificationChannel.locale_code   0 of 15
    userNotificationChannel.secret        0 of 15

The Rules tab's description section was built the same day and always shows its
empty state. `toDevice()` returns null for every seeded channel, so the push
audience path has never run against seed data. Both looked complete and neither
had ever executed.

So: if you add a renderer for a column, the fixtures must give that column a
value. The fixtures live in **remy-sport-biz** — see the companion-repo section.
Adding a value there is a Product Owner change, and if the PO says no value is
realistic, that is the answer and the renderer should not exist either.

**A rule is a stopgap; the mechanism is a gate.** All three legs are enumerable
from the schema — 48 tables, 282 columns — so the real answer is a build-time
`Record<TableName, Record<ColumnName, Fate>>` that stops compiling when a column
appears with no decision, plus a seed-coverage assertion. Until that exists this
is what stands in for it, and a rule that has to be remembered is the same class
of thing that already failed.

**A slow test suite is a bug. Fix it, do not wait it out.**

This is a standing instruction, not a preference. If a tier takes longer than it
should, stopping to find out why is the work — it is never a detour from the
work.

The failure that produced this rule: the render tier went from thirteen seconds
to **a hundred and eighty-six** whenever a fixture drifted, and it stayed that
way for a whole session because nobody measured it. Passing runs still reported
thirteen seconds, so the output never looked wrong. The cost landed only on
failures, which is exactly when a fast loop matters, and it was simply absorbed
— run after run — as though three minutes were the price of a broken test.

The cause was an inherited default. This tier has **no network at all**:
`seedCache` answers every `/rpc` call with a 404 and fonts are blocked, so a
test is a page load and an assertion, and the slowest one takes under a second.
Playwright's default thirty-second timeout could therefore only ever apply to
something that was never going to appear. Six broken assertions, thirty seconds
each. It is now 15s per test and 5s per assertion, and a failing run costs
twenty seconds instead of a hundred and eighty-six.

Three things now make a repeat visible rather than absorbable:

- **Every tier prints its time against a budget, every run.** `budget · render:
  13.6s of 30s (45%)`. A ceiling nobody sees until it fails is a ceiling that
  fails once and gets raised; a number on every run is what makes a jump to 25s
  something you notice the day it happens.
  [scripts/check-budget.ts](scripts/check-budget.ts) holds the budgets, what
  each measured when it was set, and what dominates its time.
- **Both Playwright configs name any file over a threshold** — three seconds in
  the render tier, ten in e2e. The default is fifteen, which in a tier that runs
  in fourteen can never fire.
- **Every timeout is written down with the operation that justifies it**, rather
  than inherited. e2e keeps thirty seconds because it signs in through a real
  Worker against a real D1; the render tier cannot justify a second.

When a budget trips, find what got slower before raising the ceiling. A tier
allowed to creep is one nobody will ever speed up again.

**`mise run check` runs in two phases, and the split is not arbitrary.**
Everything cheap runs in parallel with the render tier; `test:worker` then gets
the machine to itself. Three of its tests ask the Worker for `/` and for the
hashed bundle, which go through Miniflare's *local* ASSETS server — and that
answers 404 when the box is busy. Paired with any single check it passes; run
against the whole group it fails every time. Cumulative load, nothing else.

That is local infrastructure, not product behaviour: on Cloudflare, ASSETS is a
platform service and cannot be starved by a laptop compiling TypeScript. So the
tests stay honest and the schedule works around them. Do not "fix" it with a
retry — that would hide a real 404 the day one appears.

`:::` is what separates tasks in `mise run a ::: b`. Without it mise takes
everything after the first name as *arguments to that task* and silently runs
one thing: the first attempt at this reported eight seconds and skipped every
test tier.

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

**Never invent a value for a field with no table.** Render `—` or "Venue TBC".

The `SAMPLE DATA` banner that used to be the escape hatch is gone, and so is
every screen that needed it — the invented live game, the bracket, the activity
feed, "Top performers". A banner made a fixture *admissible*, and what it
actually bought was a page that stayed fake for months because it was labelled.
If a field has no table, show nothing; if a section can only be filled by
invention, it is not a section yet.

Two of those could never have been real and were deleted rather than labelled: a
bracket needs rounds and seeds the model does not have, and "Top performers"
needs per-player statistics that exist nowhere. **A screen that cannot be filled
from the schema is a picture of a feature.**

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

**Which repo a change belongs in: could a person from the business disagree
with it?** If yes it is remy-sport-biz; if only an engineer could, it is here.
That rule is written down because I got it wrong on 2026-08-29 — a map of which
age groups and provinces the platform runs went into a script in *this* repo,
where the PO would never find it, and had to move to `PILOT_SCOPE`. The split
itself has never been the friction; re-deriving the boundary each time was.

|  | belongs in biz | belongs here |
|---|---|---|
| a user has a lifecycle | ✓ | |
| the `user` table has a `status_code` column | | ✓ |
| U16 and U18 are the pilot's age groups | ✓ | |
| suspended accounts are refused at session creation | | ✓ |
| who may enter a score | ✓ (GRANTS) | |
| how that grant is executed as SQL | | ✓ (relations.ts) |

`mise run data:coverage` reports the three ways the two can disagree: a code the
model defines and no fixture uses, a code outside `PILOT_SCOPE`, and — the one
that bites — **a field the fixtures carry that no column stores**. That last
found four on 2026-08-29, including a user lifecycle the model had always
described and the database had no room for, so the seed dropped it in silence.

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

## Decisions that look like omissions

**Do not install shadcn/ui + Tailwind.** `src/web/styles.css` is a design system
with an OKLCH token palette, not accumulated boilerplate: most of its classes are
used on exactly one page and are the bespoke product — live score cells,
standings rows, the team hero. shadcn would replace a handful of the shared ones
(`.btn`, `.badge`, `.dash-card`, a table, tabs) and has no component for any of
the rest.

Two specifics that outlast any measurement. `body`'s font-stack tail is
load-bearing — it is what renders Japanese, Korean and Chinese, and a declared
locale becomes tofu without it; Tailwind's preflight is a live hazard to that for
no gain. And shadcn's default look is the generic one, so adopting it trades a
deliberate identity for a downgrade.

**Four test tiers, and the rule for choosing one.** A test in the wrong tier is
slow for no reason, and the render tier exists so that asserting what a component
draws never needs a database.

| Asserts | Goes in |
|---|---|
| a pure function | `tests/unit/` — `mise run test:unit` |
| what the **API returns** | `tests/worker/` — `mise run test:worker` |
| what the **UI renders** given data | `tests/render/` — `mise run test:render` |
| a **real round trip** | `tests/e2e/` — `mise run test` |

If a test signs in only so a page will render, seed the cache instead —
`tests/helpers/seed-cache.ts`, and `tests/helpers/api-fixtures.ts` for the
payloads, which are typed against the real contract so a drifted fixture is a
compile error rather than a browser failure thirty seconds later.

**Do not "optimise the test runner".** A whole session went into storageState,
worker counts and project ordering and it stopped dead. What works is moving
tests to the right tier, merging worker files (~3s of workerd startup each), and
timeouts justified by the slowest legitimate operation in that tier. Measured and
not to be re-guessed: the render tier's cost was never `vite preview` — it starts
in 338ms; it was Google Fonts. More Playwright workers do nothing (6, 10 and 12
are all ~14s) and neither does more vitest parallelism (10.05s vs 10.02s).

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
