# Plan — the app knows what is yours

Kept, not deleted. This is the record of what was decided and why — the
placements in Phase 5 are judgement calls that will be re-read the next time
somebody wonders why a thing lives where it lives.

**Work it in a loop.** Each pass: re-read this file, do the next unticked box,
run `mise run 2-check`, tick it, append to the log. Keep going until every box in
the Definition of Done is ticked. Do not stop at a phase boundary and ask what to
do next — the next thing is the next unticked box.

When they are all ticked, say so plainly and stop. Not before.

## The problem, in one line

The app cannot ask "what am I connected to", so every screen that says *my* or
*your* either fakes the answer, takes the first row, or was never built.

Wichai coaches at Assumption. He clicks **My team** and gets whichever team is
first in the database. Adisorn referees games and has no screen showing which.
Pim's profile showed her every event on the platform until this morning.

## Why it happens

The server answers two questions about anything: *all of them*, and *this one by
id*. It cannot answer *mine*, except for events and players where somebody added
it by hand.

The model already has the answer. 17 ways to be connected to something, across
five kinds of thing — team, event, player, game, org — resolved by
`objectsHeldBy` in `src/api/relations.ts:373`. That function is a ReBAC
**ListObjects**: which objects does this user hold this relation to. It exists,
two endpoints use it, and the app has never been able to call it.

Everything below follows from exposing it once.

## The architecture

### The mismatch

**The API is organised around entities. The product is organised around
relationships.**

The API offers events, teams, games, orgs — each with *list* and *get by id*.
That is an entity-shaped surface, and it is right for browsing. But almost
nothing in this product is entity-shaped from a person's side. Wichai is not
browsing teams, he coaches one. Pim is not browsing players, her daughter is
one. Adisorn is not browsing games, he is assigned to some.

The model agrees, and says so in numbers. **101 relations; 68 are a person's tie
to one specific thing, 33 are platform-wide.** Two to one toward *mine*. The
browsing third — Discover, Live — is the minority.

So the browser has been sitting between a surface shaped one way and a product
shaped the other, translating. Badly, in three different ways: filter everything
by a permission flag (profile), take the first row (My team), or do not build the
screen at all (a referee's games).

### What the grants say, and why it matters

`GRANTS` in `src/domain/model/vocabularies.ts` covers 76 actions: **28 open to
anyone** — including viewing events, teams, players and their stats — **13 to any
signed-in person**, and **35 needing a relation to the specific thing**.

**Looking is public. Doing is not.** Anyone may see Assumption's roster; only
Wichai may change it.

That changes the design in a useful way: *mine* is a **relevance** question, not
a privacy one. Wichai's teams are not secret, they are simply his. Getting it
wrong shows somebody an irrelevant team, not somebody else's private data. So it
can be cached freely and does not need the care the 35 relation-gated actions do.

### The pattern, and its prior art

This is **ReBAC** — relationship-based access control, Zanzibar-shaped whether or
not that was deliberate: subject, relation, object, with some relations derived
from others (a game's owner is its event's owner — Zanzibar calls that a userset
rewrite; this model calls it `via: "parent"`).

The missing operation has a name: **ListObjects** — *which objects does this user
hold this relation to?* OpenFGA and SpiceDB both call it that. `objectsHeldBy`
**is** ListObjects. It exists, two endpoints use it, and it was never exposed.

Two things follow from having the name:

**The fan-out limit is documented, not discovered.** ListObjects is known to
degrade when one subject relates to thousands of objects. Here that is an
organiser, who relates to every game in every event they run — 29 today,
thousands across seasons. Every ReBAC system answers this the same way:
ListObjects for the small cases, a narrowed query for the fan-out ones. Excluding
the two `via: "parent"` relations in Phase 1 is that answer, not a shortcut.

**And it says what not to build.** ReBAC systems do not put holdings in the
session, do not compute them client-side, and do not write a separate lookup per
object type. Those were three of the four options considered below.

### Why this model is better than most ReBAC setups

Relations here are **derived from the data, not stored separately**. Each says
where it comes from: a coach is a row in the coaching table, an owner is the
`organizer_user_id` column. So joining a roster *is* becoming related — there is
no second list of permission tuples to keep in step, which is the usual failure
of these systems. Some relations even carry an end date, so a coach who leaves
mid-season stops being related without anyone deleting anything.

The cost of deriving: every check is a real query against real tables, so it can
never be as fast as a purpose-built index, and a relation with no table behind it
cannot be expressed. At this size that is irrelevant, and stays so for a long
time.

### Options considered

| | costs | verdict |
|---|---|---|
| Add "your relation" to every row of every list | a join on every list request; only works while a list is small enough to fetch whole | no — wrong for games |
| Put holdings in the session | mixes who-you-are with what-you-own, so a roster change invalidates login state | no |
| **One "what am I connected to" request** | a second lookup when a screen needs details | **yes** |
| A `mine` request per kind of thing | the same work five times, and again for anything new | no — and it is what Phase 3 deletes |

**What is being accepted by choosing the third:** for games, which grow every
season, a flat list of ids eventually stops being enough and that one will need
its own request. Better to add it when Adisorn has three seasons of history than
to build five today.

### The invariant

**One layer decides. Screens render.**

The grant logic lives in the resolver and is tested there exhaustively — the
20,790-combination oracle in `tests/worker/authz-equivalence.test.ts`. That test
is only possible *because* the logic is in one place.

The moment a screen holds a second opinion — a `canEdit` filter, a row pick, an
`if role ===` — authorization has escaped the tested layer, and testing it means
eleven screens times six roles times every relation, in a browser, forever.

Profile's bug was not a data bug. **It was a second, worse copy of a grant rule,
sitting outside the tested layer**, doing exactly what it was written to do. No
amount of screen testing finds that.

### What it means for testing

**One seam makes the wrong-person's-data class testable at all.** If every
"yours" question goes through one hook, tests plant holdings directly and assert
both halves cheaply, with no browser and no database:

> Wichai holds team_001 as head coach, and nothing else.
> Assert: My team shows Assumption. Assert: it does **not** show Triam Udom.

The second assertion is the one that matters and the one nobody writes. It also
removes the fixture problem — the coach with three teams, or the one whose
tenure expired, can be tested without asking the PO to seed them.

**But the stub must be derived, not hand-written.** Stub today's 17 relations by
hand, the PO adds an eighteenth, and every test still passes while the app
ignores it. `tests/helpers/actors.ts` already sets the precedent: it reads
`SEED_ENTITIES` rather than inventing people, so a model change reaches the
render tier instead of being quietly contradicted by a literal. Holdings fixtures
do the same, from `vocabularies.ts`.

### The rule underneath all of it

**Derive, don't restate.** One definition, everything else follows from it.

Three bugs today were the same sentence: the router had pages declared in three
places, profile had "yours" defined in two, and this has "what is mine" answered
by two endpoints out of seven. Each was fixed by picking one definition and
deriving the rest.

## Rules for this work

- **Dev only. No deploying.** Every check is `mise run 2-check` and the tunnel.
- **Grant and ownership tests go in the worker tier**, never e2e. That tier has
  `isolatedStorage`, so each file starts from known state. e2e shares one
  database with whoever is using the tunnel, and a test that counts rows there
  is the mistake that cost a day.
- **Delete as you go.** Two ways to ask the same question is what caused this.
  Nothing is "migrated later".
- **Screens never decide.** No filtering on a permission flag, no picking a row,
  no `if role ===`. The server answers; the screen renders.
- **Stop and say so** when something cannot be finished, rather than leaving it
  quiet. A stated gap is fine. A silent one is what this plan exists to undo.

## How to find what is wrong, without being told

The app's own copy is the specification. Every heading saying *my* or *your* is
a promise about whose data it is.

```
messages/en.json → keys whose text matches \b(my|your|mine|yours)\b
                 → grep src/web for m.<key>(
                 → does the data behind it come from a relation, or from a list?
```

Run 2026-09-03 found 30 such messages, of which six claim ownership of data.
Five were correct or fixed; **My team** was not, and **Your team** exists as a
message no screen renders.

Same sweep applies to empty states and filter copy — "No events match your
filters" promises filtering, which today happens in the browser.

## Phase 1 — the app can ask

- [ ] `mine` procedure in `src/api/relations.ts`, exposed as `me.mine`, returning `{ type, id, relation }[]`
      for the 15 table-backed relations. `events.mine` at `src/api/events.ts:292`
      is the template.
- [ ] The two `via: "parent"` relations (a game held because you own its event)
      are **deliberately excluded**, with the reason in a comment: they are the
      high fan-out case, and an organiser reaches their games through the event.
- [ ] Exposed in `src/api/index.ts`. There is **no** `relations` group there
      today — the router exposes notifications, moq, events, orgs, games, teams,
      standings, reference, health, divisions, venues, players, admin. So this
      adds a group, and `me` is the better name for it than `relations`: the
      relation table is how permissions are implemented, and a public name that
      leaks it cannot be changed later without breaking callers.
- [ ] Worker tests: each seeded person's holdings are exactly right, including
      that Wichai holds no Triam Udom team. Fixtures derived from
      `SEED_ENTITIES`, never hand-written.
- [ ] A test that fails when the model grows a relation kind this does not
      handle. The count comes from `vocabularies.ts`, not a literal.

**Done when:** `mise run 2-check` is green and the new tests fail if the
procedure returns the wrong person's things.

## Phase 2 — the app uses it, once

- [ ] One hook, `useHoldings`, in `src/web/lib/data.tsx`. Long stale time.
- [ ] One helper — "my things of this kind" — so no screen writes the join
      itself. Eleven copies of that join is the same bug in a new costume.
- [ ] `src/web/pages/team.tsx:24` — `allTeams?.[0]` becomes Wichai's team.
- [ ] Render tests: with holdings planted, **My team** shows Assumption and does
      **not** show Triam Udom. The negative assertion is the one that matters.

**Done when:** the sidebar's My team is yours, proven by a test that fails if it
shows somebody else's.

## Phase 3 — nothing left behind

- [ ] `events.mine` and `players.mine` deleted.
- [ ] Their five call sites moved: `data.tsx`, `profile.tsx`, `my-events.tsx`,
      `your-players.tsx`, `event-players.tsx`.
- [ ] Their tests deleted.

**Done when:** `grep -rn "mine" src/api/` finds one procedure, and the API
has one fewer endpoint than it started with.

## Phase 4 — it stays true

Four things change what you are connected to: accepting an invitation, a roster
change, a referee assignment, following something. Each must clear the cache.

- [ ] Find them. They are among 60 `useMutation` sites in 16 files —
      `invitations.tsx`, `team.tsx`, `schedule.tsx`, `follow.tsx` are the likely
      homes.
- [ ] Wire each one.
- [ ] **If one cannot be found, say so here and in the reply.** Do not leave it
      silently stale — the symptom is joining a team and not seeing it until
      reload, which is indistinguishable from the bug this plan is fixing.

**Done when:** each of the four is either wired or written down as unwired, by
name.

## Phase 5 — where everything belongs

"Screen" here means any part of the GUI: a page, a nav item, a tab, a section, a
button. The question is not "is this screen right" but **"does the whole GUI
offer, in a sensible place, everything the model says this product does"**.

### The measure

The model grants **76 actions**. **48 are named in the API. 28 appear nowhere in
the codebase.** The GUI names none directly — it works off flags the API returns,
which is correct, but means action coverage cannot be read from the GUI alone.

Some of the 28 are legitimately not code-named: `SIGN_IN_OUT` is Better Auth's,
`INSTALL_APP` is the PWA prompt, `SPOILER_MODE` is a local toggle. The rest are
whole areas the model describes and nothing implements:

| area | actions with nothing behind them |
|---|---|
| brackets | `VIEW_BRACKET`, `GENERATE_BRACKETS` |
| courts | `ASSIGN_COURTS`, `VIEW_COURT_ASSIGNMENTS`, `VIEW_COURT_STATUS_BOARD` |
| history & rankings | `VIEW_RANK_MOVEMENT`, `VIEW_RANKINGS_HISTORY`, `VIEW_SEASON_RECORDS`, `VIEW_RESULTS_ARCHIVE` |
| AI | `AI_CREATE_EVENT`, `AI_BRACKET_SUGGESTIONS`, `AI_QA` |
| sign-up paths | spectator, player, coach, organiser, referee-request |
| player | `VIEW_PLAYER_STATS`, `DELETE_PLAYER` |

**So the GUI has not drifted from the backend. The model describes a product
substantially bigger than either**, and that gap is what reads as "nothing
matches".

### The method — loop until every action and every entity has a home

This is the interrogation, and it runs until it converges rather than once.

1. **Place every action.** For each of the 76: which part of the GUI offers it,
   for whom, and reached from where? Write the answer, or write **not built**.
   An action with neither is not done.
2. **Place every entity.** Seven kinds — org, team, player, event, game, venue,
   division. Where do you see one, where do you see the list, where do you see
   *yours*? A kind with no home is a hole; a kind with three is a mess.
3. **Then decide, for the GUI as a whole** — not screen by screen:
   - **add** where an action or entity has no home
   - **move** where something sits under the wrong parent (the follow list lived
     inside push settings; the two device lists lived on different pages saying
     the same words — both already fixed, both this class)
   - **delete** where a surface exists for something the model does not have, or
     duplicates another
4. **Re-run 1 and 2.** Moving something changes what its neighbours should hold.
   Loop until a pass changes nothing.

### The constraints on where things go

- **Follow the relations, not the tables.** The model says a person reaches a
  game through its event, and a player through their team. Nav that mirrors the
  relation graph needs no explaining; nav that mirrors the schema does.
- **A thing has one home.** Everywhere else links to it. Two homes is how "this
  device" came to mean two different things on two pages.
- **Yours and all-of-them are different surfaces**, not one surface with a
  filter — see the architecture above. Discover browses; My team is yours.
- **Never build for an action the model does not grant.** The invented dashboard
  — a live game that did not exist, an AI assistant button that did nothing — is
  what that looks like, and it is already recorded in `profile.tsx`'s header.
- **Not built is a legitimate answer**, written down. Nine tenths of the 28 are
  probably "not yet", and saying so beats a screen that pretends.

### Generate the checklist, record only the decisions

**The facts come from the model and must not be copied into this file.** The 76
actions, the 7 entity kinds, the 17 relations — a script emits them, and it is
re-run at the start of every pass. A list of actions written down here is a list
that disagrees with the model the day the PO adds one, which is how the ADRs
died and how `ROUTES` came to name a page that did not exist.

So this file holds **decisions**, not facts: where each thing goes, and why. The
checklist beside it is generated. When a decision moves something, re-run the
generator rather than editing a table by hand.

Where the script goes: `scripts/check/gui-actions.ts` <!-- docs-check-ignore --> (does not exist yet), run from `2-check`, once
Phase 5 has produced placements for it to check against. Not before — a checker
with nothing to check is the boilerplate this plan is trying not to create.

### Output

A table in this file: every action, its home or **not built**; every entity, its
home. Plus the add / move / delete list that falls out, in priority order, with
the ones that are only moves done first — those are cheap and they are where
today's two bugs came from.

**Done when:** a full pass over both lists changes nothing, and every one of the
76 actions has either a place in the GUI or the words "not built" against it.

## Phase 6 — every screen, interrogated

For every screen that exists *after* Phase 5, not the eleven that exist now —
Phase 5 adds, moves and deletes, so this list is whatever the app then has.

- [ ] What does its copy promise? Run the sweep above against the messages it
      renders.
- [ ] Where does its data come from? `useX` hooks → endpoint.
- [ ] Does anything on it decide something the model owns — a permission filter,
      a row pick, a role check?
- [ ] Record the answer here, per screen: correct, or what is wrong.

**Done when:** every screen has a line in this file saying it was checked, and
what was found. A screen with nothing written against it is not done.

## Definition of done, whole job

- [ ] Every screen that exists at the end checked and recorded, with its copy
      matching its data.
- [ ] The coverage list regenerates and shows every one of the 76 actions either
      placed in the GUI or marked **not built**, with nothing unaccounted for.
- [ ] No screen filters on a permission flag, picks a row to stand for "yours",
      or branches on role.
- [ ] One way to ask what is yours. `events.mine` and `players.mine` gone.
- [ ] Ownership and grant tests in the worker tier, deriving fixtures from the
      model, including negative cases — the wrong person's things must be
      absent, asserted.
- [ ] No new e2e tests. If a journey needs one, say why here first.
- [ ] `mise run 2-check` green, and `mise run 2-check -- --e2e` no worse than the
      34 passing it starts at.
- [ ] The four invalidation points wired, or named as unwired.
- [ ] Nothing deferred that is not written in this file.
- [ ] The log below records every pass, so the reasoning survives this file's author.

## Log

Append one line per session: what was done, what was found, what is next. Newest
last.

- 2026-09-03 — plan written. Prior work today: routing no longer renders blank
  pages for unknown hashes, profile's "Your events" moved from a `canEdit`
  filter to `events.mine`, `devices.spec.ts` deleted, timing budgets report
  instead of failing.
