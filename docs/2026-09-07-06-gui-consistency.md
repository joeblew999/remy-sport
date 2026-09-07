# GUI consistency plan

Status: proposed, 2026-09-07. Planning only; implementation has not started.

## Outcome and ownership

Once someone learns how to read a page, open an object, change a filter or save
a form, that knowledge should work throughout Remy Sport. Related screens
should share alignment, typography, controls, terminology and feedback.

Build on the completed [connected GUI plan](2026-09-07-05-gui-connections.md):
keep its URLs, contextual navigation, division boundaries, spoiler behavior and
server-authorised actions. Keep the existing paper/ink/orange visual identity.
This is consistency work across existing capabilities, not a new feature list.
The [domain register](2026-09-07-01-react-domain-coverage.md) continues to own
permission and domain coverage; this document owns presentation and interaction
consistency. Update progress here rather than starting another backlog.

## Starting evidence

Source review only. These findings identify implementation differences; this
planning pass has not visually audited the running GUI or reproduced every
state. Verify their visible effects in step 1 before changing behavior.

| Finding | Evidence | Work it creates |
| --- | --- | --- |
| Page spacing has several owners | `pages/teams.tsx` nests `page-header` inside `page-inner`; `pages/profile.tsx` makes them siblings; `pages/game.tsx` places its heading directly in `page-inner`. Both CSS wrappers add padding. Event has its own gutter rules. | One page frame with explicit compact/detail and directory variants; no accidental double gutters. |
| Navigation controls differ | Teams uses Open buttons with `goto`; game details and shared game summaries use native links. | Native links for destinations, buttons for mutations; one visual action hierarchy. |
| Form styling depends on where a form lives | `pages/login.tsx` styles inputs inline; CSS separately styles `admin-form`, table buttons and general `btn`; `components/event-divisions.tsx` has an unclassified Save button. | Shared field and action treatment across sign-in, account and management. |
| Loading, empty and failure are not consistently distinguished | Teams falls from pending to data/empty without an error branch; divisions uses zero options to display Loading; game details waits for event data without a corresponding event-error view. | Explicit pending, empty, failure and recovery states, including dependent queries. |
| Public views inherit unrelated styling names | Teams and game summaries use device row/meta classes; account and organisation forms use admin cards. | Extract shared row, metadata and panel styles while migrating actual consumers. |
| Tokens and overrides need reconciliation | `styles.css` has a colour palette but many literal spacing/type values, several responsive rule blocks, and a build stamp reference to `--muted` with no definition found in that file. | Audit token definitions, consolidate repeated values and remove superseded rules. |

Useful foundations already exist: `components/game-summary.tsx`, the game row
in `components/schedule.tsx`, `components/can.tsx`, `lib/form-errors.ts`,
localised messages, the router, and rendering/Worker/browser tests. Extend
these rather than create parallel game formatting, permission or error logic.

## Shared contract

| Area | Consistent rule |
| --- | --- |
| Page frame | One content width and responsive gutter source. Breadcrumbs, title, supporting metadata, actions, local navigation and content have the same alignment and order. One page h1; sections use ordered headings. Compact headers remain compact. |
| Visual scale | Name the existing spacing, type, radius, border and semantic colour values in CSS. Use a small documented scale for repeated patterns. Primary, secondary, destructive, pending and disabled states have stable meanings. Status always includes text, not colour alone. |
| Actions | One dominant action per task region when needed; secondary actions remain quieter. Destructive actions identify their target and use confirmation where loss warrants it. Use real links for navigation, real buttons for actions, and accessible names for icon controls. |
| Local navigation and filters | Selected navigation, selected filters and status badges look distinct. Preserve validated URL state for shareable views. Use navigation semantics for route links and proper tab semantics only for actual tab widgets. Controls wrap or scroll accessibly on phones. |
| Lists and tables | Shared row spacing, identity, metadata, status and action placement. Keep comparison tables for standings and scores; use labelled stacked records for management tables where appropriate. Names and actions remain readable without whole-page horizontal overflow. |
| Forms | Persistent labels, consistent required/optional hints, associated field errors and a form-level summary for other failures. Keep entered data after failure. Pending saves prevent duplicate submission and expose progress; success is visible and announced. Do not invent a second mutation-state store. |
| Data states | Distinguish initial loading, background refresh, truly empty, no filter matches, unavailable/not found, denied and failed requests according to the API response. Show actionable recovery where possible. Never label a failed or empty query as permanently loading. Retain useful existing content during refresh. |
| Copy and formatting | Reuse message keys for the same action and domain vocabulary for entity/status labels. Use shared locale-aware date, time, timezone, number and missing-value formatting. Never derive states from translated labels or introduce a competing score/spoiler formatter. |
| Accessibility and responsiveness | Visible keyboard focus, logical focus order, associated labels and announced feedback across every migrated surface. Aim for 44px touch targets, readable contrast and usable 200% zoom. Check English, Thai and Japanese, long names, reduced motion and narrow screens. |
| Permissions | Reuse server `can` values and existing gates. Distinguish a temporarily disabled action from one the reader cannot perform; preserve established privacy behavior. Styling changes must not change who can do what. |

Consistency does not require making everything identical: camps retain
Sessions/Players, competition tables retain useful numeric columns, and video
retains media-specific controls. These are explicit variants of shared rules.

## Implement in this order

### 1. Establish a representative baseline

Walk Discover, Live, Teams, Organisations, Home, event, game, team, player,
organisation, profile, devices, sign-in, admin and watch/broadcast surfaces.
Record which shared pattern each uses and any necessary exception in this
document. Inspect visitor, coach, organiser, referee and admin views using the
existing seeded automation; include denied/unassigned cases for affected actions.

Capture representative phone and desktop views through the existing screenshot
workflow. Start at 390 × 844 and 1440 × 900; also check 320px width and 200% zoom.
Confirm the source findings above, record any additional concrete defects here,
and assign each to a migration step. Avoid a disconnected design-system site.

### 2. Prove the shared patterns on real pages

Define the minimal CSS tokens and reusable frame, heading, panel/row, action,
field and feedback patterns required by the baseline. Use React components
where markup or behavior repeats; use CSS for purely visual reuse. Avoid a
large configurable component framework or a new UI dependency.

Migrate Teams and organisation directories together to establish browsing;
migrate Game and the existing Event header together to establish detail views.
Use organisation editing and sign-in to prove fields, pending and error feedback.
These are the first reviewable examples, with before/after captures and working
keyboard/pointer behavior. Preserve the compact connected-event layout.

### 3. Migrate the remaining public and personal views

Apply the proven frame and controls to Discover, Live, Home, Team, Player,
organisation detail, Profile and Devices. Align shell actions and active global
navigation with those pages. Reuse shared entity rows and game summaries;
preserve contextual return paths and meaningful per-page differences.

Repair confirmed query-state defects as each screen moves, including the Teams
error/empty distinction and Game dependent-query recovery. Check consistency
across the same game shown in Live, event, team and court contexts.

### 4. Finish management and media interactions

Migrate event settings, divisions, entries, players, venues, sessions/attendance,
fixtures/scoring, invitations, organisation membership, account controls and
admin to the same fields, actions and feedback. Fix divisions' loading/empty/error
distinction. Review save success, retry, validation, permission refusal and
destructive confirmation in each affected task. Align watch/broadcast status,
failure and recovery presentation while retaining its media behavior.

### 5. Remove drift and close the evidence

Delete replaced CSS and obsolete markup with each migration; do not accumulate
compatibility aliases or another layer of page-specific overrides. Keep dynamic
inline styles where data requires them, but move repeated layout rules into the
shared styles. Resolve undefined tokens found in the audit.

Extend existing repository checks for concrete recurrence risks that can be
checked reliably, such as undefined shared tokens or retired pattern imports.
Use rendering tests for layout/semantics and browser tests for behavior rather
than source-text rules that dictate every component's shape. Record legitimate
exceptions beside the relevant component and keep final evidence here.

## Acceptance and verification

| Check | Required evidence |
| --- | --- |
| Frame and typography | Representative directory, detail, account and management screens share gutters and heading hierarchy at phone/desktop sizes; no double padding or clipped actions. |
| Actions and navigation | Links support open-in-new-tab; keyboard and pointer reach the same destinations. Event → game → team → player → Back preserves the connected plan's context and scroll behavior. |
| Forms | A successful save, field validation failure, server failure/retry and denied mutation produce consistent feedback; input survives failure and pending prevents duplicate submission. |
| Data states | Initial loading, empty, filtered-empty, request failure and background refresh are exercised on migrated shared patterns. Teams, divisions and dependent Game queries have specific regressions. |
| Domain presentation | Status, date/timezone and missing values agree across views of the same entity. Spoiler on/off, finished-only results, separate division standings and camp variants retain existing behavior. |
| Accessibility/locales | Keyboard focus and error association assertions plus visual inspection at the target widths, 200% zoom, and EN/TH/JA; long names remain readable. |
| Completeness | Every baseline surface is migrated or has a documented reason for its variant; obsolete rules are removed and related docs/tests updated. No new unowned backlog. |

Use existing package commands: read their help before targeted runs; use
`bun run test -- --project repo tests/repo/docs.test.ts` for documentation links,
targeted `bun run test:render` during migrations, then `bun run check` and
`bun run test:e2e` sequentially for final acceptance. Use `bun run shots` for
the visual record. Tests must assert behavior and accessibility as well as
capture appearance; screenshots alone do not establish correctness.

The shared CLI owns preparation, fixtures, server startup and cleanup. Local
browser isolation is being edited concurrently: current uncommitted E2E help
advertises an isolated server on 8788, whereas the docs index records the older
shared-server limitation. Verify the completed isolation workflow before browser
acceptance; do not claim it is proven from help text or coordinate manual ports,
seeds or storage. Any missing automation belongs in that shared workflow.

Planning-session tooling finding: `bun run ops --help` attempted installation
before showing help and stopped on a sandbox temp-directory EPERM. E2E help
succeeded. Track making ops help available without installation as the next
small automation repair; the broader CLI redesign remains stopped. This failure
does not establish an application defect or require changing dependencies.

Completion means the matrix above is verified and its commands/results recorded,
with unresolved limitations stated explicitly. This plan does not authorise a
deployment or claim exhaustive domain coverage.

Planning verification: the existing documentation check passed (one file, two
tests). No application, rendering or end-to-end tests were run for this plan.
