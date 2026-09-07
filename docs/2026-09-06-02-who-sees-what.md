# Plan — who sees what, generated and checked

Reconciled 2026-09-07: **partially implemented**. Shared action gates and
`tests/render/who-sees-what.spec.ts` exist; the matrix covers the team page.
A generated whole-app permission table and exhaustive identity/state coverage
are not complete. The proposal below describes the original target, not
verified behavior. Its steps are historical scope, not a second backlog;
continue through GAP-06–08 in the [domain register](2026-09-07-01-react-domain-coverage.md).
See [current status](README.md).

## Why

The model grants actions by relation: a head coach may manage the squad, an
organiser may assign a referee, anyone signed in may follow. Many relations,
many screens, and every screen looks different to every person. Nobody can
walk that by hand and know what is right, which is what the Product Owner
said on 2026-09-06: "because of the many ReBACs it's really hard to use the
GUI and know what needs to be changed."

What exists today answers neighbouring questions. `bun run shots` takes a
picture and a text dump of each screen per seeded person, for eyes.
`tests/repo/actions.test.ts` says every action the model grants has a screen
or a written reason. `scripts/ops/coverage-gui.ts` says every procedure is
called from a screen. None of them says: **on this screen, this person is
offered exactly what the model grants them, and nothing else.** The walk on
2026-09-06 found the screen and the server disagreeing about who was asking
(a visitor offered "Manage squad" after sign-out), by hand, by luck.

## The target

One generated table, `docs/who-sees-what.md` <!-- docs-check-ignore -->: a row per screen on a seeded
object, a column per **relation** the model names for that kind of object,
plus a visitor and a signed-in stranger, and in each cell the actions that
screen offers. Read it to know what a head coach can do on a team page
without signing in as one.

Relations, not people, is what makes this finite. The GUI hides itself by
who you are, and "who you are" looked like twenty-one seeded accounts times
every object times every screen — too many to walk, which is the Product
Owner's point. But the model grants by relation: `MANAGE_ROSTER` is for a
head coach, an assistant coach or a team manager of *that* team, and for
nobody else. So a team page has eight or so cases, not twenty-one people,
and every case is one line of a projection. The people only matter for the
identity test, which needs a real sign-in.

Two tests around it. The first holds the table: the gate regenerates it and
fails when it differs from the committed one, so a change to who sees what
is a diff in review, never a surprise. The second holds the model: for every
action a screen offers, the model's grant for that action and the person's
relations to that object must agree with the screen — present when granted,
absent when not — with no expectation written by hand. That second test is
the ReBAC check the GUI has never had.

## Where this sits

This is the *checking* half. It cannot make the GUI right; it can only say
where a screen and the model disagree on the surfaces it covers. What makes
the GUI knowably right for every permutation is that screens stop deciding
at all — one gate, the server answering every "may I" with state included —
which is [2026-09-06-03-one-gate.md](2026-09-06-03-one-gate.md). Once that
lands, this check needs no hand-stamped `data-action` and becomes the
smoke test that the whole chain composes.

## What this changes for an agent

Today an agent that changes a screen has one way to know whether a coach, a
parent or a referee still sees the right thing: sign in as each one and
look. That is slow, it depends on remembering to look, and it is how the
2026-09-06 walk found its bugs — by luck. With this, the agent runs one
test and reads a list: this screen, this person, this action, offered but
not granted (or granted but not offered). That list is "what needs to be
changed". No pictures, no walking, no memory of who holds what.

## Rules

- The table is generated, never edited. A wrong cell is fixed in the app or
  in the model, and the table regenerated in the same commit.
- Expectations come from the model (`GRANTS` and the seeded relations), not
  from a list in a test. A list is a second copy of the model, and second
  copies are how the screen came to disagree with the server.
- **The render tier, not e2e.** The render tier already states who the
  reader is without a server: `projectTeam("team_001", ["HEAD_COACH"])` in
  `tests/helpers/projections.ts` answers `can` from the model, and
  `tests/worker/projection-equivalence.test.ts` proves those answers equal
  the real server's. So the whole matrix is a few seconds with the network
  off, which is the only speed at which an agent will run it after every
  change. E2E keeps one job: identity, which needs real sign-in.

## Original proposed steps (not a live checklist)

- **Controls name their action.** Every button, link or form that
      performs a model action carries `data-action="MANAGE_ROSTER"` (the
      action code, nothing invented). Start from the actions
      `tests/repo/actions.test.ts` already maps to screens, so the map that
      test keeps becomes an attribute beside the control and the test reads
      it from the tree instead. Held by that test: an action with a screen
      must have a control naming it.
- **The matrix, in the render tier.** One spec: for each surface (the
      list `tests/e2e/screens.shots.ts` keeps, with its seeded object) and
      for each relation the model names for that object type — read off
      `GRANTS`, not listed by hand — plus a visitor and a signed-in stranger,
      seed the cache with the projection for that relation and render;
      collect the `data-action` values on the page. `projectTeam(id, held)`
      and its siblings already take the relation as their argument, so a
      case is one line.
- **The model check, in the same spec.** For each cell, the projection's
      `can` is the model's answer for that person on that object. Assert
      offered ⇔ granted, and report every disagreement as one line: person,
      screen, action, which side is wrong. This is the ReBAC check the GUI
      has never had, and it is what an agent reads to know what to change.
- **The table.** The same spec writes `docs/who-sees-what.md` <!-- docs-check-ignore -->
      when run with `--update`, and otherwise diffs the committed file
      against what it rendered. A changed cell is a red gate until the table
      is regenerated in the same commit, which puts the change in the diff
      for a person to read.
- **Identity on every surface.** Generalise
      `tests/e2e/identity-cache.spec.ts`: on each surface, sign in and out <!-- docs-check-ignore -->
      without a reload and assert the offered set becomes the visitor's. The
      fix of 2026-09-06 holds everywhere, not on one team page. This is the
      one part that needs the server.

## Done when

`docs/who-sees-what.md` exists and is generated <!-- docs-check-ignore -->, and the gate fails when any
screen offers a control the model does not grant that person, or withholds
one it does — for every seeded person, on every surface in the list.

## Data permutations

The Product Owner's objection, 2026-09-06: what a screen offers depends on
data as well as on who you are, so relations alone do not cover it. True,
and it splits in two.

The data the *model* knows is already in the answer: a grant can carry
`eventTypes`, and the projection takes the object's subtype, so the camp's
page and the tournament's page get different expected answers from the
same relation. One seeded object per subtype covers that, and the seed has
one event of each type.

The data the model does not know — already following, already entered,
registration closed — is state, not permission. For state the check is
asymmetric. "Never offered when refused" holds in every state, always. "Offered
when granted" is checked on the seeded object whose state shows the control,
and a control whose offer depends on state says so beside the check, with
the relation whose seeded state shows it (`STATEFUL` in the spec: Unfollow
exists only while following, and following is what FOLLOWER_TEAM means).
What this does not do is enumerate every state a control can hide in. That
is product logic, one rule at a time, and each rule has its own spec —
which is what the render tier's other specs already are.

## Log

- 2026-09-06 — written, from the GUI walk in
  [2026-09-06-01-gui-walk.md](2026-09-06-01-gui-walk.md) and the Product
  Owner's question that day.
- 2026-09-06 — first slice, to show what it looks like: the team page, in
  `tests/render/who-sees-what.spec.ts`. Its three controls name their <!-- docs-check-ignore -->
  action; the spec reads the relations a team can be held by off GRANTS,
  renders the page eight times (a visitor, a stranger, and six relations),
  compares what is offered with what the projection grants, and prints the
  matrix. Five seconds, no server, zero disagreements today. Steps one to
  three are done for this one screen; the rest of the surfaces are the same
  shape, one at a time.
