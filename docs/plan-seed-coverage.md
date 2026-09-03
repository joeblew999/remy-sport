# Plan — the seed is the product, and the tests read it

Kept, not deleted. The exception lists this plan builds are judgement calls —
"this column is empty on purpose" is a decision somebody will want the reason
for, and the reason belongs beside the list.

**Work it in a loop, and inspect yourself on every pass.** The plan is wrong
until proven otherwise. Four of the fourteen numbers below were wrong when first
written and were corrected by running the block that checks them, before any
work started.

Each pass, in this order:

1. **Re-derive the facts.** This exact block. If an asserted number differs from
   what this file says, **fix the file first**, note it in the log, then
   continue. A plan that disagrees with the code is worse than no plan.

   ```sh
   bun scripts/check/seed-coverage.ts   # tables, columns, and all 40 dependencies
   ```

   That was a 70-line block this file carried privately until Phase 1 landed.
   It is the gate now, so the plan no longer holds its own copy of a check — a
   document with a private measurement is the drift this file exists to prevent.

   What the gate does not cover is the test side, which Phases 5 and 6 close:

   ```sh
   bun -e '
   import { readdirSync, readFileSync, statSync } from "fs"
   import { join } from "path"
   const { SEED_ENTITIES: E, SEED_RELATIONSHIPS: R } =
     await import(join(process.cwd(), "src/domain/model/entities.ts"))
   const all = new Set()
   for (const t of [...Object.values(E), ...Object.values(R)])
     for (const r of t) for (const v of Object.values(r)) if (typeof v === "string") all.add(v)
   const files = []
   const walk = (d) => { for (const e of readdirSync(d)) { const f = join(d, e)
     statSync(f).isDirectory() ? walk(f) : f.endsWith(".ts") && files.push(f) } }
   walk(join(process.cwd(), "tests"))
   const ghosts = new Set()
   for (const f of files)
     for (const m of readFileSync(f, "utf8").match(/"(?:team|evt|ply|org|usr|gam|div|ven|ses)_[a-z]*_?\d+"/g) ?? [])
       if (!all.has(m.slice(1, -1))) ghosts.add(m.slice(1, -1))
   const render = files.filter((f) => f.includes("/render/"))
   const say = (l, n, says) =>
     console.log(`${l.padEnd(42)} ${String(n).padStart(4)}   (plan says ${says})${n === says ? "" : "   <-- DIFFERS"}`)
   say("render specs reading the seed",
     render.filter((f) => /domain\/model\/entities|helpers\/fixtures|helpers\/projections/.test(readFileSync(f, "utf8"))).length, 0)
   say("ids named in tests that no fixture defines", ghosts.size, 8)
   console.log("     " + [...ghosts].sort().join(", "))
   console.log("  entry() payloads in the render tier (moves; not asserted)",
     render.reduce((n, f) => n + (readFileSync(f, "utf8").match(/entry\(orpc/g) ?? []).length, 0))
   '
   ```

2. **`mise run 2-check`** before starting, not only after. This tree has had two
   sessions in it at once; a red gate you did not cause is worth knowing about
   before you attribute it to your own change.
3. **Do the next unticked box**, applying the decision rules rather than asking.
4. **`mise run 2-check`.** Green before ticking anything.
5. **Tick it, or write why not.** A box left unticked without a reason beside it
   is the failure this whole plan exists to correct.
6. **Append to the log** — what was done, what was found, what changed in the
   plan itself.

Never end a pass having neither ticked a box nor recorded why one cannot be
ticked. That is the only definition of progress here.

When every box is ticked, say so plainly and stop. There is no second exit —
see the standing authority under "Rules for this work".

## The problem, in one line

The seed is one deep instance of each kind of thing surrounded by husks, and the
tier that draws most of the screens does not read the seed at all — it makes its
data up.

## Who it hurts

Somebody opens the Chiang Mai camp on the demo. The camp is the one event type
whose entire feature is a timetable, and `eventSession` has **no rows** — so the
Sessions tab is empty, and it has been empty since the endpoint was built on
2026-08-31. The render test for that tab is green: it invents a session called
`ses_1` and calls the event "Bangkok Skills Camp", which is not the event's name
in any row. The seed says "Chiang Mai Summer Basketball Camp 2026".

Wichai coaches at Assumption, so he sees a team page with two coaches on it.
Eleven of the fifteen seeded teams have **no coach at all** — nobody who may edit
them, no roster owner, no test that a team page renders when the person looking
is not its coach. Eight of the ten schools have **no member**, so "who may act
for this school" has never been answered for eight of them.

## Why it happens

Three tiers, one seed, and only two of them read it.

| tier | asserts against | gets its data from |
|---|---|---|
| `tests/worker/` | the real seeded D1 | `src/db/seed.sql` — derived |
| `tests/e2e/` | the real seeded D1 | `src/db/seed.sql` — derived |
| `tests/render/` | a payload written by hand | `tests/helpers/api-fixtures.ts` and 126 inline literals — **invented** |

`mise run ops tiers` gives the weight: unit 208, worker 290, **render 200**, e2e
31. Two hundred assertions about what a screen says, across 24 spec files, every
one of them about data no database has ever held. It is also the only tier that
draws a browser without a backend, which is exactly why it is the biggest and why
it must stay that way — the fix is not to move it.

That is not a style problem, it is a feedback loop with a wire cut. **Because the
render tier does not read the seed, nothing forces the seed to be deep enough to
render from.** A spec that needed a camp timetable invented one instead of
noticing that no camp has one. Every invented payload is a hole in the seed that
got papered over instead of reported, which is why there are eight ids in the
test suite that name nothing.

And the invented values rot in the ordinary way. `apiEvent()` claims
`playedCount: 17` for `evt_002`. The fixtures say **21**. It typechecks, because
17 is a number.

The other half of why it went unnoticed is that the report we do have measures
breadth. `mise run ops coverage data` reads **80/80 vocabulary codes used, 25/25
relations instantiated** — a green wall. It is answering "does any row use this
code", which is a real question and not this one. Phase 4 has the example that
gives the game away: all four guardian rows are one person, holding all four
guardian types at once, because that is what makes the vocabulary line read 4/4.

## What that shape costs elsewhere

Three things, all of them already visible:

- **A renderer ships having never been seen with data.** AGENTS.md wrote this
  down on 2026-08-30 — "five columns are NULL in every seeded row, and one of
  them is `event.description`, whose section was built that morning and has only
  ever shown its empty state". Four days later it is **51 columns of 293**, and
  `event.description` is still one of them.
- **Growing the data breaks unrelated tests.** Five broke on 2026-08-28 because a
  league grew a fifteenth team. `tests/helpers/fixtures.ts` was written to stop
  that and is imported by **four files, all in the worker tier**. The render tier
  has no equivalent, and the worker tier still names 158 seeded ids across 13
  files — twelve per file.
- **A feature can be complete at every layer and still be invisible.** `POST`
  session, `DELETE` session, attendance, the tab, the permission check, the
  render test — all built, all green, and the product shows an empty list because
  the row was never the deliverable.

## The architecture

### The two halves are one problem

"Not enough data" and "tests not aligned with the data" look like two tasks. They
are one, and fixing either alone makes the other worse.

Fill the seed without changing the tests, and the render tier stays fictional
while the fiction drifts further from a now-richer truth. Rewrite the tests to
read the seed without filling it, and half of them fail immediately because the
rows they need do not exist.

The order that works is: **make the gap measurable, fill it, then point the tests
at it, then forbid inventing.** Each step is worth the one before it having
passed.

### The invariant

> **Every row a screen can reach exists in the seed, and every payload a test
> asserts against is derived from the seed.**

Two halves, and each one has a mechanism:

- *exists in the seed* — a gate over the schema. 51 tables and 293 columns are
  enumerable; a table with no rows or a column with no value is either a
  failure or a written exception.
- *derived from the seed* — projections in the render tier, proved against the
  real procedures in the worker tier.

### This job is half done already, and the done half is the proof

The render tier answers two questions on every test: **who is looking**, and
**what are they looking at**. The first was fixed a week ago and the second was
not.

Ten specs used to paste a session object inline, each inventing a user id and a
role — one seeded `usr_org_001`'s id beside a fabricated email and a *different
person's* name, and four claimed `role: "user"`, which the model does not have.
A spec asserting what a coach may do was asserting it about nobody. The fix was
`sessionFor(role)` in `tests/helpers/actors.ts`, which reads `SEED_ENTITIES.users`
— the same people the worker and e2e tiers use.

Count the two questions across the 24 render specs today:

| | specs |
|---|---|
| know **who** they are, from the seed | **14** |
| know **what they are looking at**, from the seed | **0** |

So this is not a new idea being proposed. It is the identical move, applied to
the other half of the same problem, and the argument for it was already accepted
and written down when it was about people. The counts, names and rows a page
draws are still invented exactly the way the identities used to be.

### The pattern for the second half, and its prior art

Pure functions over `SEED_ENTITIES`/`SEED_RELATIONSHIPS` that compute what a
procedure returns for a seeded id. `apiEvent("evt_003")` reads the fixtures
instead of restating them.

The obvious objection is that a projection is a second implementation of the
procedure, and a second implementation drifts. That objection is correct and this
repo has already answered it: `tests/worker/authz-equivalence.test.ts` keeps the
**pre-refactor** authorisation algorithm on purpose, as an independent oracle,
and asserts the two cannot disagree anywhere the fixtures can reach. Its
docstring says it is allowed to rot, and that a failure is the right outcome
because it means somebody has to say which is right.

Same shape here: for every (procedure, seeded id) a render spec uses, call the
real procedure against the seeded D1 and assert it deep-equals the projection.
A drifted count becomes a worker-test failure naming the field, instead of a
browser timeout thirty seconds later saying an element was not found.

**Facts derive; permissions stay stated.** `canEdit`, `canDefine`, `canDelete`
are the *subject* of most render specs — "offers the form to whoever may define
the schedule, and to nobody else". Deriving those would hide the thing under
test, and would need a database. So the projection computes names, joins and
counts, and the permission flags remain explicit arguments the spec chooses.

### A projection is smaller than it sounds

"Reimplement fifteen procedures" is the fear, and it is not what this is. Take
every field `apiEvent()` returns and ask where it comes from:

| kind | fields | what the projection does |
|---|---|---|
| row copy | `id`, `typeCode`, `startDate`, `orgId`, `timezone`, … | reads the fixture row |
| pivot | `name` | `pivot(names)`, the same call the generator makes |
| lookup by id | `organizerName`, `venueNames` | finds a row in another array |
| count | `teamCount`, `gameCount`, `playedCount`, `followerCount` | filter-and-length |
| fixed | `createdAt`, `updatedAt` | the generator's fixed timestamp |
| stated | `canEdit`, `canDelete`, `canInviteCoOrganizer` | an argument |

No business logic in any row of that table, and the count helpers already exist —
`gamesIn`, `teamsRegisteredTo`, `gamesFor` are in `tests/helpers/fixtures.ts`
today, used by four worker files. **The projection layer is that file grown up**,
not a new idea.

### Not every procedure is entity-shaped, and the ones that aren't stay written

That table describes `apiEvent`. Generalising from one procedure is how the cost
of this gets underpriced, so here is the whole list the render tier actually
seeds — 22 procedures, 126 calls:

```
events.get 21   teams.get 14   events.list 13   games.list 12   teams.roster 10
orgs.get 9      teams.list 8   events.entries 6  reference.list 4
events.invitations 4  events.sessions 3   venues.list 2   orgs.list 2
games.get 2     eventVenues.list 2   events.attendance 2   divisions.list 1
orgs.members 1  eventPlayers.list 1
                                             ── entity-shaped, ~113 calls

me.mine 6       players.mine 2   standings.list 1
                                             ── not, 9 calls
```

**`standings.list` is not projectable and must not be projected.** It is 126
lines of aggregation over games plus a ranking rule with two tiebreaks, and it is
derived rather than stored on purpose. A projection of it would be a second
implementation of the league table — the one place in this plan where the
duplication would be real business logic rather than a row copy.

So it keeps a hand-written payload, and that is correct rather than a compromise:
a render spec about standings asks *how the table draws*, and whether the numbers
are right is a worker-tier question against real data. **Project the entity
payloads; prove the computed ones where they are computed.**

`me.mine` and `players.mine` are the third case: projectable in principle, but
they resolve relations, and duplicating `objectsHeldBy` here would collide with
`docs/plan-ownership.md`, which is actively building that surface. Leave them.
**Nine of 126 calls stay hand-written, and each has a reason.**

There is exactly one exception, and it is worth knowing before starting.
`eventDivision` is not a fixture table: `scripts/lib/seed.ts` derives it from
`eventTeams`, because the PO's model has no such list. A projection computing
`divisionNames` would be the **third** implementation of that derivation — the
generator, the procedure, and itself.

So: **derive it once and import it in both places.** A repo-local module, since
`src/domain/model/` is copied verbatim from biz and nothing here may edit it. If
a second derivation like this appears, it goes to the same module rather than
being written twice — and if one is written twice anyway, the equivalence test is
what says so.

### Options considered

Three, one of them a deletion.

- **Record the real responses into a generated fixture file.** Run the worker
  once against a seeded D1, dump each procedure's answer, commit it, import it.
  No second implementation and no drift. **Cost:** a generated artifact and a
  transform between the model and the tests — precisely the shape this repo
  deleted on 2026-08-27 (42 JSONL files, a 900-line generator, and every silent
  failure of that day living inside the transform). AGENTS.md says "Never write a
  transform between the two". The diff would also be unreviewable. **No.**
- **Delete `tests/helpers/api-fixtures.ts` and move those assertions to e2e.**
  One tier, real data, nothing to keep honest. The only option with no second
  implementation, which is why it is here. **Cost:** the render tier is ~13s and
  e2e is ~50s and needs sign-in; this trades the fast loop for correctness, and
  AGENTS.md is flat that a slow tier is a bug rather than a price. **No** — but
  if the projections turn out to cost more than they catch, this is the fallback,
  not a third design.
- **Projections proved by an equivalence test.** **Cost:** a second
  implementation of the shaping for roughly fifteen procedures — the ones the
  render tier actually seeds, not all 74. Checked duplication, which is the trade
  `authz-equivalence` already took deliberately. **Chosen.** What I am accepting
  by choosing it: two places to edit when a procedure's output shape changes, and
  a worker test that gets slower as the render tier grows.

### What this does not do

It does not make the render tier hit a database, and it must not. There is no
network in that tier by design, and `tests/helpers/seed-cache.ts` exists to keep
it that way. A projection is a synchronous function over an imported constant;
if one ever needs `await`, it has become the wrong thing.

It does not fill columns for the sake of the number. `account.access_token` has
no value because there is no OAuth provider, and writing one would be inventing
a fact — the thing AGENTS.md forbids most plainly. Every hole is closed *or*
declared, and a declaration with a reason is a pass.

## Which repo each change belongs in

### The seeding is here. The rows are not.

This is the thing to get straight before reading the table, because the obvious
assumption is wrong in a reasonable way. "The PO owns the model, we do the
seeding" is half true, and the half that is false is the half this plan is about.

| | where it lives |
|---|---|
| the schema — 51 tables, 293 columns | here, `src/db/` |
| the generator that turns rows into SQL | here, `scripts/lib/seed.ts` |
| the generated SQL, committed | here, `src/db/seed.sql` |
| **the rows themselves** | **biz**, `domain/model/entities.ts` |

`src/domain/model/entities.ts` is **byte-identical** to
`../remy-sport-biz/domain/model/entities.ts` — `mise run ops domain` copies it
verbatim and `mise run 2-check` fails if it has drifted. Nothing in this repo may
edit it. So the 119 named players, the four events with their dates, the ten Thai
schools and the fourteen people are all *upstream*, and every machine that turns
them into a database is *here*.

The name is what misleads. `domain/model/` sounds like it holds the shape of
things, and beside it `vocabularies.ts` does exactly that. But `entities.ts` in
the same directory is not a shape — it is 558 lines of named Thai teenagers. Add
a coach and you are editing the PO's file, through their repo, and syncing.

### The seed serves two masters, and that is the real tension

It is the demo's content *and* the test suite's fixtures, and those want opposite
things. Content wants believable and sparse. Fixtures want every edge case
present. **The guardian row is what happens when one file serves both**: one
person who is a PARENT, GRANDPARENT, LEGAL_GUARDIAN and OTHER at once is perfect
coverage and an absurd family.

Splitting them was considered and refused. A repo-local overlay of edge-case rows
on top of the PO's content would give each master what it wants — and it would
mean two definitions of "seeded", when the thing that makes the current design
sound is that `/api/seed` and the worker tests execute *the same bytes*.

So the rule, and it decides several boxes in Phase 4: **the seed is the PO's
content, and a test that needs an edge case asks for it as content or does
without.** That is why "leave one team coachless" is written as a decision about
a real unclaimed team, not as a test hook.

### The table

The rule is AGENTS.md's: could a person from the business disagree with it?

| change | repo |
|---|---|
| the Chiang Mai camp runs four sessions, and here is what they are | biz |
| who attended each session | biz |
| this school has a director; that one does not | biz |
| a player who left a team in March | biz |
| the ban reason on a suspended spectator | biz |
| `eventSession` is missing from `FIXTURE_TABLES` | here |
| the seed generator emits no INSERT for it | here |
| the gate that fails when a column has no value | here |
| the projections and the equivalence test | here |

Everything in the top half is `../remy-sport-biz/domain/model/entities.ts`,
arriving through `mise run ops domain`. Nothing in this repo writes
`src/domain/model/`. The companion is cloned at `../remy-sport-biz`, so the
biz-side edits are doable in the same session — but they are commits in that
repo, and the sync is what brings them here.

## Rules for this work

### Decide for the Product Owner. That is granted, not assumed.

Standing authority, given 2026-09-03: **there is no "Needs the PO" in this plan.**
An earlier draft deferred four items — a showcase's fixtures, a suspended
spectator's ban, avatar images, and the shape of the camp's timetable — and every
one of them is a decision somebody can make now and state.

AGENTS.md already said this and the first draft ignored it: *"Decide, don't ask.
Questions put to the user this session returned 'not sure' and 'I have no idea'.
Choose, say what you chose and why, and move; a wrong decision that is stated is
cheaper than a question that stalls."*

**What that does not license.** Two rules survive intact, and they are about
different things:

- **Authoring is fine; fabricating is not.** The seed is already fiction —
  Thanakorn Suksai is not a real person, and Assumption's U16 roster is invented.
  Writing a coach's name for `team_005` is more of the same, and is now a
  decision to make rather than a question to raise.
- **A value that breaks at runtime is not a judgement call.** `user.image` set to
  a URL at a host that does not exist renders a broken image in the demo, which
  is worse than the fallback it replaced. That is not the PO's call and never
  was — it is a defect wearing a decision's clothes. The same goes for a push
  endpoint, a verification secret, or anything else minted by a live system.

So: decide, write the reason beside it, and move. If a decision turns out to be
wrong, the PO changes one row in their repo — which is far cheaper than the
screen that stayed empty for a week waiting to be asked about.
- **Names are `names`, and there is no `nameTh`.** A new named row carries `th`
  and `en` at minimum, and `ja` where the existing rows have it.
- **A column filled is a screen to check.** Filling `event.description` means
  opening the event page and confirming the section renders. A column with a
  value and no reader is the same defect pointing the other way.
- **Delete an exception line in the same commit that fills the hole.** An
  exception list that only grows is a suppressions file, and this repo paid one
  of those off already.
- **`mise run 2-check` before committing**, not just `tsc`.
- **Sessions net-negative on lines** where they can be. Phases 5 and 6 should
  delete more than they add — 126 hand-written payloads is the budget.

## Running unattended

### Decision rules, in priority order

1. **If the model already says it, the model wins.** A camp has sessions because
   `eventSession` exists and `src/api/events.ts` reads it. Do not re-litigate.
2. **If a hole can be closed by reasoning from a neighbour, close it.**
   team_005 has no coach and team_001 has two; the schools are real and the coach
   role vocabulary has three values. That is a fixture, not an invention.
3. **If a hole needs a fact nobody has, declare it.** Write the exception with
   the reason and move on. Do not stall.
4. **A new fixture field is a biz commit; a new column is a stop.** These look
   alike and are not. `event.description` needs a *field* added to the PO's
   entities for a column that already exists — that is a commit in biz, a
   `mise run ops domain`, and carry on. A hole that needs a column the schema does
   not have is a migration and a model change: record it and stop. Getting this
   backwards stalls Phase 3 on its second box, or ships a migration nobody asked
   for.
5. **If a test fails because the data grew, the test is wrong.** That is the
   whole premise. Fix it by deriving, per `tests/helpers/fixtures.ts`.
6. **If the gate and the plan disagree, the gate wins** and this file gets fixed.

### The bound, so this actually finishes

Every phase counts down an enumerable list, and the lists are named here so a
pass can tell whether it is nearly done:

| phase | the list | length today |
|---|---|---|
| 1 | steps in `scripts/check.ts` measuring the seed | 1 |
| 2 | domain tables with no rows | 6 |
| 3 | columns never non-null | 51 |
| 4 | parent → child edges with no declared expectation | 39 |
| 5 | procedures the render tier seeds by hand | ~15 |
| 6 | ids named in tests that no fixture defines | 8 |

Total: **120 items**, each either closed or declared. There is no phase whose size
is discovered as it runs.

Phase 4 was "5 invariants" until pass 5 replaced the hand-picked list with the
schema's own 39 foreign-key edges. That is the single biggest change the plan has
had, and it went the direction these always go: the honest number is larger.

### What stops the loop

- Every box ticked. Every one of them is decidable; see the standing authority.
- A hole that needs a schema change — record it, do not build it.
- The gate green with an exception list every line of which has a reason.

## Order, and what depends on what

```
Phase 1  the measurement becomes a gate      ── nothing else can be called done
   |
Phase 2  every model table has rows          ── 6 empty tables, 2 of them the model's
   |
Phase 3  every column has a value            ── needs 2, because a new table's columns count
   |
Phase 4  depth: nothing exists alone         ── needs 2 and 3, or it fills husks with husks
   |
Phase 5  the render tier reads the seed      ── needs 2-4, or the projections have nothing to project
   |
Phase 6  no test may name a thing that isn't ── needs 5, or it fails on payloads nobody has moved yet
```

## Phase 1 — the measurement becomes a gate

AGENTS.md already names this mechanism and says nothing enforces it: "The
mechanism would be a gate over the schema — 48 tables, 282 columns are
enumerable — and a rule that must be remembered is the same class of thing that
already failed." It is **51 tables and 293 columns** now. The sentence went stale
in four days, which is itself the argument for making it a gate rather than a
paragraph.

`scripts/ops/coverage-data.ts` reports vocabulary coverage and reports it well —
80/80 codes, 25/25 relations. It does not ask whether a table has rows or a
column has a value, which is why both went unmeasured while the report read 100%.

### The report is one-directional, and the missing direction is where the holes are

Its last section asks: **which fixture fields have no column?** It answers
"none — every field the fixtures carry has a column", and that is true.

It never asks the opposite: **which columns have no fixture field?** There are
**19**, and once the generator's synthesised ones are set aside — `name` from
`names`, `created_at` from the fixed timestamp, `role` through `STORED_ROLE`,
`biz_id` from the id — **seven are genuine**:

```
user                     image, banned, ban_reason, ban_expires
event                    description
userNotificationChannel  secret, locale_code
```

That is not the same question as "is this column null". A null column might just
need a row filled in. These seven **cannot be filled at all** without a model
change, because nothing upstream carries the value — which is why
`event.description` survived being named in AGENTS.md. Somebody would have had to
add a field to the Product Owner's model to close it, and the report they were
reading said the fixtures and the schema agreed.

Both directions, then. A column with no fixture field is a different finding from
a column with no value, and it goes to a different repo.

- [x] A per-table and per-column pass, reading `src/db/seed.sql` — the bytes the
      database receives, not a second model of them.
- [x] The missing direction: columns no fixture field feeds, minus the ones the
      generator synthesises, with the message saying which repo the fix is in.
- [x] The dependency graph, derived from the schema's own foreign keys. Forty
      edges, each with `every` / `some: n` / `none` and a reason.
- [x] An exceptions list with a reason per line. Three tables and nine columns.
- [x] Fail on anything *not* declared.
- [x] Wired into `scripts/check.ts` as `seed-coverage`, beside `seed-order`.
- [x] Step 1 of the loop is now the gate, not a block this file carries.

**It went in `scripts/check/seed-coverage.ts` rather than into
`mise run ops coverage data`**, which is what this plan said. The distinction the
repo already draws: `scripts/ops/` is where you go for a number,
`scripts/check/` is where things fail. This fails, so it is a check. The
vocabulary report keeps its own job and neither duplicates the other.

**Done when** `mise run 2-check` runs it, a deliberately-unfilled new column
fails it, and every exception carries a sentence.

## Phase 2 — every model table has rows

Six tables have none. Two are the model's and four are not:

| table | verdict |
|---|---|
| `eventSession` | **the model's.** A camp's timetable. Seed it. |
| `sessionAttendance` | **the model's.** Who turned up. Seed it. |
| `gameBroadcast` | exception — runtime bookkeeping for MoQ, written when somebody starts a broadcast |
| `notification_sent` | exception — the scheduler's idempotency record, and its docstring says so |
| `session` | exception — Better Auth, written at sign-in |
| `verification` | exception — Better Auth, written when a code is issued |

`eventSession` and `sessionAttendance` are absent from `FIXTURE_TABLES` in
`src/db/fixtures-schema.ts`, so the seed generator has no path to them at all.
That absence is the whole bug: the endpoints, the tab and the render spec were
all built against a table the seed could not reach.

- [x] biz: sessions for `evt_003`, the Chiang Mai camp. Four or five over its
      2026-04-15 to 2026-04-19 window, in `Asia/Bangkok`, at `ven_003` — the
      venue `eventVenues` already gives it. Times a parent could act on.
- [x] biz: attendance rows against those sessions for the three players already
      registered to `evt_003` via `eventPlayers` — `ply_001`, `ply_004`,
      `ply_006` — with at least one of them absent from at least one session. An
      attendance table whose every row says yes has not been tested.
- [x] here: add both to `FIXTURE_TABLES` and `FIXTURE_SCHEMAS`.
- [x] here: INSERT blocks in `scripts/lib/seed.ts`, ordered after `event`,
      `venue` and `player`.
- [x] Declare the other four in Phase 1's exception list.
- [ ] Open the camp's Sessions tab in the running app and read it.

**Done when** the block reports zero undeclared empty tables and the camp's
timetable renders from the database.

## Phase 3 — every column has a value

51 of 293, in three groups — and the groups matter more than the number, because
they go to different places.

**The split is exact, and most of it is documentation rather than data:**

| | columns | what happens |
|---|---|---|
| filled | **15** | 9 arrive with Phase 2's two tables; 6 are real fills |
| declared | **36** | 27 in the four runtime tables, 7 in `account`, plus `user.image` and `userNotificationChannel.secret` |

Worth sitting with before starting: **two thirds of "every column has a value" is
writing down why a column correctly has none.** Nobody should start Phase 3
expecting to author 51 columns of data — the work is 6 real fills and 36
sentences, and the sentences are the part that stops the next empty column from
being an accident.

**Fillable here and now — the field exists and every row is null:**

- [x] `playerTeam.to_date` — 0 of 120. Nobody has ever left a team, so "former
      player" has never rendered and `teams.removePlayer` returns a field
      `coverage-gui` says no screen names. One player who left mid-season, in
      biz's `playerTeams`. This is the only hole in the whole phase that needs
      nothing but a value.

**Needs a field in the PO's model first** — these are the seven from Phase 1, and
each is a commit in biz before it is a row:

- [x] `event.description` — named in AGENTS.md on 2026-08-30; its section has
      only ever shown an empty state. Add the field, then at least one event with
      a description and at least one without, or the empty state stops being
      covered.
- [x] `userNotificationChannel.locale_code` — email locale is a feature with a
      written rule about `Accept-Language`, and no seeded channel has a locale.
      A channel whose owner reads Thai.
- [x] `user.image` — **Decided: declare it, do not fill it.** Not because nobody
      can choose, but because there is nowhere to point a URL. A seeded avatar at
      a host that does not exist renders a broken image on every screen showing
      that person — strictly worse than the fallback it replaced. The exception
      line reads: *no image hosting exists; the fallback is the product's only
      path today, and a seeded URL would be a defect rather than a fixture.*
      Revisit when there is a bucket to put one in.
- [x] `user.banned`, `ban_reason`, `ban_expires` — **Decided: ban
      `usr_spectator_002`**, the person already carrying `status_code`
      `SUSPENDED`. The admin console's ban is built and has never rendered
      against a banned row.

      These stay two mechanisms and the seed must say so in the same breath:
      `banned` is Better Auth's and stops a sign-in; `status_code` is the domain's
      lifecycle. This row is one person where both happen to be true, which is
      what you would want of a suspended account — it is **not** an assertion that
      one implies the other, and nothing should derive one from the other.

      **Checked, so the next person does not have to.** `auth.setup.ts` saves a
      session per seeded address, but `EVERY_SEEDED_ACTOR` in
      `tests/helpers/auth.ts:257` already filters out SUSPENDED and DEACTIVATED —
      so no session is ever saved for `usr_spectator_002` and banning them cannot
      break the e2e tier.

      It also lands somewhere useful. `tests/worker/write.test.ts:124` already
      asserts the *domain* refuses a SUSPENDED account. Nothing asserts that
      Better Auth refuses a **banned** one, because no row is banned. So this
      fills a column and covers a mechanism in the same commit — which is the
      test the exception list is supposed to apply to every fill.
- [x] `userNotificationChannel.secret` — declare. A verification secret is minted
      at verification time and a fixture one would be a lie about a live value.

**Declare — with the reason on the line:**

- [x] `account.access_token`, `refresh_token`, `id_token`, `*_expires_at`,
      `scope`, `password` — no OAuth provider, and `emailAndPassword` is off.
- [x] the four runtime tables' columns, from Phase 2.
- [x] the remainder, one line each. Anything that resists a one-line reason is a
      column somebody has not understood yet — read the table's docstring and the
      code that writes it, then write the line. A longer sentence is not the
      answer and neither is deferring it.

**Done when** the count is zero-or-declared, each fill has been looked at on
screen, and the biz-side items are either landed or listed for the PO with what
each one unblocks.

## Phase 4 — depth: nothing exists alone

Breadth without depth is the seed's actual shape: one fat instance per kind and
husks around it.

### "All the way down" is a question the schema already answers

The first draft of this phase listed five invariants I had picked by reading the
data. That is the same mistake as the guardian row one level up — a hand-chosen
set of checks, which is exactly what "coverage" is supposed to replace.

**The schema knows what depends on what.** There are **66 foreign keys**, and
narrowed to the nine entity tables a person actually looks at, **39 parent → child
relationships**. Each one is a question: *of the rows in the parent, how many have
the thing that hangs off them?*

Measured today, **6 of 39 are complete for every parent row**:

```
  0%  event -> eventSession (0/4)      0%  player -> sessionAttendance (0/119)
  0%  game -> gameBroadcast (0/29)     0%  user -> session (0/14)
  3%  player -> eventPlayer (3/119)    3%  player -> guardian (4/119)
  7%  user -> guardian (1/14)         14%  user -> gameReferee (2/14)
 14%  user -> player (2/14)           14%  user -> eventCoOrganizer (2/14)
 20%  org -> org_member (2/10)        21%  user -> event (3/14)
 21%  user -> org_member (3/14)       21%  user -> teamCoach (3/14)
 27%  team -> teamCoach (4/15)        29%  user -> subscription (4/14)
 30%  org -> event (3/10)             36%  user -> userNotificationPreference (5/14)
 50%  event -> eventCoOrganizer (2/4) 50%  event -> eventPlayer (2/4)
 50%  event -> game (2/4)             50%  division -> eventTeam (3/6)
 50%  division -> eventDivision (3/6) 64%  user -> userNotificationChannel (9/14)
 73%  team -> game (11/15)            75%  event -> eventDivision (3/4)
 75%  event -> eventTeam (3/4)        75%  venue -> eventVenue (3/4)
 75%  venue -> game (3/4)             80%  team -> game (12/15)
 90%  org -> team (9/10)             100%  user -> account (14/14)
100%  team -> eventTeam (15/15)      100%  event -> eventVenue (4/4)
100%  game -> gameReferee (29/29)    100%  player -> playerTeam (119/119)
100%  team -> playerTeam (15/15)
```

### 100% is the wrong target, and that is the point

Most of those low numbers are correct and must stay low. Only some users are
players — `user -> player` at 14% is the model being true, not a hole. Only
organisers organise. `user -> session` is written at sign-in and belongs at zero.
119 children do not all attend one camp in Chiang Mai.

So the target is not a percentage. **Each of the 39 edges gets a declared
expectation**, and there are only three kinds:

| expectation | meaning | example |
|---|---|---|
| `every` | every parent row has at least one | `team -> teamCoach` |
| `some: n` | at least n parents do, and that is deliberate | `user -> player`, n=3 |
| `none` | zero by design, with the reason | `user -> session` |

That is the same ratchet as the column gate, on the other axis: **39 questions the
schema asks, each with a written answer, and a new foreign key arrives as an
unanswered one.**

- [x] Derive the 39 edges from the drizzle schema's foreign keys — never a
      hand-maintained list, or it is the five invariants again with more steps.
- [x] Give each an expectation and a reason. This is the bulk of the phase and it
      is mostly *reading*, not writing data.
- [x] Fail on an edge with no expectation. Report on ones that miss theirs.
- [x] Then fill what the expectations say is missing.

### The ones already known to need filling

These are the edges whose expectation is plainly `every` and plainly unmet, so
they can be started before the full 39 are triaged:

### The seed is not small, it is lopsided

434 fixture rows. **239 of them — 55% — are players and their team memberships**:
119 players, 8 per team, each on exactly one team, 2 with an account, 4 with a
guardian, none who ever left. The largest thing in the seed is also its most
uniform, and it is uniform because a player is the cheapest row to write.

Everything the product is actually about is in the other **195**: 4 events, 10
orgs, 15 teams, 14 users, 4 venues, 6 divisions, and the links between them.

So this phase adds roughly 35 rows and that is not a rounding error — it is the
non-player half growing by a fifth. **The corollary is a rule: this plan adds no
players.** If a box here can be satisfied by writing more of the cheap row, it
has been read wrong.

- [x] **Every team has at least one coach, bar one.** 11 of 15 have none.
      Consequences: no roster owner, and no test that a team page renders for
      somebody who is not its coach — the common case and the untested one. Leave
      **one** team coachless on purpose and say which: an unclaimed team is a real
      state, and a screen that has only ever drawn a coached team will break on
      the first school that signs up before its staff do.
- [x] **Every org has at least one member.** 8 of 10 have none, so the ORG
      relations resolve against two schools out of ten.
- [ ] **Every event that runs games has at least two.** `evt_001` has one — a
      standings table built from a single game proves nothing. `evt_003` is a camp
      and correctly has none; Phase 2 gives it sessions instead.

      ~~**Decided: a SHOWCASE runs exhibition games, so `evt_004` gets two.**~~
      **Reversed on contact with the data — see above.** A
      showcase exists to put players in front of scouts, and players are watched
      playing — it already carries `eventPlayers`, and two teams, and nothing to
      do with them. The value beyond realism is that it exercises the schedule for
      a non-league event type, which nothing does today: 28 of the 29 seeded games
      belong to one league. If the PO says a showcase is drills and interviews,
      it is one row to delete.
- [x] **Every user has a notification channel and a preference.** 5 users have no
      channel, 9 have no preference. Three separate mechanisms that fail
      independently — following, reachability, per-type preference — and most
      seeded people exercise none of them.
- [x] **A second player with an account, and a second guardian.** 2 of 119 players
      have a user account. All four guardian rows are the **same person**,
      `usr_spectator_001`, who is simultaneously a PARENT, a GRANDPARENT, a
      LEGAL_GUARDIAN and an OTHER to four different children.

      That row is worth staring at, because it explains the whole plan. It exists
      to use all four `GUARDIAN_TYPE` codes, and it succeeds — `coverage data`
      reports GUARDIAN_TYPE 4/4 ✓. It is also not a family anybody has. **The
      fixtures were written to satisfy the report, and the report was measuring
      the wrong thing.** Two or three guardians across two or three households,
      and let the vocabulary count fall where it falls.

Two more worth stating and *not* fixing, so they are decisions rather than
oversights:

- `evt_002` having 15 teams and 28 games while the others have 3/1 and 2/0 is
  **correct**. A league is bigger than a showcase. The fix is not to flatten it.
- `aTeamWithNoGamesIn` in `tests/helpers/fixtures.ts` throws if every registered
  team has played, because the registered-but-unplayed case is one a standings
  table must handle. Phase 4 must not close that hole — `team_015` stays
  gameless on purpose, and the helper is what will tell you if you break it.

**Done when** the five invariants hold and each has an assertion somewhere that
fails if it stops holding. An invariant enforced only by this document is one
that lasts until the next person adds a team.

## Phase 5 — the render tier reads the seed

126 hand-written payloads across 18 specs at the time of writing, none of which
reads the fixtures. The number moves as other work lands, which is why the block
prints it rather than asserting it — what matters is that it reaches zero for
seeded data.

- [ ] `tests/helpers/projections.ts` <!-- docs-check-ignore --> — pure functions
      over `SEED_ENTITIES`/`SEED_RELATIONSHIPS` producing each procedure's data
      fields for a seeded id. Typed by the real contract, as
      `tests/helpers/api-fixtures.ts` already is, with **no cast** — that file's
      docstring records what `as ApiEvent` cost the last time.
- [ ] Permission flags stay explicit arguments. Say so in the docstring, because
      the next person will try to derive them.
- [ ] `tests/worker/projection-equivalence.test.ts` <!-- docs-check-ignore --> —
      every (procedure, seeded id) the render tier uses, called against the real
      seeded D1 as a stated actor, deep-equal to the projection minus the
      permission fields. Model it on `tests/worker/authz-equivalence.test.ts`,
      including the note about which side is the oracle.
- [ ] Move the specs over, largest first: `tests/render/team.spec.ts` (24),
      `tests/render/schedule.spec.ts` (16), `tests/render/org.spec.ts` (16).
- [ ] Reduce `tests/helpers/api-fixtures.ts` to the cases that are genuinely not
      about seeded data — a crash payload, a no-backend empty state — or delete
      it. `playedCount: 17` where the fixtures say 21 goes away by construction.

### The worker tier is half of this and was missing from the plan

Phase 5 was written as if the render tier were the whole problem. It is not.
The worker tier names **158 seeded ids across 13 files** — twelve per file — and
`tests/helpers/fixtures.ts`, which exists precisely to stop that, is imported by
**four** of them.

It is a smaller job than the render tier because the worker tier reads the real
database, so its ids are at least *real*. What it hardcodes is arithmetic: a
count, a list, a "these three teams". That is the fragility the user asked about,
and it is the failure that actually happened — five tests broke when a league
grew a fifteenth team, none for a reason connected to what they tested.

- [ ] Every count or list a worker test states goes through a helper in
      `tests/helpers/fixtures.ts`. Naming `team_001` because the test is *about*
      `team_001` stays fine — that is the existing rule, not a new one.
- [ ] Grow that file as the specs need it, rather than adding a second one.

**Done when** every render spec asserting seeded *entity* data imports a
projection, the equivalence test covers each procedure they use, and no test in
any tier states a number the fixtures compute. The nine calls to
`standings.list`, `me.mine` and `players.mine` stay written, with the reason on
the line — that is a pass, not a remainder.

## Phase 6 — no test may name a thing that isn't

Eight ids in the suite name nothing: `evt_999`, `gam_050`, `gam_051`, `gam_101`,
`gam_102`, `ses_1`, `usr_nobody_000`, `ven_009`.

Some of those are correct. `usr_nobody_000` is the point of the test it is in,
and `evt_999` is a not-found case. The rest are inventions standing in for rows
that should exist — `ses_1` is the camp session Phase 2 seeds, `ven_009` is a
venue nobody added.

- [ ] A check in `scripts/check/` <!-- docs-check-ignore --> that fails when a
      test names a fixture-shaped id no fixture defines. Same shape as the
      existing testid and route checks, and the same escape hatch: `// check-ignore`
      on the line, for the deliberate non-existents only.
- [ ] Add it to `scripts/check.ts`.
- [ ] Every remaining ghost is either seeded or carries `// check-ignore` with a
      reason.

**Done when** a spec that invents a row fails the gate instead of passing
against fiction.

## Definition of done, whole job

The user's two conditions, made executable.

**"All data, and the data that relies on other data, is complete."**

- [x] `mise run ops coverage data` reports **0 undeclared empty tables** and
      **0 undeclared empty columns**, and runs inside `mise run 2-check`.
- [ ] The five depth invariants of Phase 4 hold and are asserted, not documented.
- [x] Every exception line carries a reason a reader can disagree with.
- [ ] Every column filled in Phase 3 has been looked at on a screen.

**"The tests are less fragile to the data changing."**

The test, and it is a real one to run, not a claim to make:

- [ ] Add a sixteenth team to a school in biz, sync, `mise run 2-check`. Nothing
      fails. **Run this first, before Phase 1, and write the number down** — it is
      the before-measurement, and the plan is worth what the two numbers differ
      by. `apiEvent()`'s `teamCount: 15` is a literal, so at minimum every spec
      reading a team count breaks today.
- [ ] Give `evt_001` a second game. Nothing fails.
- [ ] Rename `evt_003`. Nothing fails — because no test restates its name. Today
      `tests/render/event-sessions.spec.ts` calls it "Bangkok Skills Camp", which
      is not its name now, so this one fails in the other direction: the test
      passes while being wrong.

- [ ] Zero render specs construct a payload for a seeded id by hand.
- [ ] Zero ids in `tests/` name a row that does not exist, except those carrying
      `// check-ignore` with a reason.
- [ ] The render tier is still under its budget. If projections make it slower,
      that is a finding to report, not a cost to absorb — AGENTS.md is explicit
      that a slow tier is a bug.

## Log

- **Pass 7 — the work, not the plan.** Phases 2, 3 and 4's fills are in, and
  Phase 1's gate is running in `mise run 2-check`. Four commits here, two in biz.

  **The data.** Two model tables that had never held a row now do: the Chiang Mai
  camp has five sessions and thirteen attendance rows, and `ply_006` misses the
  middle two days because an attendance table whose every row says yes has not
  been tested. Eleven coachless teams became one, deliberately —`team_015` stays
  unclaimed because a school that signs up before its staff do is a real state
  and the only row covering it. Eight memberless schools became none. A player
  left a team in March, two events got a description and two deliberately did
  not, a spectator is banned, a game is being broadcast, and fourteen channels
  and fifteen preferences arrived. **No players were added.**

  6 empty tables → 3, all correct. 242/293 columns → 261/293. The 32 that remain
  are all declared, and three of them would break something if filled:
  `notification_sent` is the scheduler's idempotency record, so a seeded row
  means "already sent" and the notification never goes out.

  **The gate.** `scripts/check/seed-coverage.ts`, wired in beside `seed-order`.
  It asks four questions where the old report asked one, and the fourth —
  *does every column have a fixture field at all?* — is the one that hid
  `event.description` for four days. Forty dependency edges, each with `every` /
  `some: n` / `none` and a reason. Verified by deleting one of the twelve
  exceptions and watching it fail with the column, the row count and the repo the
  fix belongs in.

  **Three things the work found that the plan did not predict:**

  1. **`check-seed-order` caught a real bug within a minute.** I appended the
     three new tables to the top of `FIXTURE_TABLES`, so `eventSession` was
     written before `venue`. Every database we have would have accepted it,
     because the parents were already there from an earlier seed; a fresh one
     refuses it, which is how `seed:remote` failed the first time staging was
     built from nothing.
  2. **The showcase decision was wrong and the data said so.** "A SHOWCASE runs
     exhibition games" survived one query: `evt_004`'s two entries are a U16 boys
     team and a U18 girls team and cannot meet. Making it true would have meant
     adding teams to satisfy a metric — the failure this plan is named after,
     nearly committed by the plan's own author.
  3. **Two worker tests broke, and were the thesis arriving on cue.** Both
     restated arithmetic from `evt_001`, which grew from one game to three;
     neither broke for a reason connected to what it tested. One rested on a
     premise that was never true — "the seed plays every game of an event on one
     day", while the league has 17 finished games on 17 days. It was only ever
     true of a tournament with a single game. Fixing it revealed that
     `movement` was null in **every** seeded row, so the branch computing it had
     never run against real data. There is a test for that half now.

  Still open: Phase 5 and 6, the test side. 128 hand-written render payloads and
  eight ids naming nothing — `ses_1` among them, because the camp's real sessions
  are `ses_001`..`ses_005`.

- **Pass 1 — the plan inspected against the code, no work started.** The block
  extracted from this file and run: all thirteen asserted numbers matched. Five
  things stated around them did not, and are fixed:

  1. **"48 tables"** — quoted from AGENTS.md, which is stale. There are **51**.
     The quote stays, marked as a quote, because a sentence going stale in four
     days is the argument for Phase 1.
  2. **"8 seeded ids per worker file"** — from a `grep -c`, which counts *lines*
     containing a match, not matches. Really 158 across 13 files, twelve per
     file. The same mistake produced a wrong payload count in the first draft;
     twice in one day is a habit worth naming.
  3. **Phase 3 was wrong about what its own items cost.** It listed five holes as
     "fill" when only one — `playerTeam.to_date` — has a fixture field to put a
     value in. The other four need a field added to the PO's model first, and two
     of those (`user.image`, the ban trio) need a decision nobody here can make.
     A plan that prices a biz commit as a local edit would have stalled on its
     third box.
  4. **The bound said 85 and its own table sums to 86.**
  5. `evt_003`'s venue and registered players were "whichever ones" — they are
     `ven_003` and `ply_001`/`ply_004`/`ply_006`. A plan that makes the next
     person re-derive a fact it could have carried is doing half its job.

  And one finding that changed the architecture rather than a number:
  **`mise run ops coverage data` only asks its question in one direction.** It
  checks that every fixture field has a column and reports "none missing", which
  is true. It never checks that every column has a fixture field — and **seven
  do not**, including `event.description`, which is the exact column AGENTS.md
  complained about on 2026-08-30 and which is still empty. Anybody trying to fill
  it would have read a report saying the fixtures and the schema agreed. That
  direction is now the second box of Phase 1.

- **Pass 6 — the four deferrals removed.** Standing authority granted: decide for
  the Product Owner. The plan had four **Needs the PO** items and every one was
  decidable, so all four are now decisions with reasons:

  1. **A SHOWCASE runs exhibition games** — `evt_004` gets two. Players are
     watched playing, it already has two teams and nothing to do with them, and
     28 of the 29 seeded games belong to one league, so nothing exercises the
     schedule for another event type. One row to delete if that is wrong.
  2. **`usr_spectator_002` is banned** — the person already `SUSPENDED`. Checked
     rather than assumed: `EVERY_SEEDED_ACTOR` filters SUSPENDED and DEACTIVATED,
     so no e2e session is saved for them and nothing breaks. It also covers a
     mechanism nothing covers — `write.test.ts` asserts the *domain* refuses a
     suspended account; nothing asserts Better Auth refuses a **banned** one,
     because no row is banned.
  3. **`user.image` stays empty and is declared** — and this is the one where
     deciding means *not* filling. There is nowhere to host an image, so a seeded
     URL renders broken on every screen showing that person. That is a defect
     wearing a decision's clothes, and the distinction now has a rule of its own:
     authoring a coach's name is fine because the seed is already fiction;
     inventing a value a live system mints is not.
  4. **The camp's timetable** — Phase 2 already carried enough constraint (the
     event's dates, its venue, its three registered players) to write it without
     asking anybody.

  AGENTS.md had already said "Decide, don't ask" and the first draft ignored it
  four times. The rule is now stated at the top of "Rules for this work" instead
  of being assumed, because a plan that has to be *told* it may decide will defer
  again on the fifth thing.

- **Pass 5 — the plan audited against what was actually asked for, and it fell
  short in two places.** The ask was "all data and the data that relies on other
  data is complete", and "the tests" — not "the render tests".

  1. **Phase 4's five invariants were hand-picked.** I read the data, noticed five
     thin spots, and wrote them down as if that were coverage. It is the guardian
     row's mistake at the level of the plan: a chosen set of checks standing in
     for a derived one. **The schema already answers the question** — 66 foreign
     keys, 39 of them between entity tables a person looks at, each one asking
     "of the rows in the parent, how many have the thing that hangs off them?"
     **6 of 39 are complete.** Phase 4 is now derived from that graph, and the
     target is a *declared expectation per edge* (`every` / `some: n` / `none`)
     rather than a percentage — because `user -> player` at 14% is the model being
     true, and 119 children do not all attend one camp.
  2. **The worker tier had no box at all.** Phase 5 was written as though the
     render tier were the whole of it. The worker tier names **158 ids across 13
     files** and imports the helper built to prevent that in **four**. Its ids are
     at least real, so the exposure is arithmetic rather than fiction — but
     arithmetic is what actually broke five tests when a league grew a fifteenth
     team.

  The bound went from 86 items to 120. That is the direction these corrections
  always go, and a plan whose scope only ever shrinks under inspection is not
  being inspected.

- **Pass 4 — what "more data" would actually mean, measured.** 434 fixture rows,
  and **239 of them are players and playerTeams** — 55% of the seed is one shape,
  eight per team, one team each, two with accounts. Everything the product is
  about lives in the other 195 rows.

  That changes what Phase 4 is. It reads like "add data" and it is not: it adds
  about 35 rows, all of them in the thin half, growing the non-player seed by
  roughly a fifth while the total grows 7%. And it produces a rule the phase
  needed and did not have — **this plan adds no players.** A box that can be
  closed by writing more of the cheapest row has been read wrong. The 119 players
  are why `coverage data` looks healthy and the product looks empty.

- **Pass 3 — the cost estimate audited, because it was the weakest joint.**
  "A projection is a row copy, no business logic" was derived from **one**
  procedure, `apiEvent`, and asserted about fifteen. Checked properly: the render
  tier seeds 22 procedures across 126 calls, and the claim holds for 18 of them
  (~113 calls) and **fails for `standings.list`**, which is 126 lines of
  aggregation with a two-level tiebreak. Projecting that would have been a second
  implementation of the league table — the exact thing the "checked duplication"
  argument was pricing as cheap.

  Resolved by narrowing rather than by accepting: **project entity payloads,
  prove computed ones where they are computed.** Standings keeps a written
  payload; a render spec about it asks how the table draws, and whether the
  numbers are right belongs in the worker tier. `me.mine` and `players.mine` stay
  written too, because duplicating `objectsHeldBy` would collide with
  `docs/plan-ownership.md`, which is building that surface right now.

  Nine calls of 126 stay hand-written and each has a reason. The plan is better
  for having a remainder — a design with no remainder usually has one that has
  not been looked for.

- **Pass 2 — the reasoning inspected, not the numbers.** All thirteen still
  match. Four corrections and one finding:

  1. **The dependency diagram said "4 empty tables" where the table above it says
     6.** Two numbers for one fact, four hundred lines apart.
  2. **Decision rule 4 would have stalled Phase 3 on its second box.** It said
     "if closing a hole needs a new column, stop" — but `event.description` needs
     a new *fixture field* for a column that already exists, which is a biz commit
     and not a migration. The two look alike and the rule now separates them.
  3. **"Every event has at least two games" assumed a showcase runs fixtures.**
     Nobody has said it does. It is the PO's question and is marked as one, rather
     than being answered by whoever picks up the box.
  4. **"Two hardest identities, each with one instance"** — the player side has
     two, and the guardian side has one person rather than one family.

  The finding, from looking at that guardian row: **all four guardian rows are
  `usr_spectator_001`**, who is at once a PARENT, a GRANDPARENT, a LEGAL_GUARDIAN
  and an OTHER, to four different children. It is not a family. It is a row shaped
  to make `coverage data` print GUARDIAN_TYPE 4/4, and it does. That is the whole
  diagnosis in one fixture: **the seed was written to satisfy the measurement, and
  the measurement was of breadth.** It is now the worked example in Phase 4 and
  the closing argument in "Why it happens".

  Also verified rather than assumed: Wichai Srisuk is `usr_coach_001`, head coach
  of `team_001` at Assumption with Pranom Chaiyo assisting — so the opening
  paragraph describes a real seeded person doing a real seeded thing. Tier
  weights read from `mise run ops tiers` (unit 208, worker 290, render 200, e2e
  31) rather than guessed from file counts. `eventDivision` confirmed as the
  seed's only derived domain table, which is what makes the projection layer a
  row-copy rather than a reimplementation.

- 2026-09-03 — plan written. Facts derived before anything was claimed: 6 empty
  tables, 51 empty columns of 293, 11 coachless teams, 8 memberless orgs, 8 ghost
  ids, 126 hand-written render payloads, 0 render specs reading the seed. Four
  numbers in the first draft were wrong and were corrected by running the block
  before writing the phases — users with no notification channel (5, not 4), with
  no preference (9, not 7), the payload count (126, not the 131 a `grep -c` of
  lines rather than occurrences reported), and the ghost-id count (8, not 7,
  because the first regex omitted `ses_`).

  Two things found while measuring that are not in any phase, recorded so they
  are not rediscovered:

  1. **`gameBroadcast` and `notification_sent` look like model tables and are
     not.** Both live in `src/db/fixtures-schema.ts` beside the model's own, and
     `notification_sent`'s docstring says plainly that it is "not the Product
     Owner's model, it is bookkeeping the scheduler needs". Anything counting
     empty tables will flag them on every run; the exception list is where that
     stops.
  2. **The working tree had another session in it while this was written** —
     `src/api/events.ts`, `src/api/index.ts` and two render specs changed under
     the measurement, which is why the payload count is printed rather than
     asserted. It is the same hazard AGENTS.md records from 2026-08-31. Read
     `git status` before a broad `git add`.
