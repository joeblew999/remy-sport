# Project Context

<!-- CLAUDE.md and GEMINI.md are aliases for this file. -->

**Only the traps live here.** Anything you can get from `mise tasks`, from the
code, or from a ten-second grep has been deleted — prose rots and nothing checks
it, and this file loads into every session, so a stale line here becomes wrong
work rather than a confused reader. It has done exactly that twice.

What is left is the set of things that have already cost a real bug.

**Seeded sign-in on the deployment is a switch, and the admin is never on it.**
`mise run ops demo on` publishes a fixed code so the seeded people can sign in
with one click — their addresses are `.test` and nothing delivers to them. The
seeded **admin** is excluded on any deployment: it holds ban, set-role and
impersonate, and impersonation is the one power that reaches a real person.
`cf:smoke` fails if it is ever offered, and `/api/dev/outbox` must stay 404 —
that one would expose everyone else's codes. It is a Worker secret not because
the value is secret (it is published to the browser and the page says so) but
because a secret flips without a redeploy. **`mise run ops demo off` before the
platform has real users.**

**Adding a language is one pass, and Claude does the translating.** This is how
`ja` went from nothing to complete: read `messages/en.json`, write
`messages/<locale>.json`, check the placeholders, `mise run 2-check`.
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

**Never move or rename this directory while the dev server is running.** It
holds `.wrangler` and `project.inlang` open and recreates them at the old path
the moment they vanish — so a `mv` away and back lands the real repo *inside* a
husk the server just made, and `git` reports "not a git repository" from a path
that looks right. Recovered on 2026-08-31 by stopping the server, un-nesting and
deleting the husk; nothing was lost, because the move was a rename and not a
copy. `mise run 1-dev -- stop` first, or test against a copy.

**`mise run 1-dev -- ensure` — never `pkill`, never a bare `wrangler dev`.** It is
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
| `vite.config.ts`, `.dev.vars`, `mise.toml` | `mise run 1-dev -- restart` |

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
is a tax. Say it in the reply, and put anything that outlives the task beside
the code it constrains.

`mise tasks` lists everything and what each one does.

## Companion repo

[remy-sport-biz](https://github.com/joeblew999/remy-sport-biz) is the Product
Owner's source of truth, cloned at `../remy-sport-biz/`. Its `domain/model/` is
TypeScript, and [`mise run ops domain`](scripts/ops/domain.ts) copies it into
[src/domain/model/](src/domain/model/) **verbatim** — nothing transforms it.

**The model arrives one way: you run `domain:sync` here.** Nothing else should
change `src/domain/model/`, and if those files show as modified when you did not
run it, something outside this repo wrote to your working tree — check before
committing rather than after.

That is not hypothetical. On 2026-08-31 a session in the companion repo ran
`domain:sync` *here* and `git checkout --` over these files mid-feature; the
sync landed in an uncommitted tree and `git add -A` swept 196 lines of model
change into commit `ce6a233`, whose message says "nothing in the PO's model
changes". The companion repo has since written the matching rule on its side
(never write to this one). The habit that catches it from this side is reading
what `git status` lists before a broad `git add`, especially when a commit is
supposed to touch a known set of files.

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
requiring it would put a credential in every deploy. `mise run 2-check` verifies
they have not drifted.

**biz wins unless the code here says otherwise, with the reason in the commit.**

## Traps

**The database is the source of truth, and a feature is not finished until the
layers above it agree.** Data exists, API carries it, GUI renders it — each
true, or written down as a decision. When a schema or contract changes, trace
every changed field to the component that renders it, and build it or declare
why not. A renderer also obliges a fixture: a column no seeded row populates has
never been seen working. Measured 2026-08-30, five columns are NULL in every
seeded row, and one of them is `event.description`, whose section was built that
morning and has only ever shown its empty state.

Nothing enforces this yet, which is why it is written down. The mechanism would
be a gate over the schema — 48 tables, 282 columns are enumerable — and a rule
that must be remembered is the same class of thing that already failed.

**A render spec names a surface, not a route — and signs in as a seeded person.**
Moving the notification settings from the profile to `/#/devices` cost fifteen
edits across three specs, because a hundred and thirty `page.goto` calls knew
where things lived. They call `visit(page, "notifications")` now, so the same
move is one line in [tests/helpers/surfaces.ts](tests/helpers/surfaces.ts).

Identity was worse than duplicated, it was wrong. Ten specs each wrote their own
session object: one seeded `usr_org_001`'s id beside a fabricated email and a
*different person's* name, and four claimed `role: "user"`, which the model does
not have — so a spec asserting what a coach may do asserted it about somebody
nobody has heard of. `sessionFor(role)` reads `SEED_ENTITIES.users`, the same
people the worker and e2e tiers use.

Both are checked, because both are rules you would otherwise have to remember.
The exemption is `// check-ignore` on the line, and there are three: two specs
iterate `ROUTES` and one asserts the route a crash beacon *reports* — where the
route is the subject, name the route.

**A slow test suite is a bug. Fix it, do not wait it out.** Standing
instruction: if a tier takes longer than it should, finding out why *is* the
work.

The render tier once went from 13s to **186s** whenever a fixture drifted, and
stayed there a whole session because nothing measured it — passing runs still
reported 13s, so the cost landed only on failures, which is exactly when a fast
loop matters. The cause was an inherited default: that tier has no network at
all, so Playwright's 30s timeout could only ever apply to something that was
never going to appear. Now 15s per test, 5s per assertion, and a failing run
costs 20s.

Three things make a repeat visible: every tier prints its time against a budget
on every run ([scripts/check.ts](scripts/check.ts)); both
Playwright configs name any file over a threshold the tier can actually exceed;
and every timeout is written beside the operation that justifies it. **When a
budget trips, find what got slower before raising the ceiling.**

Measured, so it is not re-guessed: more Playwright workers do nothing (6, 10 and
12 are all ~14s), more vitest parallelism does nothing (10.05s vs 10.02s), and
the render tier's cost was never `vite preview` — it starts in 338ms; it was
Google Fonts. Nor does `isolatedStorage: false` help, and it costs per-file
isolation; nor does guarding the migration batch on the schema already existing,
because the cost is not SQL; nor does a committed `snapshot.sql` <!-- docs-check-ignore --> of the
seeded database, since `/api/seed` costs 99ms. What works is moving tests to the right
tier and merging worker files (~3s of workerd startup each). **Do not "optimise
the runner"** — a whole session went into storageState, worker counts and
project ordering and stopped dead.

**Four import rules, enforced by `mise run 2-check`.** The reasoning for each
sits beside it in [.dependency-cruiser.cjs](.dependency-cruiser.cjs), where the
failure quotes it. The one that actually happened: the Worker importing
`src/web` to send the sign-in email from the product's own messages, which
typechecks only by accident.

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
`mise run db -- generate` diffs [src/db/schema.ts](src/db/schema.ts) against the
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
`mise run 2-check` asserts it.

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

**A named environment declares everything it uses, and the policy table has to
know its name.** `--env staging` once existed while `wrangler.toml` declared no
such environment; wrangler only *warns*, so it would have deployed a second
worker bound to the **production** D1 and R2. There is now a real `[env.staging]`
with its own database, bucket, queues, dataset and hostname.

The hazard that replaces it is inheritance, and it is not symmetric. Bindings are
**not** inherited and wrangler names each missing one — loud, and staging simply
has no D1. `routes` and `triggers` **are** inherited: an `[env.*]` with no route
override resolves to production's hostname, so `deploy --env staging` publishes
onto the domain real people use. Wrangler warns about that when the inherited
route is a `custom_domain` and says **nothing at all** when it is an ordinary
route pattern — measured both ways, so the warning is not something to rely on.

`mise run 2-check` reads *resolved* config through wrangler's own reader —
never by parsing `wrangler.toml`, since the hazard is what the file does not say
— and fails if two environments share a worker name, route host, database,
bucket, queue or dataset, if an environment's `ENVIRONMENT` var disagrees with
the block it is in, or if `BETTER_AUTH_URL` points at a host that environment
does not serve. Every `[env.*]` must also be a member of `ENVIRONMENTS` in
`src/environment.ts`: an unrecognised name resolves to *production's* policy,
so a `[env.preview]` would quietly run with production's permissions while
believing it was something else.

**The dev tasks pass an explicit `--host` and must keep doing so.** With a
`[[routes]]` block, plain `wrangler dev` simulates that route and every request
arrives as `remy.ubuntusoftware.net`. The *value* is free: `mise run 1-dev` passes
the machine's LAN address so a phone on the same wifi can reach it, and sign-in
still works from localhost as well — `trustedOrigins` derives from the request
URL (`src/auth.ts`), so whichever host a request arrives on is trusted. Verified
by signing in over each in turn; note an OTP is single-use, so testing that by
hand fails on the second attempt as `INVALID_OTP` and looks like an origin
refusal. `mise run 2-check` asserts the flag is present.

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

**A spec that signs in for real belongs in a sequenced project, not beside the
others.** Two do: `authz`'s role switcher and `spa-login`. At `workers: 2` they
ran together and competed for the same seeded accounts' OTP codes — the badge
stayed on the previous actor and e2e reported 32 of 35. `authz` is its own
project depending on `e2e` now, the way `devices` already was, and three
consecutive full runs pass.

I first wrote this up as an occasional flake to re-run past, on the strength of
one isolation run. Measured over full runs it was two in three, which is a bug
and not a flake. **Count the failures before calling something intermittent.**

This note is here because I deleted the document that carried it. On 2026-08-29
`docs/dev/test-migration.md` <!-- docs-check-ignore --> was removed as stale — most of it was, and its
tier counts were four times wrong — but this went with it, and two days later I
spent a diagnosis rediscovering a flake somebody had already characterised. When
deleting a document, the known-defect list is the part to read twice.

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

`mise run ops coverage data` reports the three ways the two can disagree: a code the
model defines and no fixture uses, a code outside `PILOT_SCOPE`, and — the one
that bites — **a field the fixtures carry that no column stores**. That last
found four on 2026-08-29, including a user lifecycle the model had always
described and the database had no room for, so the seed dropped it in silence.

**Every procedure declares how it is authorised, and non-procedure routes are
inventoried.** `mise run 2-check` fails with the instruction attached.
`POST /api/seed` sat unauthenticated for months because nothing listed it.

**`can()` is the entire cost of a list, and it has no set-wise form.** Proven by
stubbing it: a 28-game schedule goes 0.23s to **0.01s**. Roughly five queries per
call, four calls per game, 112 for one page, re-resolving the same three GAME
relations each time. The fix is one query per relation for the whole set, then
every action answered in memory. **Do not fix it by moving the decision into the
client** — that is the copy of the access matrix this file exists to prevent.
Two wrong answers preceded the right one: the cause was asserted without
measuring, then a bad experiment (an anonymous request is equally slow) was read
as a disproof, when `can()` does not short-circuit for anonymous either. Stub
what you suspect; it took two minutes.

**An action can be about a *pair*, and the model can only name one object.**
`REGISTER_TEAM_FOR_EVENT` named EVENT while every relation granting it is about a
TEAM, so the check resolved `team_coaches.team_id = <an event id>`, matched
nothing, and failed closed — no coach could register a team. **Failing closed
looks like policy rather than a defect**, which is why it survived. `check-tables`
enforces it now; the two remaining exceptions (`EDIT_PLAYER_PROFILE` and
`RECORD_ATTENDANCE`, granted to coach relations about a TEAM) need the Product
Owner, so a coach still cannot edit a player's profile while a guardian can.

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
the question a notification asks. `mise run 2-check` enforces this for
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
`mise run 3-deploy` therefore generates a pair only when none exists and
never replaces one. A **half-pair is refused** rather than completed, because
completing it means rotating: `PUSH_SKIP=1` ships the deploy and touches
nothing (push is already off, and every subscription stays recoverable once the
missing half returns), `PUSH_ROTATE=1` accepts the loss. That all-or-nothing
rule is `decideSecrets` in `scripts/deploy/provision.ts`, and it guards
`BETTER_AUTH_SECRET` and the MoQ pair too — the same mistake would sign
everybody out, or half-configure video.

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
unused, run `mise run 2-check` first.

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
| a pure function | `tests/unit/` — `mise run 2-check` |
| what the **API returns** | `tests/worker/` — `mise run 2-check` |
| what the **UI renders** given data | `tests/render/` — `mise run 2-check` |
| a **real round trip** | `tests/e2e/` — `mise run 2-check -- --e2e` |

If a test signs in only so a page will render, seed the cache instead —
`tests/helpers/seed-cache.ts`, and `tests/helpers/api-fixtures.ts` for the
payloads, which are typed against the real contract so a drifted fixture is a
compile error rather than a browser failure thirty seconds later.

**Nothing is mocked in `tests/worker/`** — real Better Auth, real OTP, real D1
with the real migrations. Those tests assert authorization, and a mocked session
would assert only that the mock was written correctly.

All three tsconfigs are typechecked, `tsconfig.tests.json` included. Tests were
in none of them until 2026-08-30, so the compile-error promise above was not
kept by anything; adding a field to `ApiEvent` left the fixtures short of it and
the gate stayed green.

## Conventions

- **If you change your mind while building, re-read the section of this file it
  touches before you commit.** No tool enforces this and it is the rule that has
  already failed: commit `21213e6` planned a `translation` table, changed to a
  JSON column mid-implementation, shipped the better design, and left this file
  describing the table. A brief written from it later asked for code that had
  never existed.
- `mise run 2-check` before committing, not just `tsc`.
- Always `mise run`; never raw `bun`/`bunx wrangler` when a task exists. Tasks
  must be idempotent and work with no user args.
- Sessions should be **net-negative on lines**.
- Use well-known `autocomplete` attributes on form fields.

### Working out what is true

Five rules, each of which cost an hour or a retraction to learn.

- **Measure before naming a cause.** An endpoint took 0.23s and the cause was
  asserted, not measured: one of five `can()` calls was removed for a 4% gain,
  and the conclusion was built on. Stubbing `can()` settled it in two minutes —
  0.23s → 0.01s. `mise run ops time` and `mise run ops time` exist so this is the first
  move rather than the last.
- **Check the harness before believing the result.** More time has gone into
  wrong measurements than into slow code. `echo "exit=$?"` after `$(date)` reads
  *date's* status; `mise run a b` passes `b` as an argument, not a second task, <!-- docs-check-ignore -->
  so a "parallel" check ran one thing and skipped every test tier and reported
  green; `DEV_URL=… mise run ops time` measured localhost, because mise's own `[env]`
  wins. Each looked like an answer.
- **Test the disproof too.** A correct diagnosis was publicly retracted on the
  strength of one experiment whose premise was never checked. A result that
  contradicts a careful finding is a claim like any other.
- **Decide, don't ask.** Questions put to the user this session returned "not
  sure" and "I have no idea". Choose, say what you chose and why, and move; a
  wrong decision that is stated is cheaper than a question that stalls.
- **Nothing speculative.** A 282-column coverage file was written, declared to
  prove something, and deleted within the hour — it duplicated the schema and
  could not verify its own claims. If a document cannot fail, it is not evidence.
  The same goes for a type with no readers, a route nothing navigates to, and a
  cast that suppresses the error its file exists to raise.

## Further reading

There is almost none, on purpose.

- biz [domain/access/matrix.md](https://github.com/joeblew999/remy-sport-biz/blob/main/domain/access/matrix.md)
  — who may do what, generated from the model this repo syncs

**A step is named for what it runs, and nothing uses a colon or a space.** The
name is the file's stem, or the subcommand where it invokes one. This is checked
because nothing else could see it: typecheck, knip and check:docs all ask whether
a thing RUNS, and every one of them was green while `seed:order` kept a colon
from a mise task that no longer existed, `gui` ran coverage-gui, `vars` ran
dev-vars, and one step had a space in the middle of its name. Naming drift is
invisible to a gate that only executes things, so it took a person reading the
output — which is exactly the kind of thing that should not need a person.
