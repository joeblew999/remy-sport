# Plan — the GUI shows what the model describes

Kept, not deleted. The companion to `plan-ownership.md`, which made what exists
tell the truth. This builds what does not exist yet.

**Work it in a loop, and inspect yourself on every pass.** Same rules as
`plan-ownership.md` — its "Running unattended", "Order", and decision rules
apply here unchanged, with one addition below. Each pass: re-derive the counts,
do the next unticked box, `mise run 2-check`, tick it or write why not, append to
the log. Never end a pass having done neither.

## The problem

`plan-ownership.md` measured it: **the model grants 76 actions and the GUI offers
48.** The other 28 are recorded there as "not built", which was the honest answer
for that plan — a feature is the PO's decision and that plan did not make those.

But most of them are not decisions. They are screens over data that already
exists, and the model already says who may see them. **13 of the 21 substantive
ones are granted to PUBLIC**, so this is mostly missing product for spectators
and parents — the largest audience.

The sharpest single gap: **nobody can sign up.** Five actions, all public, and
there is no journey. A parent cannot join, a coach cannot register, a referee
cannot request approval — while `APPROVE_REFEREE` sits in the API waiting for
requests that cannot be made.

## What is buildable without asking anybody

Checked against the schema, 2026-09-03. `game` carries `venueId`, `startsAt`,
`statusCode`, `homeScore`, `awayScore`; `user` carries a role and a status
including `PENDING_APPROVAL`.

| group | actions | data |
|---|---|---|
| courts | `VIEW_COURT_ASSIGNMENTS`, `VIEW_COURT_STATUS_BOARD` | game → venue, grouped. `ASSIGN_COURTS` is already built |
| history | `VIEW_RANKINGS_HISTORY`, `VIEW_RANK_MOVEMENT`, `VIEW_SEASON_RECORDS`, `VIEW_RESULTS_ARCHIVE` | games with scores and dates |
| match status | `VIEW_MATCH_STATUS` | `game.statusCode` |
| sign-up | the five `SIGN_UP_AS_*` | `user.roleCode`, `user.statusCode`, and `APPROVE_REFEREE` |
| moderation | `DELETE_PLAYER`, `MODERATE_LISTINGS` | `player`, `event`, `team` |

**Fifteen actions, no model change, no decision from the PO.**

## What is blocked, and on exactly what

These stop at the model boundary. The model is the PO's and this plan does not
change it.

- **Brackets** — `VIEW_BRACKET`, `GENERATE_BRACKETS`, `AI_BRACKET_SUGGESTIONS`.
  There is no bracket table. A knockout draw is structure the schema does not
  have, and inventing one here would put a second model beside the PO's.
  **Needs: a bracket entity in `remy-sport-biz`.**
- **Player statistics** — `VIEW_PLAYER_STATS`. Scores are per team
  (`homeScore`, `awayScore`); nothing records what a player did.
  **Needs: per-player scoring in the model.**
- **AI** — `AI_CREATE_EVENT`, `AI_QA`. Nothing behind either, and the profile
  page's own note records that an "Ask AI assistant" button existed, did
  nothing, and was deleted. **Needs: a decision that these are real.**

## The addition to the rules

`plan-ownership.md`'s rules hold, plus one, because this plan builds rather than
corrects:

**A new screen is built from the model or not at all.** Its data comes from
existing tables, its permissions from `GRANTS`, its copy from `messages/`. The
moment a screen needs a field the model does not have, that is the boundary —
record it under **Needs the PO** with the exact field, and move to the next box.
Do not invent a column, and do not approximate one.

## Order

Cheapest first, because each proves the pattern for the next and the early ones
are read-only.

## Phase 1 — the court board

Read-only, over data that exists, and `ASSIGN_COURTS` already writes it.

- [x] `games.list` grouped by venue for an event — a tab on the event page, not
      a new route. A court board belongs to the event it is for, the same
      reasoning that keeps standings off a page of their own.
- [x] Live status per court, from `game.statusCode`. `VIEW_MATCH_STATUS` is the
      same data and is answered by this.
- [x] Public — `GRANTS` opens all three to PUBLIC, so no session is required.
- [x] Render tests — `tests/render/court-board.spec.ts`, 4 passing: in play with
      the score, free, next up, and an event with no courts assigned.

## Phase 2 — results and history

**Rewritten on pass 2. Two of the four were already built**, and building them
would have created second homes for things that already had one — the mistake
rule 2 exists to prevent.

- [x] **`VIEW_RESULTS_ARCHIVE` — already built.** Discover has a Past tab
      (`m.tab_past()`), and each event's schedule shows finished games with
      their scores. That is the archive. A separate screen would be a second
      home for the same rows.
- [x] **`VIEW_SEASON_RECORDS` — already built.** The standings tab shows Team,
      Won, Lost and Points per team for the event, which is what a season record
      is. `EVENT`-scoped in the model, so this is the right granularity.
- [x] **`VIEW_RANK_MOVEMENT` — built.** `standings.list` returns `movement` per
      row, and the table draws ▲/▼ beside the position.
- [ ] **`VIEW_RANKINGS_HISTORY` — Needs the PO.** `PLATFORM`-scoped: rankings
      *across* events, over time. Standings are computed per event and division,
      and the model has no cross-event ranking to have a history of. Same
      boundary as brackets. **Needs: a platform-level ranking in the model.**

Movement is computed, not stored: the same function over the games that finished
before the latest day of play. A `standings_history` table would be a second copy
able to disagree with the games it came from.

Null rather than zero when there is nothing earlier — before a second round,
"unchanged" claims a comparison that has not happened. The seed plays each
event on one day, so every row is null there, and the worker test asserts exactly
that rather than pretending otherwise.

- [x] Worker tests — `tests/worker/read.test.ts`, the null case and the presence
      of the field on every row.
- [x] Render: the table draws nothing when movement is null or zero.

## Phase 3 — signing up

**Rewritten on pass 3: signing up already worked.** `auth.config.ts` keeps
`disableSignUp` false, so a first-time address that receives a code gets an
account, and `user.create.before` gives it `spectator`. So
`SIGN_UP_AS_SPECTATOR` had been built all along. What did not exist was saying
you are anything else.

- [x] `me.chooseRole` — a spectator says what they are. The roles offered are
      **derived from the grants**: every `SIGN_UP_AS_*` action the model has,
      minus the `_REQUEST` suffix. Admin is absent because the PO does not grant
      it to PUBLIC, not because a list here leaves it out.
- [x] Only while you are still a spectator. That is the default a new account
      gets, so this is the sign-up question asked late rather than a way to
      change role — a coach cannot promote themselves to organiser.
- [x] The referee path is a **request**, as the model's own naming says. It
      lands `PENDING_APPROVAL`, which `session.create` already refuses to act
      on, `main.tsx` already explains to the person waiting, and
      `admin.approveReferee` already resolves. Three pieces existed; only the
      request was missing.
- [x] `components/who-are-you.tsx`, on the profile. Not on the login screen: it
      cannot know an address is new until the code is verified, so the question
      would be asked of everybody to serve almost nobody.
- [x] Worker tests — `tests/worker/sign-up.test.ts`, 6 passing: each role lands
      correctly, a referee lands pending, a coach cannot promote themselves, and
      admin is refused by the input schema rather than by a check somebody
      remembered to write.
- [x] `coverage-gui` caught `reference.list.roleCode` leaving its OFFSCREEN list
      the moment a screen rendered it. Removed with the reason.

## Phase 4 — moderation

- [ ] `DELETE_PLAYER` and `MODERATE_LISTINGS`, both PLATFORM_ADMIN, both in the
      admin console beside the existing ban and role controls.

## Phase 5 — the boundary

- [ ] Record brackets, player statistics and AI under **Needs the PO**, with the
      exact model change each requires, and stop. Do not build them.

## Definition of done

- [ ] All fifteen buildable actions have a home in the GUI, and the coverage
      sweep from `plan-ownership.md` reports them placed.
- [ ] The six blocked ones are recorded with the exact field or decision needed.
- [ ] No screen decides anything the model owns — the same grep, still clean.
- [ ] No new e2e tests. Worker tier for computation, render tier for screens.
- [ ] `mise run 2-check` green; e2e no worse than the 34 it starts at.
- [ ] Every new string in `messages/en.json`, `th.json` and `ja.json`, with
      placeholders matching.
- [ ] Nothing deferred silently.

## Log

- 2026-09-03 — **Phase 1 done.** `components/court-board.tsx`, a tab on the
  event. Three actions answered — `VIEW_COURT_STATUS_BOARD`,
  `VIEW_COURT_ASSIGNMENTS` and `VIEW_MATCH_STATUS`, since the board reads
  `game.statusCode` — with no new data, no new request and no model change.
  `games.list` already returned each game's venue and status; `ASSIGN_COURTS`
  had been writing the assignment with nowhere to read it.

  Two decisions, both recorded in the component: games with no venue are left
  out rather than bucketed under "unassigned", because the board answers "what
  is on court 2" and a game with no court is not happening anywhere; and a court
  between games says **Free** rather than rendering an empty cell, which reads
  as a page that failed to load.

  One correction from the compiler: the fixture said `statusCode: "FINAL"` and
  the model's vocabulary is `FINISHED`. Typecheck caught the invention before it
  reached a browser.

  `mise run 2-check` green, 158 render tests.

- 2026-09-03 — written, after `plan-ownership.md` completed and its measurement
  showed 28 actions with no home. Sized against the schema: fifteen need no model
  change, six do.
