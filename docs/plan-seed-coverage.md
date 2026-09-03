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
   cat > /tmp/seed-derive.ts <<'TS'
   import { readFileSync, readdirSync, statSync } from "fs"
   import { join } from "path"
   import { getTableColumns, getTableName } from "drizzle-orm"
   import type { SQLiteTable } from "drizzle-orm/sqlite-core"
   const ROOT = process.cwd()
   const schema = await import(join(ROOT, "src/db/schema.ts"))
   const { SEED_ENTITIES: E, SEED_RELATIONSHIPS: R } =
     await import(join(ROOT, "src/domain/model/entities.ts"))

   // Per-column non-null counts, parsed from the seed's own INSERTs. The seed is
   // one statement per line, which is what makes this honest rather than a
   // second model of the data — it reads the bytes the database receives.
   const seen: Record<string, { rows: number; nonNull: Record<string, number> }> = {}
   for (const line of readFileSync(join(ROOT, "src/db/seed.sql"), "utf8").split("\n")) {
     const m = line.match(/^INSERT (?:OR IGNORE )?INTO `?(\w+)`? \(([^)]*)\) VALUES \((.*?)\)(?: ON CONFLICT|;|$)/)
     if (!m) continue
     const cols = m[2]!.split(",").map((c) => c.trim().replace(/`/g, ""))
     const vals: string[] = []
     let cur = "", depth = 0, inStr = false
     const raw = m[3]!
     for (let i = 0; i < raw.length; i++) {
       const ch = raw[i]!
       if (inStr) { if (ch === "'" && raw[i+1] === "'") { cur += "''"; i++; continue } if (ch === "'") inStr = false; cur += ch; continue }
       if (ch === "'") { inStr = true; cur += ch; continue }
       if (ch === "(") depth++; if (ch === ")") depth--
       if (ch === "," && depth === 0) { vals.push(cur.trim()); cur = ""; continue }
       cur += ch
     }
     vals.push(cur.trim())
     const s = (seen[m[1]!] ??= { rows: 0, nonNull: {} })
     s.rows++
     cols.forEach((c, i) => { s.nonNull[c] ??= 0; if ((vals[i] ?? "NULL").toUpperCase() !== "NULL") s.nonNull[c]!++ })
   }

   const tables: Record<string, string[]> = {}
   for (const v of Object.values(schema)) {
     try {
       const n = getTableName(v as SQLiteTable)
       const c = Object.values(getTableColumns(v as SQLiteTable)).map((x: any) => x.name)
       if (n && c.length) tables[n] = c
     } catch { /* a relations() definition or a zod schema, not a table */ }
   }
   const empty = Object.keys(tables).filter((t) => !seen[t]).sort()
   let cols = 0, holes = 0
   for (const [t, cs] of Object.entries(tables)) { cols += cs.length; for (const c of cs) if (!(seen[t]?.nonNull[c])) holes++ }

   const all = new Set<string>()
   for (const t of [...Object.values(E), ...Object.values(R)]) for (const r of t as any[]) for (const v of Object.values(r)) if (typeof v === "string") all.add(v)
   const files: string[] = []
   const walk = (d: string) => { for (const e of readdirSync(d)) { const p = join(d, e); statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") && files.push(p) } }
   walk(join(ROOT, "tests"))
   const ghosts = new Set<string>()
   for (const f of files) for (const m of readFileSync(f, "utf8").match(/"(?:team|evt|ply|org|usr|gam|div|ven|ses)_[a-z]*_?\d+"/g) ?? []) {
     const id = m.slice(1, -1); if (!all.has(id)) ghosts.add(id)
   }
   const p = (label: string, n: number, says: number) =>
     console.log(`${label.padEnd(42)} ${String(n).padStart(4)}   (plan says ${says})${n === says ? "" : "   <-- DIFFERS"}`)

   console.log("\n  ASSERTED — a difference means fix this file first\n")
   p("domain tables with no seeded row", empty.length, 6)
   console.log("     " + empty.join(", "))
   p("columns never non-null in any seeded row", holes, 51)
   p("  of a total column count of", cols, 293)
   p("teams with no coach", E.teams.filter((t) => !R.teamCoaches.some((c) => c.teamId === t.id)).length, 11)
   p("orgs with no member", E.orgs.filter((o) => !R.orgMembers.some((m) => m.orgId === o.id)).length, 8)
   p("events with fewer than two games", E.events.filter((e) => E.games.filter((g) => g.eventId === e.id).length < 2).length, 3)
   p("players with a user account", E.players.filter((x) => x.userId).length, 2)
   p("players with a guardian", new Set(R.guardians.map((g) => g.playerId)).size, 4)
   p("users with no notification channel", E.users.filter((u) => !R.userNotificationChannels.some((c) => c.userId === u.id)).length, 5)
   p("users with no notification preference", E.users.filter((u) => !R.userNotificationPreferences.some((x) => x.userId === u.id)).length, 9)
   p("render specs reading the seed", files.filter((f) => f.includes("/render/") && /domain\/model\/entities|helpers\/fixtures|helpers\/projections/.test(readFileSync(f, "utf8"))).length, 0)
   p("ids named in tests that no fixture defines", ghosts.size, 8)
   console.log("     " + [...ghosts].sort().join(", "))

   console.log("\n  PRINTED — context, expected to move as the work lands\n")
   const payloads = files.filter((f) => f.includes("/render/")).reduce((n, f) => n + (readFileSync(f, "utf8").match(/entry\(orpc/g) ?? []).length, 0)
   console.log(`  entry() payloads in the render tier          ${payloads}`)
   TS
   bun /tmp/seed-derive.ts
   ```

   Once Phase 1 lands, this block is deleted and step 1 becomes
   `mise run ops coverage data`. Deleting it is part of ticking Phase 1's first
   box — a plan carrying its own private copy of a check the gate now runs is the
   drift this file exists to prevent.

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

When every box is ticked, or every remaining one is marked **Needs the PO** with
its reason, say so plainly and stop.

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

- **Nothing invented.** A seeded row is a claim about a real Thai school
  basketball pilot. If a value cannot be reasoned to from what is already
  there — a camp's dates, a school's city — it is **Needs the PO**, not a
  plausible-sounding string.
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
| 4 | depth invariants unmet | 5 |
| 5 | procedures the render tier seeds by hand | ~15 |
| 6 | ids named in tests that no fixture defines | 8 |

Total: **86 items**, each either closed or declared. There is no phase whose size
is discovered as it runs.

### What stops the loop

- Every box ticked, or marked **Needs the PO** with its reason.
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

- [ ] Add a per-table and per-column pass to `mise run ops coverage data`,
      reading `src/db/seed.sql` the way the block at the top of this file does —
      the bytes the database receives, not a second model of them.
- [ ] Add the missing direction: columns no fixture field feeds, minus the ones
      the generator synthesises. Name the seven, and say that each is a biz
      change rather than a local one.
- [ ] Give it an exceptions list with a reason per line, seeded with today's six
      empty tables and 51 empty columns. **Report, do not fail, on those.**
- [ ] Fail on anything *not* in the list. A new column with no seeded value is a
      failing gate from the day it exists.
- [ ] Add the step to `scripts/check.ts` beside `coverage-gui`.
- [ ] Delete the block at the top of this file; step 1 becomes the task.

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

- [ ] biz: sessions for `evt_003`, the Chiang Mai camp. Four or five over its
      2026-04-15 to 2026-04-19 window, in `Asia/Bangkok`, at `ven_003` — the
      venue `eventVenues` already gives it. Times a parent could act on.
- [ ] biz: attendance rows against those sessions for the three players already
      registered to `evt_003` via `eventPlayers` — `ply_001`, `ply_004`,
      `ply_006` — with at least one of them absent from at least one session. An
      attendance table whose every row says yes has not been tested.
- [ ] here: add both to `FIXTURE_TABLES` and `FIXTURE_SCHEMAS`.
- [ ] here: INSERT blocks in `scripts/lib/seed.ts`, ordered after `event`,
      `venue` and `player`.
- [ ] Declare the other four in Phase 1's exception list.
- [ ] Open the camp's Sessions tab in the running app and read it.

**Done when** the block reports zero undeclared empty tables and the camp's
timetable renders from the database.

## Phase 3 — every column has a value

51 of 293, in three groups — and the groups matter more than the number, because
they go to different places.

**Fillable here and now — the field exists and every row is null:**

- [ ] `playerTeam.to_date` — 0 of 120. Nobody has ever left a team, so "former
      player" has never rendered and `teams.removePlayer` returns a field
      `coverage-gui` says no screen names. One player who left mid-season, in
      biz's `playerTeams`. This is the only hole in the whole phase that needs
      nothing but a value.

**Needs a field in the PO's model first** — these are the seven from Phase 1, and
each is a commit in biz before it is a row:

- [ ] `event.description` — named in AGENTS.md on 2026-08-30; its section has
      only ever shown an empty state. Add the field, then at least one event with
      a description and at least one without, or the empty state stops being
      covered.
- [ ] `userNotificationChannel.locale_code` — email locale is a feature with a
      written rule about `Accept-Language`, and no seeded channel has a locale.
      A channel whose owner reads Thai.
- [ ] `user.image` — **Needs the PO.** Every avatar is a fallback today. A seeded
      value would be a URL, and there is nothing to point it at; inventing one is
      the rule this repo states most plainly. Either the PO supplies real images
      or this is declared with that reason. Do not stall on it.
- [ ] `user.banned`, `ban_reason`, `ban_expires` — **Needs the PO.** The admin
      console's ban is built and has never been seen with a banned user.
      `usr_spectator_002` is already SUSPENDED, and whether that person is *also*
      banned is a business question: they are two mechanisms, and conflating them
      would be a third spelling of a status this repo has already been bitten by.
- [ ] `userNotificationChannel.secret` — declare. A verification secret is minted
      at verification time and a fixture one would be a lie about a live value.

**Declare — with the reason on the line:**

- [ ] `account.access_token`, `refresh_token`, `id_token`, `*_expires_at`,
      `scope`, `password` — no OAuth provider, and `emailAndPassword` is off.
- [ ] the four runtime tables' columns, from Phase 2.
- [ ] the remainder, one line each. Anything that resists a one-line reason is
      **Needs the PO**, not a longer sentence.

**Done when** the count is zero-or-declared, each fill has been looked at on
screen, and the biz-side items are either landed or listed for the PO with what
each one unblocks.

## Phase 4 — depth: nothing exists alone

Breadth without depth is the seed's actual shape: one fat instance per kind and
husks around it. Five invariants, each with a screen behind it.

- [ ] **Every team has at least one coach, bar one.** 11 of 15 have none.
      Consequences: no roster owner, and no test that a team page renders for
      somebody who is not its coach — the common case and the untested one. Leave
      **one** team coachless on purpose and say which: an unclaimed team is a real
      state, and a screen that has only ever drawn a coached team will break on
      the first school that signs up before its staff do.
- [ ] **Every org has at least one member.** 8 of 10 have none, so the ORG
      relations resolve against two schools out of ten.
- [ ] **Every event that runs games has at least two.** `evt_001` has one — a
      standings table built from a single game proves nothing. `evt_003` is a camp
      and correctly has none; Phase 2 gives it sessions instead. **`evt_004` is
      the open question**: whether a SHOWCASE runs fixtures at all is the PO's,
      not something to assume because the column exists. Ask, or leave it and say
      why.
- [ ] **Every user has a notification channel and a preference.** 5 users have no
      channel, 9 have no preference. Three separate mechanisms that fail
      independently — following, reachability, per-type preference — and most
      seeded people exercise none of them.
- [ ] **A second player with an account, and a second guardian.** 2 of 119 players
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

**Done when** every render spec asserting seeded *entity* data imports a
projection, and the equivalence test covers each procedure they use. The nine
calls to `standings.list`, `me.mine` and `players.mine` stay written, with the
reason on the line — that is a pass, not a remainder.

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

- [ ] `mise run ops coverage data` reports **0 undeclared empty tables** and
      **0 undeclared empty columns**, and runs inside `mise run 2-check`.
- [ ] The five depth invariants of Phase 4 hold and are asserted, not documented.
- [ ] Every exception line carries a reason a reader can disagree with.
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
