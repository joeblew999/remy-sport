# Plan — React GUI coverage of the whole domain model

Requested 2026-09-07. Status: implementation in progress; existing-model scope approved.

## Outcome

Every domain action has a usable journey for the people allowed to perform
it. Every entity, relationship and product-relevant field has a deliberate
place in that journey. Coverage includes reading, changing data, seeing the
saved result, permission refusals, empty states and recovery from errors.

The Product Owner approved completing existing-model coverage while keeping
the five actions with undefined domain rules visibly blocked. They are outside
this implementation scope and remain unfinished. A documented exception is accounted for,
not delivered. Internal IDs, credentials, transport acknowledgements and
operational records do not need user-facing CRUD screens.

## Evidence from the current working tree

The tree contains ongoing work by other agents. These findings describe that
tree, not just the last commit. Re-run the baseline before implementation.

- `scripts/ops/coverage-model.ts` reports 74 actions: 40 enforced, 27 public,
  one client-only and six reported missing. These are enforcement categories,
  not evidence of working GUI journeys. In particular, public bracket and
  ranking-history actions count as public even though their features are absent.
- `tests/repo/actions.test.ts` accounts for actions using component `@answers`
  comments and explicit exceptions. Its buildable-but-unbuilt list is empty;
  its blocked list contains five actions. Comments prove a declaration, not
  that a control works.
- Both coverage scripts find 73 of 77 router procedures referenced in React.
  No write in that router is stranded. The four uncalled reads are
  `health.get`, `eventTeams.list`, `playerTeams.list` and `teamCoaches.list`.
  Joined page responses may already cover the three relationship reads.
- `scripts/ops/coverage-gui.ts` reports 554 of 576 output field occurrences
  named in web sources. It searches names globally, so an unrelated use or a
  comment can make a field appear covered. This is not 96% GUI completeness.
- Its unnamed fields include event `gameCount` and `playedCount`, invitation
  `addedAt`, reference metadata and withdrawal acknowledgements. Each needs a
  product decision: display, derive, use for interaction, or keep internal.
- The enforcement report misses non-router implementations: the admin page
  uses Better Auth for account management, and notification settings declare
  `RECEIVE_NOTIFICATIONS`. Verify these journeys before calling them unbuilt.
- The existing GUI walk records an unresolved profile problem: a coach sees
  little about their own identity and responsibilities. This belongs in the
  account slice below. The separate Vite config restart race stays tracked in
  `docs/2026-09-06-01-gui-walk.md`; it is not a domain coverage prerequisite.

Sources: `src/domain/model/`, `src/domain/grants.ts`, `src/domain/api.ts`,
`src/db/app-schema.ts`, `src/db/fixtures-schema.ts`, `src/api/index.ts`,
`src/web/pages/`, `src/web/components/` and the coverage checks above.

## 1. Make the coverage inventory trustworthy

- [ ] Derive the inventory of actions, entities, relationships, vocabulary
  values and fields from the existing model and schemas. Include Better Auth
  and client-only features alongside the domain router.
- [ ] Keep an executable mapping under `tests/repo/` from each model item to
  its screen/component, read or write operation, relevant relations/subtypes,
  observable result and supporting test. Generate a readable report in docs
  from this mapping; do not maintain another independent model in prose.
- [ ] Record separate statuses: declared, rendered, interaction verified,
  blocked by model, intentionally internal. Preserve exact entity/field paths
  rather than treating every field named `names` as the same field.
- [ ] Fail on unaccounted additions, invalid references and stale exceptions.
  Keep the current name-search reports as diagnostics until the replacement
  is useful, then consolidate their overlapping logic.
- [ ] Audit the 22 unnamed field occurrences and four uncalled reads. Add
  meaningful event progress and invitation context where useful; explain
  derived labels and internal response fields without inventing screens to
  improve a percentage.

Acceptance: the report distinguishes a declared feature from a demonstrated
journey and exposes all remaining work. Removing an action's only journey or
adding an unclassified model field makes the repository check fail.

## 2. Finish the shared permission and state foundation

Build on `docs/2026-09-06-03-one-gate.md` and
`docs/2026-09-06-02-who-sees-what.md`; these are dependency plans, not completed
infrastructure. The existing matrix only exercises the first team-page slice.

- [ ] Pilot the shared action gate on games, including score entry, assignment
  and broadcasting. Make action controls identifiable in the rendered page.
- [ ] Keep server authorization authoritative on every mutation. Distinguish
  permission from current action availability and from presentation state;
  loading a tab or expanding a form does not belong in domain permissions.
- [ ] Recheck state when writing and return useful conflict/refusal feedback.
  Refresh affected queries after writes, identity changes and relevant live
  updates. A previously enabled button cannot guarantee a later write succeeds.
- [ ] Extend the relation/subtype matrix to every surface. Test stateful
  alternatives such as follow/unfollow, invited/accepted, registered/withdrawn
  and broadcast available/occupied. Include visitors, strangers, unrelated
  object relations and people holding more than one relation.
- [ ] Keep read/display actions and background notification delivery in the
  coverage mapping too; they cannot all be represented by a gated button.

Acceptance: granted actions are reachable in eligible states; refused actions
cannot execute; stale state produces recoverable feedback. Unit and worker
tests establish permissions, render tests establish visible behavior, and
identity tests establish that changing accounts changes the controls.

## 3. Complete journeys by domain area

These are audit-and-complete slices. Existing controls are reused and verified;
the table does not claim every listed capability is missing. Add API/model
work only where the audit establishes that an intended journey needs it.

| Order / area | Existing React home | Model coverage and completion target |
| --- | --- | --- |
| 1. Account and identity | `src/web/pages/profile.tsx`, `src/web/pages/login.tsx`, `src/web/components/who-are-you.tsx` | User identity, signup roles, referee request/approval state, guardian/player links, invitations and sign-in/out. Show meaningful account information for coaches, organisers, parents and multi-role users; link responsibilities to their objects. |
| 2. Organisations and teams | `src/web/pages/org.tsx`, `src/web/pages/teams.tsx`, `src/web/pages/team.tsx` | Organisation profile and memberships; team profile, coaches, roster membership dates, joining/leaving relationships and schedule/record. Verify invitation acceptance/removal and roster changes persist and refresh permissions. Classify relationship administration not currently expressed as a model action before adding it. |
| 3. Players | `src/web/pages/player.tsx`, `src/web/components/your-players.tsx` | Player identity, names, number, position, appropriate age information, linked account/guardians, team history, event participation and game stats. Exercise coach creation and guardian signup separately; classify sensitive fields by viewer rather than exposing every stored value publicly. |
| 4. Event setup and entry | `src/web/pages/event.tsx`, `src/web/components/event-settings.tsx`, `src/web/components/event-divisions.tsx`, `src/web/components/event-venues.tsx`, `src/web/components/entries.tsx`, `src/web/components/event-players.tsx` | Event types, format, names, description, dates/timezone, geography, organisation, certification, co-organisers, divisions, venues/primary venue and team/player registration. Exercise TOURNAMENT, LEAGUE, CAMP and SHOWCASE according to model grants. Saved changes and withdrawals must be visible after reload. |
| 5. Schedule, games and sessions | `src/web/components/schedule.tsx`, `src/web/components/event-sessions.tsx`, `src/web/components/court-board.tsx` | Fixtures, court/referee assignments, game status/results, nullable scores, player box scores, session times and attendance. Verify valid transitions, no-score versus zero, timezone display, reassignment and stale-write handling. |
| 6. Discovery and results | `src/web/pages/discover.tsx`, `src/web/pages/live.tsx`, `src/web/pages/event.tsx`, `src/web/pages/team.tsx`, `src/web/pages/player.tsx` | Browse/filter/navigation, schedule, live scores, archives, standings, rank movement, season records and player statistics. Verify each action's actual meaning against the model; standings within an event do not substitute for cross-event ranking history. |
| 7. Following, delivery and video | `src/web/components/follow.tsx`, `src/web/components/following.tsx`, `src/web/components/notification-settings.tsx`, `src/web/pages/devices.tsx`, `src/web/pages/video.tsx` | Subscriptions, notification channels/preferences, devices, received-notification destination, stream viewing/broadcasting, install and spoiler mode. Verify opt-out, denied browser permission, unavailable stream, and enabled/disabled delivery. Keep channel secrets and delivery bookkeeping internal. |
| 8. Administration | `src/web/pages/admin.tsx` | Account creation/management, referee approval and permitted destructive operations. Cover Better Auth calls as well as domain procedures; verify non-admin refusal and the affected user's refreshed state. Moderation waits for phase 4 below. |

For each slice:

- [ ] Trace every field and relationship to visible output, an interaction,
  a derived value or a specific internal-only reason.
- [ ] Verify permitted mutations through the GUI, then reload and read the
  persisted result. Cover validation, pending, success, empty, failure and
  permission-loss states with recovery paths.
- [ ] Check phone and desktop layouts, keyboard operation, focus, labels and
  English/Thai/Japanese display, including long names and locale fallback.
- [ ] Update the generated coverage report and its supporting tests in the
  same commit. Turn any discovered defect into the next concrete fix in that
  slice; do not replace a broken journey with an exemption.

## 4. Resolve the five model-bound actions

These need explicit domain definitions before schema or UI implementation.
Resolve them in the canonical model workflow; do not hand-edit copied model
files to invent product decisions. Once defined, carry each through schema,
migration, fixtures, API, authorization, React and verification.

| Actions | Decision and data needed | Intended GUI completion |
| --- | --- | --- |
| `VIEW_BRACKET`, `GENERATE_BRACKETS`, `AI_BRACKET_SUGGESTIONS` | Supported competition format; rounds, seeds, progression and guaranteed games; regenerate rules after results; for AI, the suggestion contract and review/accept behavior. Existing notes say plain single elimination does not fit the pilot evidence. | Event draw generation and viewing; organiser reviews suggestions before applying them; persisted draw and progression agree with fixtures/results. |
| `VIEW_RANKINGS_HISTORY` | Cross-event ranking subject, formula, season boundaries, eligibility and dated snapshots; distinguish this from existing event standings. | A reachable history view with dated positions and changes, backed by reproducible calculations. |
| `MODERATE_LISTINGS` | What a listing is, moderation states, allowed transitions, moderator grants, reasons/history and public visibility. | Admin review queue and decision flow, plus the appropriate submitter/public result. |

- [ ] Record these decisions in the repository and canonical model process.
- [ ] Implement and verify each complete journey; remove its blocked entry
  only when it has real UI and supporting behavior tests.

Acceptance: all five are delivered, or an explicit scope change updates the
model and this plan. Remaining blockers prevent claiming whole-model coverage.

## Validation and completion

Start with `bun scripts/ops/coverage-model.ts`,
`bun scripts/ops/coverage-gui.ts` and the existing actions repository test.
Use focused unit/worker/render tests while completing each slice. Before
finishing implementation, run `bun run check` and `bun run test:e2e` for the
integrated journeys; use `bun run shots` for visual review. Screenshot
presence alone does not establish behavior.

- [ ] Every model item is accounted for; every user-facing action has a
  verified journey and no unresolved blocked action remains.
- [ ] All product-relevant fields and relationships are represented in the
  intended viewer's GUI; internal fields have precise reasons.
- [ ] Permission, subtype and representative lifecycle-state coverage spans
  all surfaces, including negative cases and account changes.
- [ ] Real persistence, navigation and notification destinations work across
  representative end-to-end journeys.
- [ ] Repository checks prevent silent coverage regression. No claim of
  completeness relies solely on source-name matching or comments.

Implementation order: inventory → games permission pilot → domain slices in
the table. Model decisions for the final five actions can be developed while
the existing-model slices progress. The first reviewable implementation should
contain the inventory and games pilot, with measured gaps and tests, before
rolling the pattern across the application.


## Implementation record — 2026-09-07

The user approved existing-model coverage and keeping all five blockers visible.
The generated [inventory](react-domain-coverage.md) records action declarations,
shared gates, exact schema fields, foreign keys and the four unresolvable grant
pairs. It is checked for drift; it is not field-level behavioral proof.

Implemented in the working tree:

- Shared typed `Can`/`PlatformCan` gates, piloted on games and used by team,
  player editing, live broadcasting, event invitations and creation journeys.
  Repository checks reject direct permission reads on migrated surfaces.
- Player box-score read/write endpoints and scorekeeper forms, preserving zero
  versus missing counts, permitting corrections and clearing recorded lines.
- Event names/translations, details, geography, timezone and nullable dates;
  organisation geography/translations; team/player translations; profile account
  identity and reachable player creation; event creation from Discover.
- Fixture and first-session entry use the event timezone. Event progress and
  invitation dates are visible. Refused mutations in the audited controls show
  errors. Player creation retries roster attachment without duplicating players.
- Fixture writes/deletes and session deletes verify the parent before touching
  children; deletion removes dependent rows atomically. Video publishing config
  requires the game's broadcast grant; viewing never falls back to a publish token.

Validation: `bun run check` passed (800 unit/repository/worker tests and
283 browser render tests). `bun run test:e2e` passed all 41 tests, including
new event creation/edit/clear/reload and box-score save/reload journeys.
The additional event-local-midnight regression passed in its focused worker
run; final typecheck passed. English phone and desktop profile/schedule
screenshots were reviewed. Profile spacing was corrected, and screenshot
capture now uses the actual viewport rather than adding blank pixels below
the fixed-height scrolling app shell. Screenshots do not prove offscreen rows.

Remaining work must not be represented as complete: exhaustive per-field
classification and action-to-behavior evidence, remaining surface permission
matrices, broader reload/persistence journeys and visual review across all locales.
The existing four cross-object grant mismatches need canonical model decisions.
The relay still uses a shared publisher token: API permission controls token
issuance, but the relay cannot restrict that token to the authorized game.
Per-game short-lived relay credentials remain a concrete infrastructure gap.
