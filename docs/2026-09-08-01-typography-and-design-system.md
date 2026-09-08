# Plan — convert the GUI to shadcn

Status, 2026-09-08: the whole GUI is on shadcn. Done and committed: Stage A
(readable type), B1 (the tooling), B2 step 8 (the shell, `d2ae514`), step 9
(the forms, `b97f92f`), and steps 10 to 13 (every list, table, card, page
frame, dialog and input, and the removal of our own tokens for the preset's
— `00286b2`, `4f964f1`, `228a3c3`). Next: step 14, the one full gate, the
end-to-end tier, the captures, and the Product Owner's review.

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
- Bespoke CSS is for sport media only: the live-video surface.
- A step that touches a surface deletes the rules it replaces in the same
  change. The dead-class rule in `tests/repo/styles.test.ts` holds the line,
  and the same file refuses `uppercase` and `font-mono` classes in authored
  JSX, so the registry's look stays the look.
- Registry files are never edited by hand, and never sit unused.
  `components-lock.json` records every file with its hash
  (`scripts/lib/registry-lock.ts`); `bun run ops ui check` and
  `tests/repo/registry.test.ts` go red on a hand edit, a file nothing wrote,
  a namespace the lock does not allow, or a locked file nothing imports. An
  upgrade is `bun run ops ui add <item>` again; the way out is
  `bun run ops ui remove <item>`.
- A registry component that ships an English word of its own is never
  edited: hide the built-in control by prop and render our own with our
  message (the phone drawer, the Breadcrumb label, the Spinner label), or
  pass the label in. `tests/repo/copy.test.ts` exempts the locked folder for
  that reason and checks everything we author.

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
  keep formatting through `lib/dates.ts`. No registry calendar is adopted
  unless it is wired to that formatter and the reader's locale.
- **The 44px control height is the one override.** The app is used at
  courtside, one-handed, sometimes in gloves; the render tier holds every
  control to `--control-height`. One min-height rule on the registry's
  `data-slot` hooks lifts them all; the locked files stay byte-identical.
  The topbar is the documented exception at 56px.
- **Base UI's Button never renders a link.** It forces `role="button"` on
  whatever it renders. A route link dressed as a button is
  `components/button-link.tsx`.
- **No unlayered CSS of ours.** An unlayered rule beats a Tailwind utility
  whatever its specificity: the Save button once rendered with no fill, and
  a universal `* { margin: 0; padding: 0 }` reset silently cancelled every
  margin and padding utility in the app until step 10 found it. Tailwind's
  preflight does the reset, in its layer.
- **Three compositions of registry parts, not thirty copies.**
  `components/page.tsx` (the page frame on Breadcrumb, a section heading, a
  link row on Item), `components/states.tsx` (Empty and Spinner) and
  `components/status-badge.tsx` (one Badge variant map for every status).
  They are JSX over registry components, the way shadcn's blocks are.

## Done

**Stage A — readable type**, 2026-09-08, in `d2ae514`. Body 16px, floor 12px,
font tokens, monospace and uppercase on allowlists, 42 dead classes deleted,
eleven shouting English messages made sentence case. Its type scale and
heading face were a stop-gap so the app could be judged readable; step 13
retired them for the preset's.

**B1 — tooling**, 2026-09-08, in `d2ae514`. `components.json` (style Nova,
base colour Stone), Tailwind and its Vite plugin, the packages as dev
dependencies, `bun run ops ui add|check|theme` in `scripts/ops/ui.ts`, the
lock, the MCP server beside Playwright in `.mcp.json`, `lib/theme.ts` with
`tests/unit/theme.test.ts`, and the guards for `text-[Npx]` under 12px and
`font-[…]` in JSX. Two upstream facts, kept where they bite: the MCP server
prints `[object Promise]` where each add command should be, so use the ops
command; `shadcn apply` answers 400 for every preset code, so `ops ui theme`
drives the endpoint directly (comment in `scripts/ops/ui.ts`).

**B2 step 8 — the shell**, 2026-09-08, in `d2ae514`. The registry's Sidebar
driven by `components/app-sidebar.tsx`, the account chores in a DropdownMenu
on the topbar avatar, language as a ToggleGroup and spoiler as a Switch in
the sidebar's Settings group, the theme provider in `lib/theme-provider.tsx`
mounted, and the old sidebar, backdrop and shell CSS gone. The topbar
overflow check in `tests/render/mobile-layout.spec.ts` runs for every role at
320 and 390px; the phone plan's steps 1 to 4 closed with it.

**B2 step 9 — forms**, 2026-09-08, in `b97f92f`. Every form on Field, Input,
NativeSelect, Textarea, Button and Alert; `.btn`, `.form-stack`, the global
field rule and `.province-filter` deleted with no compatibility aliases;
`components/button-link.tsx`; the 44px rule.

## Steps 10 to 14 — by registry item, done by surface

**Checks per step.** The Product Owner, 2026-09-08: "we can't run too many
tests because we will be here for a decade." So a step ran
`bun run typecheck && bun run test` (about twenty seconds; it carries the
lock, dead-class, docs, copy and test-id checks) and
`bun run test:render -- <the specs for the screens it touched>`.
`bun run check`, `bun run test:e2e` and `bun run shots` run once, at step 14.
The work went surface by surface rather than item by item — a page is
converted once, not three times — so steps 10 to 12 landed across three
commits and are ticked together.

- [x] **10. Lists, tables, cards, empty and loading.** Done 2026-09-08
      (`00286b2` competition surfaces, `4f964f1` people pages, `228a3c3` admin
      and settings). Installed `item`, `empty`, `spinner`, `checkbox`. Every
      event row, fixture row, entity row, roster card, coach row, invitation,
      device row and admin row is Item; every table is Table; every panel is
      Card; every pill and tag is Badge as it comes, sentence case; every
      empty state is Empty and every loading state Spinner (in
      `components/states.tsx`); scores align with `tabular-nums`. The lock
      rule that a locked file must be imported landed with this step, and
      `select`, `kbd` and `dialog` came out through the new
      `bun run ops ui remove`. Proof: typecheck, lint, the repo tier, and
      the render specs for each surface as it moved (126, 146 and 333).
- [x] **11. Page chrome.** Done 2026-09-08, same commits. Installed
      `breadcrumb`, `button-group`, `collapsible`. The crumbs on every page
      are Breadcrumb, labelled with the `breadcrumbs` message; the Discover
      status tabs and the event page's tabs are Tabs, the event page's sticky
      at the top of the scroller; action rows on the event and team pages are
      ButtonGroup in one scrolling row; the 17 hand-drawn SVGs of the old
      icon component became lucide-react icons and the file is deleted; the
      search rules kept "for its return" are gone. Under 768px the shell is
      our own Sheet with our messages (`menu`, `menu_sheet`, `dismiss`), so
      the registry Sidebar's English screen-reader strings never mount; the
      topbar and account trigger are Tailwind on the registry's Avatar. The
      phone plan's compact header and sticky tabs are checked in
      `tests/render/event-overview.spec.ts`: the first game above 60% of a
      390×844 screen, the tab strip still in view after a 400px scroll.
- [x] **12. Dialogs and inputs.** Done 2026-09-08, same commits. Installed
      `alert-dialog`, `input-otp`. The three browser confirms (removing a
      fixture, deleting a player, deleting a team) are AlertDialogs in the
      reader's language; the create-event disclosure on Discover is a
      Collapsible; the six-digit sign-in code is InputOTP. Render specs locate
      every migrated surface by test id or role: no `locator(".…")` remains
      under `tests/render/`.
- [x] **13. Their theme, not ours.** Done 2026-09-08 in `228a3c3`.
      `src/web/styles.css` is shadcn's output — the preset's theme blocks as
      `ops ui theme` writes them, the font tokens, the init base layer — plus
      three rules that each say why they cannot be a component: the 44px
      touch target on the registry's `data-slot` hooks, the live-video custom
      elements, and reduced motion. Every token of ours is gone (`--paper`,
      `--ink`, `--brand`, `--radius-legacy`, `--type-*`, `--space-*`,
      `--page-*`, `--font-display`, `--font-heading`, `--tracking-caps`);
      headings are Inter as the preset says, and Space Grotesk is no longer
      vendored (`scripts/ops/fonts.ts`, `bun run ops fonts`). 1,545 lines at
      the start of the day, 213 now. Dark mode needs no work of its own:
      nothing hardcodes a light colour. The allowlists in
      `tests/repo/styles.test.ts` are empty and the rules stay to keep them
      that way.
- [ ] **14. Full gate and visual record.** `bun run check`,
      `bun run test:e2e`, `bun run shots -- --grep-invert 'devices.*desktop'`,
      counts recorded here; Product Owner review of Discover, an event,
      sign-in and the admin console on a phone and a desktop, in EN, TH and
      JA, light and dark.

**Parked:** our own registry (a manifest naming the game summary row, score
entry and the standings table) waits until a second repository wants the
parts. Inside this one an agent imports the component.

## Kept as-is, on purpose

The live-video surface keeps two rules, on shadcn's tokens: custom elements
have no intrinsic size and reveal their child only once capture starts, and
a utility cannot reach a custom element's children by tag.

## Done when

Every generic element on every screen is a registry component under the
lock; `src/web/styles.css` is the init output, the font lines, the 44px rule
and the video surface; no token of ours exists; the guards in
`tests/repo/styles.test.ts` and `tests/repo/registry.test.ts` are green; the
gate is green once and the captures are reviewed in light and dark.

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
- 2026-09-08 — steps 10 to 13 done on "OK GET IT DONE", by surface, in three
  commits (`00286b2`, `4f964f1`, `228a3c3`). Two defects found on the way and
  fixed: the Follow button still wore the `.btn` class step 9 had deleted,
  and the universal reset cancelled every margin and padding utility. Next:
  step 14.
