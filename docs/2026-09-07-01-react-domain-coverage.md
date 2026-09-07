# Plan — close the remaining React/domain coverage gaps

Updated 2026-09-07 against HEAD `71c28ab` and the shared working tree.
Status: implementation in progress; domain decisions are accepted in the biz
repository. Coach access and browser session revocation have landed. Coverage
auditing, relay enforcement and the five feature implementations remain open.

## Resume here

This is the main work register. Read the latest checkpoints below alongside
its status table; their test results describe the recorded checkout, not a fresh
run. Check `git status` before editing: the shared tree contains substantial
pending GUI, development tooling, relay and evidence changes from other work.

- Broadcasting is configured and verified locally and on staging. The
  [staging rollout](2026-09-07-03-staging-broadcast.md) records deployed main
  `fbcd6c5` and real-relay delivery/stop/restart evidence. Production is unchanged.
  The [relay handoff](2026-09-07-02-relay-capabilities.md) records the remaining
  per-game enforcement gap; no more dashboard setup is needed for these relays.
- Latest committed coverage slice: `71c28ab`, browser session revocation and persisted
  failure/retry journeys. Remaining work includes development service-worker
  reload verification and phone/locale/keyboard review.
- Next independent work: continue GAP-01 item review and GAP-05–08 journeys in
  the order below. The current generated inventory reports 1,375 items, 64
  classified and 1,311 unreviewed; this includes uncommitted classifications.
  Reconcile each with its named behavioral evidence before claiming completion.
- Relay work: read [the relay investigation](2026-09-07-02-relay-capabilities.md).
  Local Cloudflare support is restored in the pending changes. Its recorded
  checks found missing publish/watch tokens and relay API HTTP 403. Real
  delivery and stream isolation remain unverified; this blocks the relay slice,
  not the independent coverage work.
- Earlier GUI work is in [the GUI walk](2026-09-06-01-gui-walk.md),
  [who sees what](2026-09-06-02-who-sees-what.md) and
  [one gate](2026-09-06-03-one-gate.md). Their original unchecked steps predate
  the shared gates recorded below; do not implement them again from the boxes
  alone. Full matrices and reveal mode are not certified by the gate's existence.
- Accepted product rules remain Decision 006 linked below. Listing moderation
  precedes new public bracket/ranking routes; those features remain unfinished.

This reconciliation inspected docs, commit history and source; it did not rerun
application tests or recheck external credentials.

## Scope and completion

The Product Owner subsequently delegated all five feature decisions and coach
permission rules to the implementation agent and authorized editing the biz repo.
[Decision 006](../../remy-sport-biz/decisions/decision-006-domain-completion.md) and
[its implementation specification](../../remy-sport-biz/docs/domain-completion-decisions.md)
now define the accepted rules. They supersede the earlier decision-pending scope.
The five missing features remain visibly unfinished until implemented and verified.

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

The implementer owns code, tests, investigation and evidence. The Product Owner has delegated the domain rules; the accepted biz specification
owns their meaning. Record any necessary revisions there rather than improvising
in application handlers. Each item closes in a reviewable commit with its
acceptance evidence recorded here and in the generated inventory where applicable.

| ID | Work | Status | Dependency | Completion evidence |
| --- | --- | --- | --- | --- |
| GAP-01 | Establish a precise coverage baseline and evidence contract | Contract implemented; item review in progress | None | Every action/field/relationship has an explicit audit record; unknown additions fail |
| GAP-02 | Establish relay capabilities and choose a scoped credential design | Preliminary review recorded; real relay verification blocked on access | None | Reproducible protocol check and a recorded supported design |
| GAP-03 | Enforce stream scope at the relay and handle expiry/revocation | Waiting for GAP-02 | GAP-02 | A credential for game A cannot publish game B; real relay tests pass |
| GAP-04 | Define and resolve the four coach grant mismatches | Implemented in `8a244c4`; broader matrix audit continues under GAP-06 | Biz Decision 006; GAP-01 for evidence | Four intended grants resolve correctly; precise exceptions removed |
| GAP-05 | Complete field and relationship coverage in eight domain slices | Ready after baseline | GAP-01; only affected coach cases depend on GAP-04 | Each slice satisfies the shared acceptance checklist |
| GAP-06 | Complete permission and lifecycle-state matrices | Ready after baseline | GAP-01; grows alongside GAP-05 | Every relevant relation/subtype and state is exercised |
| GAP-07 | Verify persistence, delivery, navigation and identity changes | Ready per completed slice | GAP-05/06; video portion GAP-03 | Real Worker/browser journeys pass after reload and identity changes |
| GAP-08 | Complete phone, desktop, keyboard and locale review | Ready per completed slice | GAP-05/06 | Reviewed English/Thai/Japanese evidence and regression checks |
| GAP-09 | Define and deliver bracket generation and viewing | Rules accepted; implementation pending | Biz draw specification | Persisted draw/progression and valid correction flows |
| GAP-10 | Define and deliver AI bracket suggestions | Rules accepted; implementation pending | GAP-09 plus biz AI specification | Suggestions are validated and applied only through explicit acceptance |
| GAP-11 | Define and deliver ranking history across events | Rules accepted; implementation pending | Biz ranking specification; GAP-12 visibility | Reproducible dated ranking history with corrections |
| GAP-12 | Define and deliver listing moderation | Rules accepted; implementation pending | Biz publication specification | Authorized moderation transitions and correct public visibility |
| GAP-13 | Consolidate coverage checks and close the release checklist | Waiting for implementation | Relevant milestone's items | Required checks pass; report and completion claim agree |

Order: GAP-01, then GAP-02/03 and the first GAP-05 slice; carry GAP-06/07/08
through each subsequent slice. Follow the accepted GAP-04 and GAP-09–12 rules. Implement GAP-12 publication
visibility before exposing new bracket/ranking public routes, then GAP-09 draws,
GAP-11 rankings and GAP-10 AI. GAP-04 attendance resolves by removing unintended
coach grants; player editing requires a current-squad relation.
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

## GAP-04 — implement the accepted coach permissions

Accepted: current head/assistant coaches may edit names, number and position;
attendance belongs to owners, accepted co-organizers and admins. Birth dates stay
outside ordinary profile editing. See the biz specification for temporal boundaries.

Known exceptions in `tests/repo/grants.test.ts` (historical questions below are now
answered by Decision 006):

| Action | Unresolvable relations | Decision required |
| --- | --- | --- |
| `EDIT_PLAYER_PROFILE` | `HEAD_COACH`, `ASSISTANT_COACH` | Which current or historical squad relationship authorizes editing a player? What happens when the player transfers or belongs to multiple teams? |
| `RECORD_ATTENDANCE` | `HEAD_COACH`, `ASSISTANT_COACH` | Which connection between coach, player, event and session authorizes attendance? Is access limited to their players or the whole session? |

Do not assume these two actions need the same relationship traversal. For each,
use the accepted allowed/refused examples and update the canonical model through
the workflow described by `scripts/model.ts`. Do not fetch over local biz changes.

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

Acceptance: intended current-coach player access works and unintended coach
attendance grants are removed, with positive/negative Worker tests and browser
journeys. All four mismatch exceptions are eliminated by the appropriate change. This is not fixed by showing buttons.

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

## GAP-09–12 — implement all five defined but unbuilt actions

Decision 006 in the biz repository now supplies these rules and worked examples.
The table below remains the implementation checklist; its former open questions
are answered there. Use the defined 3–8 team pool/championship format, reviewed AI
suggestions, division/season team Elo, and versioned event-publication moderation.
Extend executable model/schema/API/React together in each tested slice.

| Item/actions | Rule dimensions covered by Decision 006 | Implementation after definition | Required proof |
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
  milestone only when its work is proven; keep GAP-09–12 visibly unfinished until their implementations pass. Claim whole-model completion only when every item is closed.

A failing behavior is fixed in its owning slice before that slice is marked
complete. If a new domain decision is required, record the exact decision and
its impact here instead of adding an unexplained exception or a placeholder UI.


## Decision handoff — 2026-09-07

Canonical decisions committed in `remy-sport-biz` as `c5b6bd6`. Biz model and
documentation checks passed; runtime behavior is unchanged by this decision commit.

The application model and its exception lists still describe the pre-decision
implementation. No schema or grant was changed merely to make an inventory green.
Next implementation: GAP-01 evidence contract and GAP-04 canonical coach relations/
attendance grants, with model sync and regression tests in the same work slice.
Relay investigation can proceed independently. Do not re-request the Product Owner
decisions already delegated and recorded in Decision 006.


## Implementation checkpoint — 2026-09-07

Canonical coach access is committed in biz as `65a05f2`. The application copy,
additive migration 0017, four-direction resolver, player edit UI and regression
checks implement the accepted GAP-04 rules. Current head/assistant coaches can
edit names, jersey and position through any qualifying squad; future and expired
memberships do not qualify. Start/end days are inclusive in UTC. Team-manager
status grants no player edit permission. Camp attendance requires organizer,
accepted co-organizer or platform admin access. Removed all four grant exceptions.
The local migration was applied without resetting the database.

GAP-01 now has an explicit evidence ledger and drift checks: 1,360 qualified
items, 46 classified, 1,314 unreviewed. Procedure/output paths retain nested
object, array and record boundaries. Regenerating the inventory cannot enroll
new items or classify them as covered. Named evidence proves individual cases,
not exhaustive action coverage. Better Auth/client-only enrollment and the
remaining item audit still need work; GAP-01 is not closed.

Validation in the shared working tree: `bun run check` passed (809 core tests,
287 render tests, plus its type/build checks). Auth setup ran without the seed
project, then `bun run test:e2e -- --no-deps --reporter=line` passed all 39 tests.
This intentionally avoids the seed setup's session pruning while the user tries
the dev system. A seeded outsider account had been promoted to admin locally;
the organization refusal test now signs in a private account instead of changing
that person's role back. The real coach edit test restores the jersey it read.
Biz [model checks](../../remy-sport-biz/scripts/check-model.ts) (with `--check`)
and [documentation checks](../../remy-sport-biz/scripts/check-docs.ts) passed
(74 actions, 27 relations).

Next: finish GAP-01 enrollment/review and GAP-05–08 journeys; implement listing
moderation before public draws/rankings. The five designed actions remain
implementation pending. GAP-02 has preliminary findings in
[the relay investigation](2026-09-07-02-relay-capabilities.md); protocol tests and
GAP-03 are not complete. No deployment has been performed. Unrelated shared-tree
changes are intentionally outside this checkpoint's commits.

## Evidence audit checkpoint — 2026-09-07

Continued from `8a244c4` with substantial existing uncommitted application,
tooling and evidence-ledger changes. The static test-title checker now excludes
tests nested in skipped suites, chained skips and conditional suite declarations.
Its regression covers Vitest and Playwright declaration forms. Static enrollment
does not prove execution: runtime skips and actual test results still require
runner evidence. GAP-01 and the broader completion milestones remain open.

Validation in this shared tree: typecheck passed, all 73 repository tests passed,
and both publisher/watcher renewal-denial render tests passed. The relay test's
navigation was corrected to use the shared surface helper. This is UI cleanup
evidence, not real relay capability enforcement; GAP-02/03 remain open.

Build output still reports a chunk over 500 kB and a deprecated
`inlineDynamicImports` option. Investigate bundle composition and the source of
that option in the tooling work before closing the release checklist.

## External-operation and session audit — 2026-09-07

The external-operation scanner now recognizes both admin mutation methods and
rejects partially dynamic conditional paths. Incidental auth-path strings cannot
enroll an operation. Repository checks require the discovered operation set and
canonical action mapping to agree, including detection of stale mappings.

Added four isolated Worker/D1 regressions in
`tests/worker/session-revocation.test.ts`: revoking one owned session, revoking
all other owned sessions, refusal to revoke another user's session, and anonymous
listing/revocation refusal. The render test's outdated assertion that those
tests already existed has been corrected. The ledger classifies list-sessions,
revoke-session and revoke-other-sessions using these exact Worker cases; browser
mutation/reload/error/retry evidence remains outstanding.

The shared-tree report now has 1,375 items: 64 classified and 1,311 unreviewed.
Its ledger/report changes remain with the existing uncommitted coverage work,
which also references uncommitted application changes and tests. This checkpoint
commits the standalone scanner checks, session regressions and documentation
without bundling those application changes. GAP-01 is still open.

Validation: all 77 repository checks, four session-revocation Worker tests and
typecheck passed. Report regeneration used `bun scripts/ops/coverage-domain.ts
--write`; the ops wrapper's install preparation was refused by the sandbox's
temporary-directory permissions. No real user sessions were changed.

## Browser session-management completion — 2026-09-07

The browser slice exposed an authentication defect: deleting a session row did
not invalidate the signed session-data cookie held by the other browser. It
continued to authenticate for the former 15-minute cookie-cache lifetime.
`src/auth.config.ts` now disables that cache so the next authenticated request
checks the stored session, including when a browser still has an older cache
cookie. This adds a database session read to authenticated requests. Session
lifetime and renewal policy are unchanged. No deployment was performed.

Four private-account WebKit journeys in `tests/e2e/devices.spec.ts` now cover
single-device revocation, all-other-device revocation, and failure/retry for
both controls. They verify current-session preservation, unrelated-account
preservation, removal from the list, and signed-out state on the revoked browser
after reload. The failure response is injected; each successful retry reaches
the real Worker. Test sessions are released before their browser contexts close;
seed setup was skipped and no shared actor was used.

The session rows and generated report are included in this commit. The committed
baseline enrolls all 15 discovered external operations, explicitly leaving the
other 12 unreviewed: 1,375 items, 49 classified, 1,326 unreviewed. The shared tree
also contains other agents' classifications (64 classified, 1,311 unreviewed);
those remain uncommitted. A clean snapshot of the commit's coverage files passed
all 12 focused inventory/evidence checks and regenerated its report successfully.

Validation: typecheck, lint, build and model checks passed; all 825 core tests
passed. All four browser journeys passed. The render run passed 287/289; its two
video failures were corrected with an explicit unconfigured-relay response,
after which all 12 tests in that file passed. The sandbox blocked the core test
listener, so that tier was rerun with the local-listener permission.

Remaining release work: phone/locale/keyboard review is not certified by these
desktop journeys. Development service-worker navigation must also be verified:
with service workers allowed, WebKit stalled on reload in the multi-browser
journeys; blocking service workers allowed the auth cases to run and made the
injected failures directly routable. This is not evidence of working offline or
service-worker navigation. GAP-01 and the whole-model milestones remain open.
