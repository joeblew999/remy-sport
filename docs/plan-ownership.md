# Plan — the app knows what is yours

Kept, not deleted. This is the record of what was decided and why — the
placements in Phase 5 are judgement calls that will be re-read the next time
somebody wonders why a thing lives where it lives.

**Work it in a loop, and inspect yourself on every pass.** The plan is wrong
until proven otherwise — eleven verification passes on the day it was written
found sixteen defects in it, four of them in numbers stated as fact.

Each pass, in this order:

1. **Re-derive the facts.** This exact block. If any number differs from what
   this file says, **fix the file first**, note it in the log, then continue. A
   plan that disagrees with the code is worse than no plan.

   ```sh
   python3 - <<'EOF'
   import re, pathlib, subprocess
   v = pathlib.Path("src/domain/model/vocabularies.ts").read_text()
   g = v[v.index("export const GRANTS"):]
   acts = set(re.findall(r'\n  ([A-Z_]+): \[', g))
   rows = re.findall(r'\{ code: "([A-Z_]+)", objectTypeCode: "([A-Z_]+)"', v)
   rels = [(c,t) for c,t in rows if c not in acts]
   via  = re.findall(r'\{ code: "([A-Z_]+)", objectTypeCode: "([A-Z_]+)", via: "([a-z]+)"', v)
   held = [x for x in via if x[1] != "PLATFORM"]
   print("actions              ", len(acts),        "(plan says 76)")
   print("relations            ", len(rels),        "(plan says 25)")
   print("  to a specific thing", len(held),        "(plan says 17)")
   print("  table-backed       ", sum(1 for x in held if x[2]=="table"), "(plan says 15)")
   print("  derived (parent)   ", sum(1 for x in held if x[2]=="parent"), "(plan says 2)")
   print("entity kinds         ", sorted({t for _,t in rels if t!="PLATFORM"}))
   named = lambda d: sum(1 for a in acts if subprocess.run(["grep","-rqF",f'"{a}"',d]).returncode==0)
   print("actions named in API ", named("src/api"), "(plan says 48)")
   EOF
   ```
2. **Re-run the DoD's grep** and triage anything new. It found two unreported
   bugs the first time it was run for real.
3. **Do the next unticked box**, applying the decision rules rather than asking.
4. **`mise run 2-check`.** Green before ticking anything.
5. **Tick it, or write why not.** A box left unticked without a reason beside it
   is the failure this whole plan exists to correct.
6. **Append to the log** — what was done, what was found, what changed in the
   plan itself.

Never end a pass having neither ticked a box nor recorded why one cannot be
ticked. That is the only definition of progress here.

When every box is ticked, or every remaining one is marked **Needs the PO** with
its reason, say so plainly and stop. Not before, and not at a phase boundary.

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
five kinds of thing — team (5), event (3), player (3), game (3), org (3) —
resolved by
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

The model agrees, and says so in numbers. **Of 76 actions, 51 are about one
specific thing and 25 are platform-wide. Of 25 relations, 17 tie you to one
specific thing and 8 are platform-wide.** Two to one, both ways. The browsing
third — Discover, Live — is the minority.

(An earlier draft of this file said "101 relations, 68 person-scoped". That was
wrong: 101 is actions *plus* relations, counted together because both carry a
`code` and an `objectTypeCode`. Corrected on the second verification pass. The
ratio survived the correction; the absolute numbers did not.)

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

The grant logic lives in the resolver and is tested there exhaustively.
`tests/worker/authz-equivalence.test.ts` asserts, in its own words, "every action
in the model, against every seeded object of that action's type, for every seeded
actor". That test is only possible *because* the logic is in one place.

The moment a screen holds a second opinion — a `canEdit` filter, a row pick, an
`if role ===` — authorization has escaped the tested layer, and testing it means
every screen times every role times every relation, in a browser, forever.

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

## Running unattended

**This plan completes without asking anybody anything.** That is only possible if
every judgement is decided *here*, in advance. Where the text below says
"decide", the rule for deciding is written beside it. A rule that is missing is a
bug in this plan, not a reason to stop and ask.

### The boundary: nothing new gets built

**No new features. Ever, in this plan.** A feature is a product decision and the
PO owns those. What this plan does is make what already exists tell the truth,
and write down what does not exist.

So for any action with nothing behind it — brackets, courts, rankings history,
the AI features, the sign-up paths — the answer is always **"not built"**,
recorded, never implemented. That single rule removes most of what would
otherwise need asking.

### Decision rules, in priority order

Apply the first that matches.

1. **A surface claiming something that does not exist → delete the surface.**
   `#/bracket` renders the event page while brackets do not exist. Delete the
   route. A route that lies is worse than a missing one, and deleting is
   reversible in git while a half-feature is not.
2. **A thing with two homes → keep the one closer to what it belongs to, link
   from the other.** Follow relations, not tables: a game belongs to its event,
   a player to their team.
3. **A thing with no home, that exists in the API → put it on the surface of the
   entity it belongs to.** A roster action goes on the team, a referee
   assignment on the game.
4. **A thing with no home and no API → "not built".** Record and move on.
5. **Placement genuinely ambiguous after 1–4 → leave it where it is**, and write
   both options and the reason in this file. Not moving is the safe default;
   moving is what broke the two device lists apart.
6. **Empty state, when a person holds nothing** → say what is missing and offer
   the way to browse. "You are not on a team yet" plus a link to Discover.
   Never a blank pane, never somebody else's data, never a spinner that
   never resolves. This is the default answer everywhere the question arises.
7. **A test that cannot be written without a fixture the seed does not have** →
   plant the fixture in the test, derived from the model, rather than asking the
   PO to seed one. The render tier already works this way.
8. **Anything still undecidable** → do not guess and do not stop. Write it in the
   log under **Needs the PO**, skip that box, and carry on with the next one.
   The plan finishes; that box stays unticked with its reason beside it.

### The plan changes itself as it runs

A plan fixed at the moment of writing is wrong by the second pass. This one is
expected to grow, shrink and be rewritten while it runs, and the log is where
that is justified.

**Add a box** when a pass finds another instance of a class already in scope.
This already happened: the DoD's grep found `event.tsx:47` and `admin.tsx:67`,
and both became boxes in Phase 2 the same hour. New instances of a known class
are the plan's own work arriving, not scope creep.

**Rewrite a phase** when a decision invalidates it. Deleting the `bracket` route
changes what Phase 6 walks; Phase 6 says "whatever screens exist afterwards" for
exactly that reason. When a rewrite is needed, do it and say so in the log —
do not work to a phase you know is wrong.

**Delete a box** that turns out to be unnecessary, with the reason written where
it stood. A box removed silently is indistinguishable from one forgotten.

**Correct a fact** the moment step 1 says it moved, before any other work.

#### The bound, so this actually finishes

**The bound is the model, not a count of boxes.** Every box must trace to one of
three finite lists:

- one of the **actions** the model grants,
- one of the **entity kinds** a person can be related to,
- one of the **screens that exist** at the time of the pass.

When every action has a home or a "not built", every entity kind has a home, and
every screen has been walked, there is nothing left that can generate a box. That
is why this terminates.

If a finding cannot be traced to one of those three, it is not this plan's work,
however real. It goes under **Noticed, out of scope** in the log — one line, no
box, no work.

That distinction is what stops a self-evolving plan becoming an infinite one.
Today's session is the warning: it started with one broken push notification and
had, by the afternoon, rewritten the test harness, the CLI and the agent
instructions. All defensible individually. None of it was the thing asked for.

### What stops the loop

Only these:

- every box ticked, or
- every remaining box is marked **Needs the PO** with its reason — and if more
  than three end up there, that is evidence this plan was written wrong, not
  that the work is finished. Say so rather than presenting it as done, or
- `mise run 2-check` cannot be made green and the cause is not in this plan's
  scope — recorded, then stop.

Nothing else is a reason to stop. Not a phase boundary, not an unclear
requirement, not the size of the next box.

## Order, and what depends on what

Phase 5 is analysis and can start at any time — it needs no code. Everything else
is a chain: **1 → 2 → 3**, because the hook needs the request and the deletions
need the replacement. Phase 4 needs 2. Phase 6 needs 5, since it walks whatever
screens exist afterwards.

The loop reads: do the next unticked box in 1, 2, 3, 4, 6 in order, and pick up
5 whenever the next box needs a decision about where something goes.

## Phase 1 — the app can ask

- [x] `mine` procedure — in `src/api/me.ts`, not `relations.ts`: that file is a
      pure resolver with no oRPC imports, and putting a procedure there would mix
      layers. Exposed as `me.mine`, returning `{ type, id, relation }[]`
      for the 15 table-backed relations. `events.mine` at `src/api/events.ts:292`
      is the template.
- [x] The two `via: "parent"` relations (a game held because you own its event)
      are **deliberately excluded**, with the reason in a comment: they are the
      high fan-out case, and an organiser reaches their games through the event.
- [x] Exposed in `src/api/index.ts` as `me`. There was **no** `relations` group there
      today — the router exposes notifications, moq, events, orgs, games, teams,
      standings, reference, health, divisions, venues, players, admin. So this
      adds a group, and `me` is the better name for it than `relations`: the
      relation table is how permissions are implemented, and a public name that
      leaks it cannot be changed later without breaking callers.
- [x] Worker tests — `tests/worker/me.test.ts`, 4 passing. Each seeded person's holdings are exactly right, including
      that Wichai holds no Triam Udom team. Fixtures derived from
      `SEED_ENTITIES`, never hand-written.
- [x] A test that fails when the model grows a relation kind this does not
      handle. The count comes from `vocabularies.ts`, not a literal.

**Done when:** `mise run 2-check` is green and the new tests fail if the
procedure returns the wrong person's things.

## Phase 2 — the app uses it, once

- [x] One hook, `useHoldings`, in `src/web/lib/data.tsx`. 10-minute stale time.
- [x] One helper — `useMine(type)`, "my things of this kind" — so no screen writes the join
      itself. Eleven copies of that join is the same bug in a new costume.
- [x] `src/web/pages/team.tsx` — three answers, not one: none, one, several.
      Coach_001 holds two teams in the seed, so picking the first of *your*
      teams would be the original bug with a better source. It lists them.
- [ ] `src/web/pages/event.tsx:47` — `allEvents?.[0]`, the same bug found by the
      DoD check on 2026-09-03. `#/event` with no id shows whichever event is
      first. Rule 1 applies — the sidebar does not link to `#/event` with no id,
      so it claims a destination that has no meaning. Delete the no-id case; a
      bare `#/event` resolves to `not-found`, which now has a screen.
- [ ] `src/web/pages/admin.tsx:67` — `role === "admin"`. The GUI deciding
      admin-ness rather than asking. The API already answers this; the console
      previously "decided this from a role table copied into the client", which
      `events.list`'s `canCreate` comment records as the reason that field
      exists. Same class, still present.
- [x] **Empty state, by rule 6.** A new spectator holds no relations, so
      "My team" has nothing to show. That is the common case for most readers of
      this product, not an edge case — and an unanswered version of it is what
      renders a blank pane, which is the other bug fixed today. It needs a real
      empty state: what a person with no team should see, and what they can do
      about it. Same question for a referee with no assignments and a parent
      whose child is on no roster.
- [x] Render tests — `tests/render/my-team.spec.ts`, 4 passing. With holdings planted, **My team** shows Assumption and does
      **not** show Triam Udom. The negative assertion is the one that matters.
      Plus the empty case: holdings empty renders the empty state, not a blank
      pane and not somebody else's team.

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

Verified 2026-09-03: **only two things in the GUI change what you are connected
to.** An earlier draft of this file claimed four; roster changes and referee
assignment are actions the API has and the GUI never calls, so they belong to the
"not built" set in Phase 5 rather than here.

- [ ] `orpc.events.acceptCoOrganizerInvite` — `components/invitations.tsx`.
      Accepting makes you a CO_ORGANIZER of that event.
- [ ] `orpc.notifications.follow` — `components/follow.tsx`,
      `components/following.tsx`, `components/notification-settings.tsx`, and
      `lib/data.tsx`. Four call sites, one operation; the invalidation belongs in
      the shared hook in `data.tsx`, not repeated in three components.
- [ ] When Phase 5 adds roster or referee-assignment surfaces, they clear it too.
      Written here so that is not forgotten rather than assumed.

**Done when:** both are wired, and a test proves it — accept an invitation, and
the event appears in your holdings without a reload.

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

**Snapshot, 2026-09-03, shown to make the scale legible — not a source of
truth.** This table will be wrong the day the PO adds an action; the generator
described below is what to trust. It is here because a reader needs to see the
shape once, and deleting it would make this section an assertion with no
evidence.

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
2. **Place every entity.** **Five kinds can be related to a person** — event,
   team, player, game, org. Where do you see one, where the list, where *yours*?
   A kind with no home is a hole; a kind with three is a mess.

   Venue and division are tables, not relation-bearing kinds — nobody is the
   owner of a venue. They appear inside an event's surfaces and need no *yours*.
   Saying "seven entities" conflates what the database stores with what a person
   can hold, and the plan said that until the eleventh pass.
3. **Then decide, for the GUI as a whole** — not screen by screen:
   - **add** where an action or entity has no home
   - **move** where something sits under the wrong parent (the follow list lived
     inside push settings; the two device lists lived on different pages saying
     the same words — both already fixed, both this class)
   - **delete** where a surface exists for something the model does not have, or
     duplicates another
4. **Re-run 1 and 2.** Moving something changes what its neighbours should hold.
   Loop until a pass changes nothing — **or until the third pass**, whichever
   comes first. If two passes keep swapping the same thing between two homes,
   that is a genuine judgement call, not convergence: write both options and the
   reason in this file, pick one, and move on. A loop with no bound is how this
   phase quietly becomes the rest of the year.

### Decisions already made that Phase 5 must revisit

- **`#/bracket/<id>` renders the event page.** It had no branch in `main.tsx`
  and rendered nothing; building the render map on 2026-09-03 required every
  page in `PAGES` to have a screen, so it was pointed at `EventPage` — a
  decision taken silently while doing something else. `VIEW_BRACKET` and
  `GENERATE_BRACKETS` have nothing behind them, so this is a route claiming a
  feature that does not exist. **Rule 1: delete the route.** `VIEW_BRACKET`
  becomes a "not built" entry, and `bracket` leaves `PAGES` — which the render
  map will then refuse to compile until the entry is gone, so this cannot be
  half-done.

### Also true of every placement

- **Two form factors.** `styles.css` carries media queries and `main.tsx` a
  drawer for narrow screens. A placement that reads well on a desktop grid can
  put a full screen of scroll between two things on a phone — which is exactly
  what moving the notification settings fixed. Judge each placement on the
  narrow layout too, not only the wide one.
- **Two shells.** The app also runs inside Tauri, where `isNativeApp()` already
  hides the install prompt. A new surface has to be right in both, or gated the
  same way.
- **Three languages.** Anything added needs `messages/en.json` plus th and ja,
  with placeholders matching — `check:i18n` fails the gate on a hardcoded
  string, so this is enforced rather than remembered.

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
- [ ] The coverage list regenerates and shows **every action the model grants**
      either placed in the GUI or marked **not built**, with nothing
      unaccounted for. The count comes from the generator, not from this file.
- [ ] No screen filters on a permission flag, picks a row to stand for "yours",
      or branches on role. Checkable:
      `grep -rnE "\\.filter\\(.*\\.(can|is|may)|\\[0\\]|role ===" src/web/pages src/web/components`
      returns only hits about facts, never about permissions.

      Run 2026-09-03 (pass 1), **15 hits** — an earlier count of ten was
      truncated by `head`, corrected on the first real pass. Triaged:

      | hit | verdict |
      |---|---|
      | `pages/team.tsx:24` `allTeams?.[0]` | **bug** — My team shows row one |
      | `pages/event.tsx:47` `allEvents?.[0]` | **bug** — same, on events |
      | `pages/admin.tsx:67` `role === "admin"` | **bug** — GUI deciding admin-ness |
      | `pages/discover.tsx:206` | fine — first *live* game for a banner, comment says so |
      | `components/entries.tsx:108` | fine — form default from a server-scoped list |
      | `pages/admin.tsx:486` | fine — dedupes a role list for display |
      | `components/event-sessions.tsx:71` | fine — a session's timezone |
      | `pages/profile.tsx:55` `isBroadcasting` | fine — a fact about a game |
      | `team.tsx:87,116`, `account.tsx:28` | fine — initials |
      | `event.tsx:98`, `crash.tsx:65` | fine — string splitting |
      | `admin.tsx:324,368` | fine — a displayed account, a default |

      The regex is deliberately noisy: `[0]` catches string indexing too. Triage
      is the point — a check that returns nothing is a check nobody reads.
- [ ] One way to ask what is yours. `events.mine` and `players.mine` gone.
- [ ] Ownership and grant tests in the worker tier, deriving fixtures from the
      model, including negative cases — the wrong person's things must be
      absent, asserted.
- [ ] No new e2e tests. If a journey needs one, say why here first.
- [ ] `mise run 2-check` green, and `mise run 2-check -- --e2e` no worse than the
      34 passing it starts at.
- [ ] Both invalidation points wired, and any added by Phase 5 wired with them.
- [ ] Nothing deferred silently. This one cannot be checked mechanically, so it
      is a promise rather than a test: anything not done is written in the log
      with the reason, and said in the reply at the time.
- [ ] The log below records every pass, so the reasoning survives this file's author.

## Log

Append per pass: what was done, what was found, **what changed in this file and
why**. Newest last. A pass that altered the plan without saying so here is the
same failure as a box ticked without the work.

### Noticed, out of scope

Things seen while working that are real but are not this plan's class. One line
each, no box, no work — they exist so they are not lost and not followed.

- The gate's phases run cheapest-first as of 2026-09-03, but `2-check --e2e`
  still cannot run against a deployment without stopping the dev server first.
- `mise` tasks use three different argument grammars, and four of six do work
  when run with no arguments while two print help.
- AGENTS.md is 674 lines with 114 bolded, against guidance of 150-200.

### Passes

- **Pass 2 — Phase 2 complete** except the two bugs the grep found, which are
  still open. Counts unchanged, grep still 15.

  `useHoldings` and `useMine(type)` in `data.tsx`; the join lives in one place so
  no screen writes it. `team.tsx` now answers three ways — none, one, several —
  because coach_001 holds two teams and picking the first of *yours* is the same
  bug with a nicer source. Four render tests, each asserting the negative half.

  Three things the work found, none of them in the code being changed:

  1. **`tests/helpers/surfaces.ts` built `/#/team/undefined`.** Every surface
     interpolated its id unconditionally, so `visit(page, "team")` navigated to
     a team called "undefined" and the page correctly said it did not exist.
     Harmless while every caller passed an id; wrong the moment a test wanted the
     no-id case, which is the whole of "my team". `broadcast` already had the
     guard — somebody hit this once and fixed only their own line. All five fixed.
  2. **`entry(procedure, {}, …)` does not match a no-input procedure's key.** It
     wants `undefined`. Three existing specs already knew; nothing said so.
  3. **`apiTeam`'s defaults are Triam Udom's**, so overriding only the name left
     team_001 called "Assumption" at "Triam Udom Suksa School" — and the negative
     assertion failed against a page that was right. The fixture now overrides
     the school too, so that string appearing means the wrong team is on screen
     and nothing else.

  `mise run 2-check` green, 155 render tests.

- **Pass 1 — Phase 1 complete.** Self-inspection first: all seven model counts
  unchanged; the DoD grep returned **15** hits, not the ten recorded — the
  earlier number was truncated by `head`. Retriaged: three bugs (`team.tsx:24`,
  `event.tsx:47`, `admin.tsx:67`), twelve legitimate. Plan corrected before any
  work, per step 1.

  Then `src/api/me.ts` and `tests/worker/me.test.ts`. Four things the work
  taught, all recorded in the code:

  1. It does not belong in `relations.ts` — that file has no oRPC imports and is
     a pure resolver. Its own file keeps the layers apart.
  2. The relation list is derived with `RELATION.filter(r => r.via === "table")`
     and nothing else. A second filter for `objectTypeCode !== "PLATFORM"` was
     written and **the compiler rejected it as unreachable** — every table-backed
     relation is already on a specific thing. The model proving the filter right.
  3. The first negative test asserted two coaches share no team. False:
     `team_001` has coach_001 as head and coach_002 as assistant. Sharing is not
     the bug, over-returning is — so it now asserts that every team the resolver
     *excludes* is absent, which is the shape that catches "My team".
  4. `check-authz` refused the procedure for declaring no policy while explaining
     itself in a comment — "a procedure that declares nothing is not public, it
     is unreviewed". Correct. It now declares `infrastructure(...)` with the
     reason in the string, where the checker can see it.

  `mise run 2-check` green.

- 2026-09-03 — plan verified over ten passes against the code. Four things were
  wrong and are fixed: the headline "101 relations, 68 person-scoped" conflated
  actions with relations (really 76 actions / 25 relations, 51 and 17 of them
  object-scoped); Phase 4 claimed four invalidation points when only two exist in
  the GUI; the Phase 5 loop had no termination bound; and the file broke its own
  "do not copy facts in" rule with an undated table. The DoD's grep was then run
  for real and found two bugs nobody had reported — `event.tsx:47` has the same
  row-one bug as `team.tsx:24`, and `admin.tsx:67` decides admin-ness in the
  browser. Both are now in Phase 2.
- 2026-09-03 — plan written. Prior work today: routing no longer renders blank
  pages for unknown hashes, profile's "Your events" moved from a `canEdit`
  filter to `events.mine`, `devices.spec.ts` deleted, timing budgets report
  instead of failing.
