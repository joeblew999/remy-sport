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

**One of the two was buildable. The other is the boundary.**

- [x] **`DELETE_PLAYER` — built.** `players.remove` and a section in the admin
      console. Four tables carry a non-null FK to `player.id` — squads, event
      entries, attendance and guardians — and none is ON DELETE CASCADE, so the
      procedure clears them in one batch first, exactly as `teams.remove` does.
- [x] **Not on the roster, deliberately.** That is a coach's tool, and its
      "Remove" *ends a spell*: `playerTeam` carries from and to dates, so a
      departure stops granting access without making last season's team sheet
      wrong. This deletes the person. The two side by side would invite the
      mistake — the same reasoning that put `DELETE_TEAM` here rather than beside
      the team edit form.
- [x] **The gate found a bug in `me.mine`.** `PLATFORM_ACTIONS` claimed to hold
      "the grants with no object to act upon" and tested the *action's* object
      type. `DELETE_PLAYER` names PLAYER and failed that test while its only
      grant is PLATFORM_ADMIN — a relation nobody holds on a player. It now
      tests the granting relations, which is what the comment always said. 25
      actions became 47, at no cost: every platform relation is `via: "role"` or
      `via: "everyone"`, both answered from the session.
- [x] Tests — worker: the subject derived from the seed, since a player with no
      squad and no entry would pass while proving nothing; coach refused at 403
      over their own roster, signed out 401, unknown id 404. Render: gated on the
      model's answer, with a case seeding an admin who holds the console and not
      this, so `isAdmin` cannot creep back in.
- [ ] **`MODERATE_LISTINGS` — Needs the PO.** There is no listing. No `listing`
      entity, no event status vocabulary, and no moderation state on any table —
      nothing is hidden, flagged, held or withdrawn anywhere in the schema. The
      action is PLATFORM-scoped with no object type, so it does not even say
      *what* is moderated. Building it means inventing both the noun and the
      verb, which is precisely what this plan's own rule forbids.
      **Needs: a moderation state on whatever a listing turns out to be.**

## Phase 5 — the boundary

**Eight actions stop here.** Each names the exact model change it waits on. None
was approximated, and none is half-built.

- [x] **Brackets — `VIEW_BRACKET`, `GENERATE_BRACKETS`, `AI_BRACKET_SUGGESTIONS`.**
      There is no bracket table. A knockout draw is structure the schema does not
      have, and inventing one would put a second model beside the PO's.
      **Needs: a bracket entity in `remy-sport-biz`.**
- [x] **Player statistics — `VIEW_PLAYER_STATS`.** Scores are per team
      (`homeScore`, `awayScore`). Nothing records what a player did.
      **Needs: per-player scoring in the model.**
- [x] **AI — `AI_CREATE_EVENT`, `AI_QA`.** Nothing behind either, and the profile
      page's own note records that an "Ask AI assistant" button existed, did
      nothing, and was deleted. **Needs: a decision that these are real.**
- [x] **Rankings history — `VIEW_RANKINGS_HISTORY`.** `PLATFORM`-scoped:
      rankings *across* events, over time. Standings are computed per event and
      division, and there is no cross-event ranking to have a history of.
      **Needs: a platform-level ranking in the model.**
- [x] **Moderation — `MODERATE_LISTINGS`.** No listing entity, no moderation
      state. **Needs: a moderation state on whatever a listing turns out to be.**

Two of these were found *during* the work rather than sized in advance —
`VIEW_RANKINGS_HISTORY` on pass 2 and `MODERATE_LISTINGS` on pass 4. Both were
in the "buildable without asking anybody" table above, and both turned out not to
be. The table is left uncorrected on purpose: it is the estimate, and the gap
between it and this section is the honest record of what examining the schema
changed.

## Definition of done

- [x] **Thirteen of the fifteen have a home in the GUI.** Two turned out blocked
      when examined rather than estimated — recorded in Phase 5, not skipped.
- [x] **Eight blocked actions recorded** with the exact field or decision each
      needs. Six were sized in advance; two were found in the work.
- [x] No screen decides anything the model owns — the same grep, still clean.
      The one place it nearly happened was gating the new console section on
      `isAdmin`, which a render test now forbids.
- [x] No new e2e tests. Worker tier for computation, render tier for screens.
- [x] `mise run 2-check` green, 226 render tests; e2e unchanged at 34.
- [x] Every new string in `messages/en.json`, `th.json` and `ja.json`, with
      placeholders matching — enforced by `check:messages`, not by memory.
- [x] Nothing deferred silently.

## What this plan did not fix, and knows

**The action count cannot be measured by grep.** A sweep for each action code
across `src/api` and `src/web` reports 37 with no mention — including the court
board built in Phase 1 and the sign-up flow built in Phase 3, neither of which
ever writes its action's name. The court board is reached through `games.list`;
the sign-up roles are *derived* from the `SIGN_UP_AS_*` grants, so the literals
correctly do not appear.

So "48 of 76 in the GUI" was, and remains, a judgment made action by action, not
a number a script produces. `gui-coverage` measures what it can measure honestly
— 71/75 procedures called from the SPA, 576/591 output fields named — and that
is a different question. A checker for the action question would need to know
which screen answers which grant, which is a mapping nobody has written down.

**That is the next plan, if there is one:** a declared link from an action to the
screen that answers it, so the question stops needing a person to re-derive.

## The residue, triaged — 2026-09-03, after the fixtures grew

`ops coverage data` now reports **79/80 vocabulary codes used and 25/25
relations instantiated**: the tables have rows they did not have. So the question
worth asking again is what the GUI still does not do with them.
`ops coverage gui` says **71/75 procedures called, 576/591 fields named**. Every
item behind those numbers, checked:

- **`teamCoaches.list`, `playerTeams.list`, `eventTeams.list` — not gaps.** They
  are the whole-table endpoints `domain.ts` generates. The screens use the
  joined ones instead: coaching staff is on the team page through
  `roster.coaches`, the squad through `roster.players`, the entrants through
  `events.entries`. A screen calling the raw table would be a second home for
  rows that already have one.
- **`health.get` — not a gap.** Infrastructure. It has no reader.
- **`toDate` on `playerTeams` and `teams.removePlayer` — a recorded decision,
  not an oversight.** `players.mine` fetches every spell and keeps the current
  one, and says why: a profile listing every team a child ever played for
  "answers a different question from where is my child playing". The seed does
  hold a real departure — `ply_002` left `team_001` on 2026-03-31 — so a squad
  history is now *buildable*. Whether it is *wanted* is the PO's call, and
  overriding a written decision on the strength of an unused field would be
  building from leftovers rather than from the model.
- **`withdrawn`, `addedAt` — mutation receipts.** The screens invalidate and
  re-read rather than rendering the acknowledgement, which is the pattern
  everywhere else here.
- **`reference.list`, 9 of 49 fields.** `minAge`/`maxAge` on age groups is the
  only one with obvious product in it — an event showing "U16 · ages 13–16"
  instead of a bare code. The rest are catalogue plumbing
  (`notificationCategories`, `addressFormat`, `fullNameEn`).

**So: no screen is missing that the model asks for.** Two candidates are
buildable and are product decisions rather than gaps — a player's squad history,
and age ranges beside age-group codes. Both are recorded here rather than built,
for the same reason `MODERATE_LISTINGS` was.

## Log

- 2026-09-03 — **Phases 4 and 5 done; the plan is complete.** `DELETE_PLAYER`
  built, `MODERATE_LISTINGS` recorded as blocked. Thirteen actions gained a home
  across four phases; eight are at the model boundary with the change each needs
  written down.

  The pass found a real bug rather than just building: `PLATFORM_ACTIONS` in
  `me.ts` tested the action's object type while claiming to test whether anyone
  needs an object to hold the grant. `DELETE_PLAYER` is the case where those two
  differ, and it could not be asked about at all. Widened to the relations, which
  is what the comment above it always said — 25 actions to 47, no extra queries,
  because every platform relation resolves from the session.

  Two premises of my own were wrong and the tests caught both: `isRefusedStatus`
  is about account status codes, not HTTP ones — the failure message said "a
  coach got 403", which was the endpoint working correctly and the assertion
  wrong. And a type helper built from `Parameters<typeof entry<...>>` did not
  compile; the file already had a `ResponseOf` idiom for exactly this, so
  `ApiPlayerRow` uses it, with no factory beside it because `domain.ts` derives
  that response from the table and a fixture with defaults is where a new column
  would silently go missing.

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
