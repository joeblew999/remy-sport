# GUI consistency plan

Archive: completed (2026-09-10). The desktop Devices capture stall that held this open was Vite's cold dependency optimiser reloading the page mid-capture — not a font or data defect, which is why waiting, foregrounding and disabling animation all failed. `shots --grep devices` → 57 passed after the fix.

Current work: [project index](../README.md). Original evidence follows.
Status: **done 2026-09-10.** Implemented and verified locally 2026-09-07 with
one limitation held open — the desktop Devices capture that "repeatedly stalls
after the trace shows loaded rows and fonts". Resolved, and not by anything in
this plan: `bun run shots` starts a fresh dev server every run, so Vite's
dependency optimiser was cold every time, discovered `workbox-window` through a
dynamic import mid-run, and reloaded the page while the capture was in flight.
Named in `optimizeDeps.include` on 2026-09-10. Re-run: 57 passed, no stall.
The captures are a manual review aid and sit outside the gate and the deploy on
purpose — `test:e2e` names the e2e, admin and authz projects, so a test run
never takes pictures.

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

## Implementation record — 2026-09-07

The shared CSS now owns responsive gutters, heading scale, panel spacing,
fields, action sizes, feedback and focus treatment. The existing unpadded list
panel remains a deliberate variant of the padded form/content panel. Replaced
device/admin-specific shared class names throughout their consumers and removed
the old form/button rules; there are no compatibility aliases. Native Safari
selects need an explicit height in addition to min-height, covered by a control
size regression. Reduced-motion preferences disable decorative animation.

| Surface family | Migration and retained variant |
| --- | --- |
| Discover, Live and Home | Shared headings, panels/actions and entity links; Discover keeps its competition directory and live banner. Live failures offer recovery. |
| Teams and Organisations | Aligned headings/lists, real destination links, localised relationship labels and separate failure/empty states. |
| Event and Team | Compact identity headers share the scale and gutter source; competition tabs/tables and camp Sessions remain distinct. Game status, score and spoiler logic are preserved. |
| Game, Player and organisation detail | Aligned headers and shared entity metadata/panels. Game's dependent event/entry failures are visible with retry; Team/Event/Org initial failures no longer masquerade as missing records. |
| Profile, sign-in and Devices | Shared frame, fields and feedback; sign-in has persistent labels and error association. Devices distinguishes session loading from failure and retains existing data during refresh. |
| Event/organisation/team management and admin | Shared padded panels, form fields, Save/action styles and announced error/success feedback; admin uses the common page frame. Event creation/settings and organisation profile have associated name/validation errors. Existing permission gates remain authoritative. |
| Watch/broadcast | Shared heading, return links and actions; media-specific controls and connection states remain specialised. This work does not claim new relay reliability or isolation. |

Navigation-only buttons became native links, including sidebar and account
destinations; obsolete navigation callbacks were removed where no longer used.
Sidebar active links expose `aria-current`. Sign-in links and imperative
navigation use the same return-route builder; a filtered event survives opening
Sign in and reloading. Existing game/date/localisation and permission helpers
are reused rather than duplicated. True API 404s retain the missing-object
message; retry is for failed requests, not a replacement for that state.

Divisions now distinguishes loading, empty and query failure. Its uncontrolled
checkboxes mount only after participation resolves, preventing a slow query
from capturing an incorrect initial selection. Failed reads cannot submit a
division change. A regression delays participation to prove this. Event and
organisation save feedback uses mutation success instead of a second timed
success flag. Retry controls use the same mutation/query state as their owner.

New checks cover directory retry and keyboard navigation, dependent Game query
recovery, empty/failed/delayed division data, shared control dimensions, error
association, 320/390/1440px EN/TH/JA alignment and 200% CSS content magnification.
The latter is not a claim of exhaustive operating-system/browser zoom testing.
A repository check rejects undefined shared CSS tokens, including the original
build-stamp token defect. The ops help command now succeeds without installation,
with a regression for help and unknown-operation exit status.

The initial screenshot walk passed 150 checks and failed three desktop Devices
captures before the UI migration. Review of its phone sign-in, organisation,
event and directory captures confirmed the baseline spacing/control differences.
The expanded walk now includes Teams, Game, Player, Places, Manage and Watch,
and uses 1440px desktop plus 390px phone views in all three locales. Its role
contexts now close even on failure, retaining usable traces. Desktop Devices
capture remains under investigation; successful mobile captures do not prove it.

The browser-isolation edits present before this task remain separate work.
During verification, lint could not import their Playwright config because it
required a run ID at import time. Removed that import-time check in the working
tree: migration and Vite still validate storage before starting. This correction
belongs with the pending isolation change. Successful screenshot runs have
reported session cleanup and isolated storage removal; this does not establish
the broader developer-session preservation acceptance for that work.

Final application verification: `bun run check` passed **851
unit/repository/Worker checks and 312 rendering checks**. The subsequent
`bun run test:e2e -- --reporter=line` passed **all 49 checks**, zero retries,
including session teardown and isolated storage removal. The first browser run
found stale organisation/device selectors and loss of the specific 404 state;
both were corrected and the entire suite rerun. A final review also caught
the sign-in-link return context; the shared builder and its regression were
added before this final gate and browser pass.

Logs are retained in the ignored repository test-output directory as
`.playwright/gui-consistency-check.log` and `.playwright/gui-consistency-e2e.log`.
The full screenshot command is **not** verified: desktop Devices repeatedly
stalls after the trace shows loaded rows and fonts. Waiting for device content,
foregrounding and disabling animation did not resolve it. Its trace is now
retained on failure. This is the next capture fix in the docs index, not a
claim of a font/data defect or a reason to increase timeouts. Shared Chrome
was visually inspected on phone and desktop; its pointer stability wait also
timed out, so interaction acceptance comes from the normal pointer/keyboard
rendering and E2E journeys above. Existing bundle-size and deprecated build-option
warnings remain in their previous register.

Final visual pass: `bun run shots -- --grep-invert 'devices.*desktop'` passed
**186 checks** (183 captures plus setup/authentication/teardown), zero retries,
with session cleanup and isolated storage removal. This explicitly excludes
the three known failing desktop Devices captures; it does not hide or fix them.
Reviewed the resulting phone organisation/sign-in forms, Thai team directory,
Japanese game details and desktop management/admin views. Headers align, native
selects have usable height, Save has the shared primary treatment and Delete
retains its destructive treatment. The captures and companion text are under
`screenshots/`; the run log is `.playwright/gui-consistency-shots.log`.
