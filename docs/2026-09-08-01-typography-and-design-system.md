# Plan — convert the GUI to shadcn

Status, 2026-09-08: the whole GUI is being converted to shadcn. Done and
committed: Stage A (readable type), B1 (the tooling), B2 step 8 (the shell,
`d2ae514`) and step 9 (the forms, `b97f92f`). Next: step 10, lists and
tables. Each step runs the cheap checks; the full gate runs once, at step 14.

## The rule

The Product Owner, 2026-09-08: "I want to NOT reinvent wheels. Our current
GUI has heaps of bad reinvention and I now realise we fucked up by not using
shadcn from the start." Minutes later: "we are meant to be using their theme,
not ours."

So:

- Every generic element is the registry item, installed with
  `bun run ops ui add <item>` and used as it comes. Before writing a
  component, a rule or a token, search the registry (the shadcn MCP server
  is in `.mcp.json`). If shadcn has it, install it.
- Their theme decides colour, radius and type: the preset recorded in
  `components-lock.json`, written into the stylesheet by
  `bun run ops ui theme`. No twins of it in our names.
- Bespoke CSS is for sport media only: the court board and the live video.
- A step that touches a surface deletes the rules it replaces in the same
  change. The dead-class rule in `tests/repo/styles.test.ts` holds the line,
  and the same file refuses `uppercase` and `font-mono` classes in authored
  JSX, so the registry's look stays the look.
- Registry files are never edited by hand. `components-lock.json` records
  every file with its hash (`scripts/lib/registry-lock.ts`);
  `bun run ops ui check` and `tests/repo/registry.test.ts` go red on a hand
  edit, a file nothing wrote, or a namespace the lock does not allow. An
  upgrade is `bun run ops ui add <item>` again.

## Why

The Product Owner said the font and the look were really bad and asked for a
design system. The look was a bespoke theme exported from a design tool:
three typefaces, 61 rules in monospace, 57 rules under 12px, and every
button, field, select, table, tab and badge hand-made with its own rules.
Stage A fixed the type in one file so the choice of system could be made on a
readable app; Stage B is the system.

## Decided

- **shadcn**, by the Product Owner on 2026-09-08 ("I lean towards shadcn"),
  over this document's Mantine recommendation, with the reasons in view.
  In one line each: Mantine had the best agent support and a drawer but a
  package-owned look; Radix Themes had the closest warm palette but no
  drawer; shadcn has the drawer, the shell, an official MCP server, and
  copies components into the repo, which the lock makes safe. Chakra, HeroUI,
  MUI, daisyUI and Park UI were considered and rejected the same day. The
  full comparison, the MCP trial and the registry research are in this file's
  history at `d2ae514`.
- **B1 is shadcn's own setup as it ships**, nothing bespoke around it. On a
  draft that hand-trimmed the Tailwind import and hand-mapped the theme:
  "seems stupid to me. We do not want to reinvent wheels."
- **Language and dates do not move.** The registry's components carry no
  text and no dates; everything visible stays a paraglide message and dates
  keep formatting through `lib/dates.ts`. A registry component that ships an
  English word of its own is never edited: hide the built-in control by prop
  and render our own with our message, or pass the label in. No registry
  calendar is adopted unless it is wired to that formatter and the reader's
  locale.
- **The 44px control height is the one override.** The app is used at
  courtside, one-handed, sometimes in gloves; the render tier holds every
  control to `--control-height`. One min-height rule on the registry's
  `data-slot` hooks, in the layer we own, lifts them all; the locked files
  stay byte-identical. The topbar is the documented exception at 56px.
- **Base UI's Button never renders a link.** It forces `role="button"` on
  whatever it renders. A route link dressed as a button is
  `components/button-link.tsx`.
- **Element resets live in `@layer base`.** An unlayered rule beats a
  Tailwind utility whatever its specificity; the Save button once rendered
  with no fill because of it.

## Done

**Stage A — readable type**, 2026-09-08, in `d2ae514`. Body 16px, floor 12px,
font tokens, monospace and uppercase on allowlists, 42 dead classes deleted,
eleven shouting English messages made sentence case. The rules are
`tests/repo/styles.test.ts`. Its `--type-*` scale and its heading face were a
stop-gap so the app could be judged readable; step 13 retires them for the
preset's.

**B1 — tooling**, 2026-09-08, in `d2ae514`. `components.json` (style Nova,
base colour Stone), Tailwind and its Vite plugin, the packages as dev
dependencies, `bun run ops ui add|check|theme` in `scripts/ops/ui.ts`, the
lock, the MCP server beside Playwright in `.mcp.json`, `lib/theme.ts` with
`tests/unit/theme.test.ts`, and the guards for `text-[Npx]` under 12px and
`font-[…]` in JSX. Three upstream facts, kept where they bite: the MCP
server prints `[object Promise]` where each add command should be, so use
the ops command; `shadcn apply` answers 400 for every preset code, so
`ops ui theme` drives the endpoint directly (comment in `scripts/ops/ui.ts`);
Tailwind's reset makes headings inherit, so the stylesheet carries one base
heading rule.

**B2 step 8 — the shell**, 2026-09-08, in `d2ae514`. The registry's Sidebar
driven by `components/app-sidebar.tsx`, its own Sheet under 768px, the
account chores in a DropdownMenu on the topbar avatar, language as a
ToggleGroup and spoiler as a Switch in the sidebar's Settings group, the
theme provider in `lib/theme-provider.tsx` mounted, and the old sidebar,
backdrop and shell CSS gone. The topbar overflow check in
`tests/render/mobile-layout.spec.ts` runs for every role at 320 and 390px;
the phone plan's steps 1 to 4 closed with it. Two debts recorded then, each
owned by a step below: the registry's mobile Sheet announces itself in
hardcoded English (`tests/repo/copy.test.ts` exempts the locked folder with
the reason) — step 11; the legacy surfaces that hardcode a light colour read
as light islands in the dark captures — step 13.

**B2 step 9 — forms**, 2026-09-08, in `b97f92f`. Every form on Field, Input,
NativeSelect, Textarea, Button and Alert; `.btn`, `.form-stack`, the global
field rule and `.province-filter` deleted with no compatibility aliases;
`components/button-link.tsx`; resets moved into `@layer base`; the 44px
rule. Gate at the time: 897 unit/repository/Worker checks and 333 rendering
checks, end-to-end green.

## Remaining steps — by registry item

**Checks per step.** The Product Owner, 2026-09-08: "we can't run too many
tests because we will be here for a decade." So a step runs
`bun run typecheck && bun run test` (about twenty seconds; it carries the
lock, dead-class, docs and copy checks) and
`bun run test:render -- --grep '<surface>'` for the screens it touched.
`bun run check`, `bun run test:e2e` and `bun run shots` run once, at step 14.
Render locators move from class names to roles and labels as each surface
migrates; no `locator(".…")` remains for a migrated surface.

- [ ] **10. Lists, tables, cards, empty and loading.** Install `item`,
      `empty` and `spinner`; `card`, `table`, `badge` and `skeleton` are
      locked and waiting. Surfaces: Discover's event list (`.event-row`),
      Live's fixtures (`.fixture-row`), the entity rows on org, teams, player
      and devices (`.entity-row`), the schedule and its score column, the
      competition table on the event page, the admin tables on admin, org,
      team and entries (`.admin-table`), every `.panel`, every `.empty` and
      `.loading`, and the status pills and type tags (`.status`, `.pill`,
      `.badge`, `.type`, `.outcome`). Rows are Item, tables are Table, panels
      and stat blocks are Card, pills are Badge as it comes (sentence case;
      the guard refuses `uppercase`), empty states are Empty, loading is
      Skeleton or Spinner, and a column of scores aligns with `tabular-nums`,
      not mono. Delete every rule in those families in the same change.
      First action: extend `tests/repo/registry.test.ts` so a locked file
      nothing imports is red (knip cannot see it; the locked folder is an
      entry there), then drop `select` and `avatar` from the lock unless this
      step uses them — step 9 chose NativeSelect and nothing plans avatar.
      Proof: the cheap checks, plus
      `bun run test:render -- --grep 'discover|live|event|admin|schedule|team'`
      including the 320/390/1440 EN/TH/JA alignment checks.
- [ ] **11. Page chrome.** Install `breadcrumb`, `button-group`, `kbd` and
      `collapsible`; `tabs` is locked. The crumbs on 13 pages are Breadcrumb
      (`.crumbs` goes). The event page's tabs are Tabs (`.detail-tabs` goes);
      the phone plan's compact headers, sticky tabs and scrolling action rows
      are delivered here with the registry's parts, not sticky and scrolling
      rules of our own. Action rows are ButtonGroup (`.event-actions` goes).
      The 17 hand-drawn SVGs in `components/icon.tsx` become lucide-react
      icons, which the registry already installed, and the file is deleted.
      The search rules kept "for its return" are deleted; when search
      returns it is Command. Under 768px the shell renders our own labelled
      Sheet so the registry's English screen-reader strings never mount, and
      the copy check's exemption for the locked folder then covers only what
      never renders. Proof: the cheap checks, plus
      `bun run test:render -- --grep 'mobile|topbar|event|home|i18n'`.
- [ ] **12. Dialogs and inputs.** Install `alert-dialog`, `dialog` and
      `input-otp`. The three `window.confirm` calls (removing a fixture in
      `components/schedule.tsx`, deleting a player and a team in
      `pages/admin.tsx`) become AlertDialog with our messages. The
      create-event `<details>` on Discover becomes Collapsible or Dialog. The
      six-digit sign-in code is InputOTP (`.login-code` goes, and its
      monospace allowlist line with it). Proof: the cheap checks,
      `bun run test:render -- --grep 'login|discover|admin'`, and the
      end-to-end sign-in spec alone.
- [ ] **13. Their theme, not ours.** Delete `--paper`, `--ink`, `--brand`,
      `--radius-legacy`, `--type-*`, `--space-*`, `--page-gutter` and
      `--page-width` and every rule that reads them (on 2026-09-08: 50, 83,
      34, 3, 97 and 20 uses), and the `--font-heading` override, so headings
      are Inter as the preset says. Layout (`.page`, `.page-inner`,
      `.section`) becomes Tailwind utilities. What remains in
      `src/web/styles.css`: shadcn's init output as `ops ui theme` writes it,
      the `@theme` font lines (Inter and Noto Sans Thai self-hosted, because
      the preset has no Thai coverage), the 44px rule, and the court board and
      live video rules on shadcn's tokens. Dark mode then needs no work of its
      own, because nothing hardcodes a light colour. The allowlists in
      `tests/repo/styles.test.ts` shrink to what is left. Proof: the cheap
      checks, and the dark slice of `bun run shots` reviewed.
- [ ] **14. Full gate and visual record.** `bun run check`,
      `bun run test:e2e`, `bun run shots -- --grep-invert 'devices.*desktop'`,
      counts recorded here; Product Owner review of Discover, an event,
      sign-in and the admin console on a phone and a desktop, in EN, TH and
      JA, light and dark.

**Parked:** our own registry (a manifest naming the game summary row, score
entry and the standings table) waits until a second repository wants the
parts. Inside this one an agent imports the component.

## Kept as-is, on purpose

The court board and the live video page keep their own rules, on shadcn's
tokens. They are media and sport-specific and no design system has them.

## Done when

Every generic element on every screen is a registry component under the
lock; `src/web/styles.css` is the init output, the font lines, the 44px rule
and the two media surfaces; no `--paper`, `--ink`, `--brand`, `--type-*` or
`--space-*` token exists; the guards in `tests/repo/styles.test.ts` and
`tests/repo/registry.test.ts` are green; the gate is green once and the
captures are reviewed in light and dark.

## Log

- 2026-09-08 — written from the stylesheet, the captures and the render
  tests. Stage A done the same day on the Product Owner's "GO": gate 859 +
  319, shots 186.
- 2026-09-08 — gate answered: shadcn, by the Product Owner, against this
  document's Mantine recommendation. Stage B split into B1 (tooling) and B2
  (surfaces) on the Product Owner's instruction. B1 done the same day on "YES
  make sure you get the tooling right": gate 868 + 319, e2e 49, shots 186;
  then the hand-mapped theme replaced by the preset through `ops ui theme`
  on "YES I want to use their tooling so that we fully align".
- 2026-09-08 — B2 step 8 done (868, 333, e2e 49, 222 captures with the dark
  slice) and step 9 done (897, 333, e2e green). Committed as `d2ae514` and
  `b97f92f`.
- 2026-09-08 — re-cut. The Product Owner: no reinvented wheels, their theme
  not ours, and few test runs. Steps 10 to 14 rewritten by registry item; the
  library comparison, MCP trial and registry research trimmed to the decision
  (full text at `d2ae514`); the phone plan's open steps folded into step 11;
  our own registry parked; the JSX escape guard added ahead of step 10.
