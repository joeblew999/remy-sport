# Plan — team page sections as tabs

Status: implemented 2026-09-09; targeted checks and captures pass. The whole
repository gate has unrelated failures, recorded below, so full acceptance
remains open and this plan stays outside done/.

## Problem and evidence

The reported page is `http://localhost:8787/#/team/team_006`, Suankularb U16
Boys. Read-only browser inspection confirmed Roster and Schedule links in the
header and both sections displayed below. In `src/web/pages/team.tsx`, those
links set `section=roster` or `section=schedule`; an effect scrolls to the
matching heading. They are working jump links, but their button appearance
suggests separate views. Coaching staff and permission-controlled editing
forms also sit between the roster and schedule.

We already have a relevant pattern: `src/web/pages/event.tsx` uses the installed
registry Tabs with a line-style tab strip, URL-selected content, and a Manage
tab shown according to server capabilities. The team page should use that
interaction. Removing only the buttons would leave the long, mixed-purpose
page and discard useful direct navigation.

## Proposed result

Keep the team identity, organisation link, record and Follow action in the
existing page frame. Below them, show one tab strip and one selected panel:

| Tab | Contents | Visibility |
| --- | --- | --- |
| Roster (default) | Players and coaching staff, retaining existing sign-in messaging | Everyone |
| Schedule | This team's fixtures, results and existing game/event/venue links | Everyone |
| Manage | Existing team settings and roster editing, including player creation | Only readers granted EDIT_TEAM_PROFILE or MANAGE_ROSTER |

Keep each editing component's existing capability gate inside Manage. Preserve
the nested CREATE_PLAYER gate. Never infer access from a role name. A direct
Manage URL without permission falls back to Roster and renders no editing form.

The selected tab labels its panel; remove the redundant outer Roster/Schedule
heading. Keep meaningful inner headings such as Coaching staff and Team
settings. Roster and Schedule disappear from the header action group.

## Implementation sequence

1. **Compose the existing registry tabs on the team page.** Use Tabs, TabsList,
   TabsTrigger and TabsContent from `src/web/components/ui/tabs.tsx`, with a
   single root containing the tab list and panels so keyboard navigation,
   selection and panel labelling work together. Follow the event page's visual
   pattern, but do not copy its separately rendered content outside the Tabs
   root. Make the tab list sticky within the page scroller, with horizontal
   overflow confined to the list. Use the same content placement on phone and
   desktop. Do not edit locked registry primitives or invent another tab system.
2. **Make the URL the selection state.** Wire the existing router's setParam
   through `src/web/main.tsx`, as EventPage already does. New selections use
   `?tab=roster`, `?tab=schedule` and `?tab=manage`. With no tab, show Roster.
   Accept existing `?section=roster` and `?section=schedule` URLs as aliases when
   no explicit tab is supplied. Unknown tab values fall back to Roster. Remove
   the section-scrolling effect; selection must not jump again when data
   refetches. Use existing history behavior, preserving unrelated query values;
   refresh and Back/Forward must restore the selected view.
3. **Move the existing content into its panels.** Preserve player links,
   coaching visibility, mutation invalidation, translations, spoiler behavior,
   record calculation and game links. Keep data hooks unconditional; the header
   record still needs games while Roster is selected. Keep visited Manage form
   state while switching tabs using the registry's supported panel mounting
   behavior, with inactive content hidden from interaction. Add proper roster
   loading/retry handling instead of treating an unanswered/failed roster query
   as an empty squad; retain schedule loading and add query-error handling.
4. **Update behavioral coverage and captures.** Amend
   `tests/render/team.spec.ts` so schedule and editing assertions select their
   panel first. Replace the header-link contract with selection, panel
   visibility, keyboard operation and legacy-link checks. Review
   `tests/render/who-sees-what.spec.ts` so moving management controls does not
   weaken permission coverage. Update `tests/e2e/connected-gui.spec.ts` for tab
   navigation and add refresh/Back coverage plus legacy section URLs. Extend
   `tests/e2e/screens.shots.ts` to capture the roster, schedule and authorised
   management views explicitly.
5. **Verify and close this plan.** Use `bun run check`, then
   `bun run test:e2e`, then `bun run shots` sequentially. Inspect phone and
   desktop captures in English, Thai and Japanese, light and dark. Recheck the
   reported team on the existing 8787 server without changing its data. Record
   actual results here and update `docs/README.md` when implemented.

## Acceptance

- One Roster/Schedule navigation strip, a clear selected state and exactly one
  visible panel. No duplicate header shortcuts or redundant panel title.
- Selecting Schedule immediately exposes fixtures without scrolling past players
  or editing forms. Selecting Roster restores players and staff.
- Direct tab URLs, old section URLs, refresh and browser Back/Forward work.
- Keyboard users can switch tabs and reach the labelled active panel; hidden
  panels have no reachable controls. Tabs remain reachable on narrow phones.
- Signed-out readers, followers and authorised managers retain the same data
  visibility and permissions. Loading, empty and failed queries are distinct.
- Editing survives a tab switch; saving/removing/adding still refreshes the
  relevant data. Spoiler mode still conceals results and the header record.

## Debt and coordination

The old link expectations in `tests/render/team.spec.ts` and
`tests/e2e/connected-gui.spec.ts` preserve the interaction being replaced. Change
those expectations deliberately and retain their useful connected-navigation
coverage. The current scroll effect also depends on roster and game data, so a
refetch can re-scroll the reader; deleting it resolves that fragility.

This is the team navigation work. Coordinate its use of the page frame with
[main-content styling](done/2026-09-09-07-main-content-on-the-registry.md) and its URL
behavior with [installed-app Back](2026-09-09-10-installed-app-back-navigation.md).
Neither broader redesign is required to implement these tabs. Concurrent
uncommitted account/topbar changes were present during inspection and are not
part of this plan.

Evidence collected: package scripts and operations CLI help, live signed-out
page snapshot, team/event/router source and existing rendering/browser tests.
Authenticated and responsive acceptance above remains implementation work.

## Implementation evidence — 2026-09-09

- Roster, Schedule and permission-controlled Manage use registry tab panels.
  Existing section links remain aliases; tab changes keep the navigation trail.
  Manage retains form edits while hidden, and roster/schedule query failures
  offer retry without claiming the data is empty.
- `bun run test:render -- tests/render/team.spec.ts tests/render/who-sees-what.spec.ts tests/render/connected-gui.spec.ts`: 32 passed, including retry, keyboard selection, history, legacy URLs, form retention and the model-derived permission matrix.
- `bun run test:e2e -- --grep 'game → team'`: 4 passed including setup and verified
  session cleanup; isolated storage removed. Exact URL selectors were updated
  for the breadcrumb query added by the preceding navigation work.
- `bun run shots -- --grep '(roster|team-schedule|team-manage)(-dark)? ·'`: 39 passed
  including setup/cleanup, producing 36 captures (three tabs, three languages,
  two themes, phone/desktop). Inspected six representative captures spanning
  all tabs, languages, themes and sizes; no clipping or duplicate section
  shortcuts. Full visual review of every capture is not claimed.
- Typecheck, lint, build and model checks passed. The full gate then reported
  the notification style violation and two Worker timeouts. Full rendering had
  eight notification/email failures and one obsolete team-link expectation;
  that team expectation is fixed and passes in the targeted run. Full browser
  verification also hit an organisation unknown-email assertion. These remain
  in the [automation record](2026-09-07-04-staging-verification.md); no whole-gate
  pass is claimed. Notification/translation edits were preserved.
