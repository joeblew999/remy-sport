# Plan — close the remaining React/domain coverage gaps

Updated 2026-09-07 after implementation commit `5b9d8eb`.
Status: planned. This revision defines the remaining work; it does not authorize
inventing domain rules or claim whole-model coverage.

## Scope and completion

The user approved completing existing-model coverage while keeping five undefined
features visible. This plan includes a route to resolving all five, but their
implementation remains blocked until the Product Owner defines their rules.
Planning their resolution does not change that earlier scope decision.

There are two completion milestones:

- **Existing-model coverage complete:** every buildable action, product field and
  relationship has a verified journey or a precise internal-data classification;
  the permission and relay gaps below are resolved. Any unresolved model grant
  prevents claiming all intended existing-model permissions work.
- **Whole-model coverage complete:** the above, plus all five currently blocked
  actions delivered and verified. A deferred feature stays unfinished.

Internal identifiers, credentials and delivery bookkeeping do not need CRUD
screens. An absent product feature cannot be reclassified as internal to make
coverage pass.

## What is already delivered

Commit `5b9d8eb` added shared action gates; player box-score entry and correction;
expanded event, organisation, team and player editing/translations; profile
identity and reachable creation journeys; timezone and cache-refresh fixes;
visible mutation errors; and parent-boundary checks for fixture/session deletion.
Publishing-token issuance now requires permission for the requested game, and
watching no longer falls back to a publishing token.

The [generated inventory](react-domain-coverage.md) lists actions, schema fields,
foreign keys, gates and blockers. Its current entity-to-file mapping identifies
where to audit. It does **not** prove individual fields render or actions work.

Recorded validation from the implementation session: `bun run check` passed 800
unit/repository/worker tests and 283 render tests; `bun run test:e2e` passed 41
checks. The additional local-midnight worker regression and final focused profile
render checks passed. English phone/desktop profile and schedule viewports were
reviewed. These are historical results for the shared working tree, not a new
validation run or evidence that every combination was tested.

## Work register and execution order

The implementer owns code, tests, investigation and evidence. The Product Owner
owns unresolved domain rules. Each item closes in a reviewable commit with its
acceptance evidence recorded here and in the generated inventory where applicable.

| ID | Work | Status | Dependency | Completion evidence |
| --- | --- | --- | --- | --- |
| GAP-01 | Establish a precise coverage baseline and evidence contract | Ready | None | Every action/field/relationship has an explicit audit record; unknown additions fail |
| GAP-02 | Establish relay capabilities and choose a scoped credential design | Ready to investigate | None | Reproducible protocol check and a recorded supported design |
| GAP-03 | Enforce stream scope at the relay and handle expiry/revocation | Waiting for GAP-02 | GAP-02 | A credential for game A cannot publish game B; real relay tests pass |
| GAP-04 | Define and resolve the four coach grant mismatches | Decision needed | Product Owner rules; GAP-01 for evidence | Four intended grants resolve correctly; precise exceptions removed |
| GAP-05 | Complete field and relationship coverage in eight domain slices | Ready after baseline | GAP-01; only affected coach cases depend on GAP-04 | Each slice satisfies the shared acceptance checklist |
| GAP-06 | Complete permission and lifecycle-state matrices | Ready after baseline | GAP-01; grows alongside GAP-05 | Every relevant relation/subtype and state is exercised |
| GAP-07 | Verify persistence, delivery, navigation and identity changes | Ready per completed slice | GAP-05/06; video portion GAP-03 | Real Worker/browser journeys pass after reload and identity changes |
| GAP-08 | Complete phone, desktop, keyboard and locale review | Ready per completed slice | GAP-05/06 | Reviewed English/Thai/Japanese evidence and regression checks |
| GAP-09 | Define and deliver bracket generation and viewing | Decision needed | Product Owner competition rules | Persisted draw/progression and valid correction flows |
| GAP-10 | Define and deliver AI bracket suggestions | Decision needed | GAP-09 plus suggestion rules | Suggestions are validated and applied only through explicit acceptance |
| GAP-11 | Define and deliver ranking history across events | Decision needed | Product Owner ranking rules | Reproducible dated ranking history with corrections |
| GAP-12 | Define and deliver listing moderation | Decision needed | Product Owner listing/visibility rules | Authorized moderation transitions and correct public visibility |
| GAP-13 | Consolidate coverage checks and close the release checklist | Waiting for implementation | Relevant milestone's items | Required checks pass; report and completion claim agree |

Order: GAP-01, then GAP-02/03 and the first GAP-05 slice; carry GAP-06/07/08
through each subsequent slice. Prepare the GAP-04 and GAP-09–12 decision records
early so waiting on one definition does not stop unrelated existing-model work.
This is a dependency order, not an instruction to spawn parallel agents.

## GAP-01 — evidence that measures actual coverage

Extend `tests/repo/lib/domain-coverage.ts`, `action-coverage.ts`,
`tests/repo/domain-coverage.test.ts` and `scripts/ops/coverage-domain.ts`.

- [ ] Re-run the inventory against the current tree and record the commit plus
  relevant uncommitted changes. Preserve unrelated work and the running dev server.
- [ ] For each action, record its object, entry route/component, procedure or
  Better Auth/client operation, applicable relations/subtypes, observable result,
  and named test cases. Include public reads and background delivery.
- [ ] For each exact `entity.field` and foreign key, record display/edit/derived/
  internal intent, permitted viewers, owning surface/operation and evidence.
  Audit API response fields too: schema inventory alone misses computed outputs.
- [ ] Keep intent separate from evidence: unreviewed, declared, render verified,
  interaction verified, persistence verified, or model blocked. A passing suite
  is evidence only for the cases it actually exercises.
- [ ] Audit `health.get`, `eventTeams.list`, `playerTeams.list` and
  `teamCoaches.list`: identify the health/infrastructure use or equivalent joined
  page response. Do not add redundant fetches just to eliminate unused reads.
- [ ] Check stale blockers, unknown fields, missing source/test references and
  unaccounted additions. Add regression cases showing the check fails when an
  action's only evidence is removed or an unclassified field is introduced.

Acceptance: regenerating Markdown cannot silently convert an unclassified field
into covered. A test-file reference alone cannot mark an action verified; the
record names the behavior asserted. Remaining holes are visible and become
concrete items in the relevant GAP-05 slice.

## GAP-02/03 — close the relay authorization gap

Current evidence: `src/api/moq.ts` returns a shared publisher capability after an
API permission check. `src/web/components/moq-video.tsx` releases the camera when
the gate disappears, but a copied token is not thereby revoked at the relay.

GAP-02 deliverable: inspect the configured relay implementation/configuration and
installed client protocol without printing secrets. Verify support for stream
namespace restrictions, publish/subscribe separation, token expiry, renewal and
revocation, including already-open connections. Record supported options and the
chosen design beside the implementation or in a dedicated architecture note.
Do not assume the configured relay accepts any particular token format.

GAP-03 implementation:

- [ ] Replace client-visible shared publisher credentials with credentials scoped
  to the requested game's stream and the permitted operation. Keep issuer secrets
  server-side. If the relay cannot enforce scope, implement/select an enforcing
  relay or gateway before describing this gap as resolved.
- [ ] Define the expiry and revocation guarantee explicitly, including active
  connections. Recheck permission on issuance/renewal and prevent unauthorized
  reconnects. Handle token expiry, denied renewal, contention and device cleanup
  in the broadcast UI without losing the reader's explanation.
- [ ] Redact capability-bearing paths in relevant logs; verify error/reporting
  paths and never embed signing credentials in the browser bundle.
- [ ] Exercise a real compatible relay locally or in an isolated integration
  environment: allowed publish/watch, game-A token against game B, subscribe
  token used to publish, tampering, expiry, permission removal and reconnect.
- [ ] Prepare relay/issuer rollout, rotation and rollback together. Document
  configuration changes and service impact before any external rollout. A
  rollback that restores shared publisher credentials is not a secure resolution.

Acceptance: Worker tests establish issuance policy; relay integration tests
establish capability enforcement. Mocked API tests alone cannot close this item.
Deployment is a separate action from preparing and testing the implementation.

## GAP-04 — make the intended coach permissions resolvable

Known exceptions in `tests/repo/grants.test.ts`:

| Action | Unresolvable relations | Decision required |
| --- | --- | --- |
| `EDIT_PLAYER_PROFILE` | `HEAD_COACH`, `ASSISTANT_COACH` | Which current or historical squad relationship authorizes editing a player? What happens when the player transfers or belongs to multiple teams? |
| `RECORD_ATTENDANCE` | `HEAD_COACH`, `ASSISTANT_COACH` | Which connection between coach, player, event and session authorizes attendance? Is access limited to their players or the whole session? |

Do not assume these two actions need the same relationship traversal. For each,
prepare allowed and refused examples and record the Product Owner's decision in
the canonical `remy-sport-biz` model workflow described by `scripts/model.ts`.

- [ ] Choose the model-supported relation derivation or view after the scope is
  defined; update canonical grants/relations and sync rather than editing copies.
- [ ] Implement resolution in `src/domain/grants.ts` and affected API projections
  and handlers. Add schema/view migration only if the chosen design requires it.
- [ ] Test head and assistant coach, unrelated coach, ended membership, transfer,
  multiple teams, incorrect parent IDs and post-load permission removal.
- [ ] Make the permitted player/attendance control reachable and confirm an
  unauthorized caller is refused by the API even when bypassing React.
- [ ] Remove each exact exception only when its behavior is proven. Add a check
  that rejects stale exception entries; do not replace four entries with a broad
  action exemption.

Acceptance: four grants work according to recorded rules, with positive and
negative Worker tests and browser journeys. This is not fixed by showing buttons.

## GAP-05 — audit and finish each domain slice

The table names audit targets, not a claim that all listed functionality is
missing. Existing working journeys are reused. Each discovered gap gets an exact
field/action, observed failure, fix, test and status in the evidence contract.

| Order | Slice and code | Specific audit targets | Starting evidence |
| --- | --- | --- | --- |
| 1 | Account: `pages/profile.tsx`, `pages/login.tsx`, `components/who-are-you.tsx`, `invitations.tsx` | Role/status, meaningful responsibilities, guardian signup, player creation, invitation acceptance, referee request/approval, failed signup recovery | `tests/render/domain-settings.spec.ts`, `invitations.spec.ts`, `pending-approval.spec.ts`; `tests/e2e/spa-login.spec.ts` |
| 2 | Organisations/teams: `pages/org.tsx`, `pages/team.tsx` | Localized names/geography, org memberships, coaches, roster dates/history, add/remove, retry after partial player creation, transfers versus ordinary edits | `tests/render/org.spec.ts`, `team.spec.ts`; `tests/e2e/orgs.spec.ts`; `tests/worker/relations-write.test.ts` |
| 3 | Players: `pages/player.tsx`, `components/your-players.tsx` | Names/number/position, birth-date intent and privacy, linked account/guardian scope, team history, event entry and stats; coach editing depends on GAP-04 | `tests/render/player.spec.ts`, `your-players.spec.ts`; `tests/worker/game-stats.test.ts` |
| 4 | Events: `pages/event.tsx`, `components/event-settings.tsx`, `event-divisions.tsx`, `event-venues.tsx`, `entries.tsx`, `event-players.tsx` | All four event types, editable details, nullable values, timezone/geography, organiser/org association, divisions/primary venue, co-organisers, team/player entry and withdrawal | Existing event render specs; `tests/worker/domain-settings.test.ts`; `tests/e2e/domain-coverage.spec.ts` |
| 5 | Games/sessions: `components/schedule.tsx`, `game-stats.tsx`, `event-sessions.tsx`, `court-board.tsx` | Fixture generation/edit/delete, assignments, status, zero versus missing scores, corrections and totals, local dates, session times/attendance, stale writes | `tests/render/game-actions.spec.ts`, `event-sessions.spec.ts`; `tests/worker/fixture-boundary.test.ts`, `schedule.test.ts`; `tests/e2e/games.spec.ts` |
| 6 | Discovery/results: `pages/discover.tsx`, `live.tsx`, `event.tsx`, `team.tsx`, `player.tsx` | Browse/filter/navigation, archives, standings, season records, progress, empty results and spoiler mode; event standings are not cross-event history | `tests/render/spa.spec.ts`, `teams.spec.ts`, `court-board.spec.ts`; `tests/worker/read.test.ts` |
| 7 | Following/delivery/video: `components/follow.tsx`, `following.tsx`, `notification-settings.tsx`, `moq-video.tsx`, `pages/devices.tsx`, `video.tsx` | Follow/unfollow, channel/preference ownership, opt-out, denied browser permission, notification destination, stream absence/contention/recovery | Notification/push/MoQ render and worker specs; relay evidence from GAP-03 |
| 8 | Administration: `pages/admin.tsx` and Better Auth integration | Account create/manage, referee approval, impersonation exit, deletion consequences, non-admin refusal and affected-user refresh | `tests/render/admin.spec.ts`, `admin-reachable.spec.ts`; `tests/e2e/admin-console.spec.ts`, `authz.spec.ts` |

Every slice must satisfy GAP-06–08 before closing. For a stored relationship with
no defined editing action, classify the existing read/derived behavior and record
any missing product decision; do not invent relationship administration.

## GAP-06–08 — acceptance checklist for every slice

GAP-06, permission and state:

- [ ] Derive expected permissions from canonical grants, not copied role lists.
  Cover visitors, signed-in strangers, every applicable relation/subtype,
  unrelated-object relations and representative multiple-relation users.
- [ ] Extend the shared gates and `tests/repo/action-gates.test.ts` where action
  controls remain manually guarded. Keep read actions and Better Auth-owned
  operations explicitly accounted for rather than forcing every case into `Can`.
- [ ] Exercise follow/unfollow, invited/accepted, entered/withdrawn, stream
  available/occupied and other relevant alternatives. Test open-form permission
  loss and direct API bypass. Server authorization remains authoritative.
- [ ] Cover loading, pending, success, empty, validation, refusal and retry.
  Check duplicate submits and partial-write recovery; add conflict handling where
  an observed state race can corrupt or misrepresent the result.

GAP-07, real persisted journeys:

- [ ] Run the relevant permitted change through the browser against a real
  Worker, reload and inspect the stored result and affected related views.
- [ ] Verify sign-out, account switch, approval and relationship removal refresh
  data and controls. Reuse existing identity tests and extend missing cases.
- [ ] For notifications, verify subscription/preference filtering, opt-out,
  deduplication and destination navigation using a local delivery sink. Record
  any external-provider verification separately; never contact real recipients
  as an incidental test step.
- [ ] Restore test changes or use isolated fixtures; do not overwrite data someone
  entered while trying the running dev system.

GAP-08, usable presentation:

- [ ] Check phone and desktop, English/Thai/Japanese, long translated names,
  missing translations, dates/timezones, and all newly expanded forms.
- [ ] Exercise keyboard traversal, labels, focus on errors and after dialogs,
  accessible status messages and narrow-screen overflow.
- [ ] Capture the actual viewport and scroll to review offscreen controls;
  one top-of-page screenshot cannot certify the whole journey. Save findings
  and fixes in the tree; add behavioral/layout regression checks for defects.

## GAP-09–12 — decision packets for all five blocked actions

Prepare concrete examples and proposed options for Product Owner review. Each
packet must end with recorded rules, example inputs/outputs, allowed/refused
transitions, data ownership and correction policy. No implementation starts from
an unanswered rule. Existing-model work continues while these remain blocked.

| Item/actions | Rules the Product Owner must define | Implementation after definition | Required proof |
| --- | --- | --- | --- |
| GAP-09: `VIEW_BRACKET`, `GENERATE_BRACKETS` | Supported pilot format, guaranteed games, seeding/byes, rounds, progression, ties/withdrawals, regeneration after results | Canonical model, schema/migration/fixtures, deterministic generator, authorized preview/apply, persisted draw and viewing route | Approved small competition examples produce exact fixtures; advancement and corrections agree with results; regeneration cannot silently discard played games |
| GAP-10: `AI_BRACKET_SUGGESTIONS` | Suggestion inputs/output, allowed changes, constraints, review/accept rules and what happens when no valid suggestion exists | Suggestions over the approved bracket model; deterministic validation; explicit organizer review before applying; timeout/refusal/retry UI | Invalid suggestions cannot apply; rejecting a suggestion changes nothing; accepted valid output persists through the same authorized write path |
| GAP-11: `VIEW_RANKINGS_HISTORY` | Ranked subject, formula, eligible events, season boundaries, ties, snapshots and backdated corrections | Canonical ranking definitions, calculation/snapshots, historical API and reachable dated comparison view | Published sample results reproduce rankings; historical corrections follow the defined policy; reload shows the same dated positions |
| GAP-12: `MODERATE_LISTINGS` | What a listing is, submitter/moderator roles, states/transitions, reasons/history and public visibility | Canonical listing/moderation model, migration, API authorization, review queue, decisions and submitter/public views | Non-moderators cannot decide; pending/rejected content obeys visibility rules; every decision persists with its required history |

For each item: test migration on existing data, add fixtures, implement API and
React, test authorization/persistence/recovery and run GAP-08. Remove its entry in
`tests/repo/lib/action-coverage.ts` only after the journey passes. Do not assume
single elimination or substitute event standings for ranking history.

## GAP-13 — completion and regression protection

- [ ] Generate `docs/react-domain-coverage.md` from the evidence contract. Include
  separate counts for verified, unreviewed, internal and model-blocked items.
- [ ] Reconcile `coverage-gui.ts`, `coverage-data.ts` and `coverage-model.ts` with
  the shared inventory, including Better Auth and client-only actions. Retire
  overlapping diagnostics only when their useful checks have replacements.
- [ ] Run `bun run check` and `bun run test:e2e`; record the actual counts, commit
  and tree state. Run selected `bun run shots` captures for changed journeys.
  Scoped relay integration has its own required command documented by GAP-03.
- [ ] Review migrations, rollout dependencies and rollback before proposing any
  deployment. Do not mix unrelated shared-tree changes into completion commits.
- [ ] Update this register with commit/test evidence. Close the existing-model
  milestone only when its work is proven; keep GAP-09–12 visibly blocked if
  undecided. Claim whole-model completion only when every item is closed.

A failing behavior is fixed in its owning slice before that slice is marked
complete. If a new domain decision is required, record the exact decision and
its impact here instead of adding an unexplained exception or a placeholder UI.
