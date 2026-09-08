# Plan — readable type first, then a design system

Status: Stage A implemented and verified locally, 2026-09-08 (gate: 859
unit/repository/Worker checks, 319 rendering checks, 186 screenshot checks).
Stage B decided the same day: **shadcn**, by the Product Owner, in two
stages. **B1, the tooling, is done and verified** (868 + 319 + 49 + 186;
no component swapped; one heading default put back). **B2 step 8, the shell,
is done the same day on the Product Owner's word** (868 + 333 + 49 + 222,
captures now in light and dark), and **step 9, the forms, is done the same
day** (897 + 333 + e2e; the replaced button and field rules are deleted —
no compatibility aliases). Step 10, the lists and tables, is next. Before
step 8 the raw registry items steps 9 and 10 will use were added through
`bun run ops ui add` with no surface swapped.

## Why

The Product Owner said the general font and look are really bad, and asked
whether there is a design system we can use for React.

The current look is a bespoke theme exported from a design tool (the comment at
the top of `src/web/styles.css` says so). The fonts load fine; the problem is
how they are used. Read from that file on 2026-09-08:

| What | Value |
| --- | --- |
| Body font size | 14px |
| Typefaces | 3 — Inter for body, Space Grotesk for headings, IBM Plex Mono for metadata |
| Rules that set the monospace face | 61 |
| Rules that set uppercase with wide letter-spacing | 38 |
| Rules that set 9, 10 or 11px text | 57 |
| Lines in the file | 1,891 |

Dates, venues, organisers, referees, cities, divisions, roles and section
labels are all set in 10–11px uppercase monospace. That is what makes the game
page read like a terminal, and small text everywhere makes the app feel
cramped. Anyone can confirm this on `screenshots/desktop/game.en.png`.

Two things are wrong and they have different fixes:

1. **The type is wrong.** That is a CSS problem, fixed in one file with no new
   dependency. Stage A.
2. **The components are hand-made.** Buttons, fields, selects, tables, tabs and
   badges are all bespoke and every one has its own rules. A design system
   replaces them with tested, accessible ones. Stage B.

Doing A first is not a delay. It is needed under any design system, it costs
an afternoon, and it tells us whether B is still wanted once the type is fixed.

## Stage A — readable type, no new dependency

### Rules

| Rule | Detail |
| --- | --- |
| Body 16px | Secondary text 14px, small text 13px, nothing below 12px. 16px is the browser default, and iOS Safari zooms into any input set below 16px, which matters for a PWA that also ships as an iPhone app. |
| Font tokens | `--font-sans`, `--font-display`, `--font-mono`, and `--font-thai` for the Thai-first lines, defined once at the top of the file. Every other rule uses `var(--font-…)`, never a literal family name. The tail of each text token keeps Noto Sans Thai and system-ui, for the reason written beside them. |
| Monospace only where digits align | Scores, the game clock, standings numbers, rank, seed, play-feed timestamps, the build hash. Nothing else. Metadata (venue, organiser, city, division, role, date labels, section labels, breadcrumbs, table headers, nav counts) becomes the sans face at 13–14px, sentence case, in the muted ink colour. |
| Uppercase is for pills | Status pills (LIVE NOW, FINISHED), event-type tags and the DEV stamp may stay uppercase, with letter-spacing no wider than 0.06em. Headings, labels and table headers are sentence case. |
| Headings keep Space Grotesk | The brand stays. Only the display scale is named as tokens so pages stop inventing sizes. |

### Steps

- [x] Add the font tokens and a named type scale at the top of
      `src/web/styles.css`. Done 2026-09-08: `--font-sans`, `--font-display`,
      `--font-thai`, `--font-mono`; `--text-xs` 12px through `--text-2xl` 28px
      plus `--text-h1`; the body rule uses `--font-sans` and `--text-base`.
- [x] Replace every literal font-family in the file with a token. Done:
      `grep -c "'Inter'\|'Space Grotesk'\|'IBM Plex Mono'" src/web/styles.css`
      returns 4, the four token definitions. The three inline font styles in
      `src/web/pages/team.tsx` moved into `.team-hero .meta.thai` and a new
      `.team-record` block, so no component sets a face or size inline.
- [x] Move metadata off the monospace face and off uppercase. Done: the mono
      token is used in 8 rules — the build hash, the keyboard-shortcut hint,
      the game clock in the Discover banner, jersey numbers, the sign-in code,
      schedule scores, score entry and the broadcast identifier. Uppercase
      remains on 8 pills and tags: the DEV stamp, event type, event status, the
      LIVE NOW pill, W/L outcome, device tags, the primary-venue tag and the
      broadcast status. Everything else is sentence case in the sans face.
- [x] Raise the small sizes. Done: no `font-size` below 12px remains and the
      body is 16px. Row titles and card names are 16px, metadata 13px, table
      headers and pills 12px.
- [x] Extend `tests/repo/styles.test.ts` so this cannot drift back. Done: nine
      tests. Every font-family is a token; the text tokens keep Noto Sans Thai
      and system-ui; nothing under 12px in a font-size or a `--text-*` token;
      the mono token only on a named allowlist; uppercase only on a named
      allowlist; no inline fontFamily/fontSize under `src/web/`; and every
      class the stylesheet styles is mentioned by something under `src/web/`.
      Proof: run against the committed stylesheet the rules find 97 literal
      font-family declarations, 57 sizes under 12px, 61 mono blocks and 38
      uppercase blocks; the unit assertions inside the file fail a 10px rule
      and a 9px token; the working tree passes all nine.
- [x] Recheck the fixed-width table tracks at 16px. Done: a targeted run of
      `tests/render/gui-consistency.spec.ts`, `tests/render/mobile-layout.spec.ts`,
      `tests/render/team.spec.ts`, `tests/render/i18n.spec.ts`,
      `tests/render/home.spec.ts` and `tests/render/event-overview.spec.ts`
      passed all 67 checks: every route fits at 360, 390, 402 and 430px,
      Discover fits at 769 through 1280px, the directory and sign-in align at
      320, 390 and 1440px in EN, TH and JA, and the shell cannot be panned.
- [x] Run the full gate, then the visual record. Done 2026-09-08: `bun run check`
      passed **859 unit/repository/Worker checks and 319 rendering checks**;
      `bun run shots -- --grep-invert 'devices.*desktop'` passed **186**, zero
      retries, with session teardown and isolated storage removed. The desktop
      Devices capture stays excluded as the known separate stall. Reviewed the
      new captures under `screenshots/` (gitignored, so no diff to commit):
      Discover, game, event schedule, admin, profile, sign-in, manage and
      Discover on a phone, in English, Thai and Japanese. The first pass found
      two defects the rules could not see and both are fixed: organiser names
      were uppercased in `pages/discover.tsx` itself, and filter chips wrapped
      to two lines at 1440px. See the copy finding below.
- [ ] Show the Product Owner the captures and record their answer to the
      Stage B gate below. Captures are ready; the answer is theirs.

`scripts/ops/fonts.ts` does not change in Stage A: the same three Latin
families are vendored, only their use changes.

Found on the way, 2026-09-08: 42 class names in the stylesheet were rendered
by nothing under `src/web/` — the old dark live page (scoreboard, clock,
quarters table, play-by-play, action buttons), the bracket view, standings
rows, event stat cells, the dashboard feed, next-game and result rows, the
sample-data banner, the topbar install button and the dev-account row. They
were exactly the tracked-caps-mono rules, so they were deleted rather than
converted, and the stylesheet went from 1,891 lines to 1,456. The dead-class
rule in `tests/repo/styles.test.ts` keeps it that way; the `.search` rules are
allowlisted there because `components/topbar.tsx` keeps them on purpose.

Also found on the way: eleven English messages were written in capitals
("ADMIN", "SIGN IN", "PROFILE", "HOME", "SECURITY", "RECORD", "UPCOMING",
"FINAL", "LIVE NOW", "SAMPLE DATA"), so the crumbs and the schedule heading
kept shouting after the stylesheet stopped. They are sentence case now; the
pills that should read uppercase get it from CSS. `pages/login.tsx` also had
a hardcoded English "LOCAL ONLY" that the copy check could not see, because
that check matches a capital followed by a lowercase letter; it is the
`local_only` message in all three locales now. `tests/repo/styles.test.ts`
rejects any English message written in capitals, with PTS allowlisted.

## Stage B — adopt shadcn, surface by surface

### The decision

The GUI consistency plan of 2026-09-07 chose "no new UI dependency" and built
shared CSS instead. This stage reverses that for one package. It is the
Product Owner's decision and is recorded here when made:

> Gate answer, 2026-09-08: **shadcn.** The Product Owner, after the Stage A
> captures, the comparison below, the MCP trial and the registry research:
> "I lean towards shadcn." Recorded as the decision. The recommendation in
> this document had been Mantine; the reasons for both are kept below so the
> trade was made with them in view, not re-argued later.

### Which system, and why not the others

| Option | Verdict | Support for coding agents (checked 2026-09-08) |
| --- | --- | --- |
| **Radix Themes** (`@radix-ui/themes`, 3.3.0, React 19 supported) | **Proposed on 2026-09-08.** One dependency. A tuned type scale, colour scales with dark mode, spacing, radius and about 30 accessible components, all plain CSS with variables. The orange accent and paper background survive as theme settings. Fits the completed fewer-dependencies work. | **None first-party.** The site serves no llms.txt (404), the request for one was closed without a response, and the only MCP server is a third-party project. Agents work from training data and the docs pages. |
| Mantine 9 (`@mantine/core`, `@mantine/hooks`, `@mantine/form`, plus a PostCSS preset) | Batteries included: forms, tables, notifications, comboboxes. The heaviest of the three and the most opinionated look, though the theme takes our font tokens and an orange shade scale. | **The strongest first-party support.** Official llms.txt and llms-full.txt regenerated every release; an official MCP server, `@mantine/mcp-server`, with docs, props and search; three official agent skills from the Mantine team for forms, comboboxes and custom components, installed with `npx skills add https://github.com/mantinedev/skills`. |
| shadcn/ui with Tailwind 4 | Components are copied into the repo, which is attractive, but it brings Tailwind, headless primitives and several helper packages, and moves styling into utility classes inside JSX. That is a second styling paradigm beside the plain CSS. | **Official MCP server** (`npx shadcn@latest mcp init --client claude`) that browses, searches and installs components from registries; llms.txt via the docs host. The library agents know best from training. |
| Base UI 1.0 | Not a design system. Headless, so it does not fix the look; it is what shadcn is moving onto. | Has an llms.txt. |

The Product Owner asked on 2026-09-08 whether Mantine's LLM support matters.
It does, for this repository in particular: many agents work here in parallel,
and a library that ships its own docs index, MCP server and skills is one whose
components agents will use correctly without being told. That argument was
under-weighted when Radix Themes was proposed above, so the choice is reopened
at the gate.

The Product Owner then added three requirements the same day: a good drawer
(the phone sidebar is a hand-rolled one today), a theme close to ours so it is
not reinvented, and light and dark. Checked against current docs:

| Requirement | Mantine 9 | Radix Themes 3 | shadcn/ui |
| --- | --- | --- | --- |
| A good drawer | **Yes.** Drawer with four sides, sizes, offset, overlay blur, focus trap, scroll lock, escape and click-outside, stacked drawers, aria labelling. Replaces `.sidebar` and `.nav-backdrop` outright. | **No.** No Drawer or Sheet among its components; a drawer would be a hand-styled Dialog or a third-party library, which is the reinvention we want to avoid. | **Yes.** Sheet (four sides, on the Dialog) and a separate bottom Drawer; the Sidebar itself becomes a Sheet under 768px. |
| A decided shell | **Yes.** AppShell: header with burger and logo, navbar that is a sidebar above a breakpoint and a full-width overlay below it. Mantine UI adds 123 free blocks, six headers and nine navbars among them. | **No.** Layout primitives only. | **Yes.** Sidebar with provider, header, content, footer and groups; offcanvas, icon or static; keyboard shortcut. Free blocks installed by name (`sidebar-07`, `dashboard-01`, `login-03`). |
| A theme like ours | **Partly.** Neutrals are cool greys on white; `orange` is built in as `primaryColor`; fonts and radius are theme fields; a `cssVariablesResolver` maps our paper and ink tokens onto body and text per scheme. About a day, done once, or an hour if we accept Mantine's neutrals. No official gallery of themes to pick from; the third-party MantineHub builder offers shadcn-style cool-grey presets. | **Best.** `grayColor="sand"` with `accentColor="orange"` is close to paper, ink and orange with no work. | **Good.** Init picks a base colour from Neutral, Stone, Zinc, Mauve, Olive, Mist and Taupe; Stone and Taupe are warm and the closest thing to our paper any of the three offers as a preset. The accent is a CSS variable we set. |
| Light and dark | **Built in.** `defaultColorScheme="auto"`, a hook, stored choice, `data-mantine-color-scheme`, `light-dark()` and per-scheme hidden props. | **Built in.** `appearance` prop with both palettes shipped; following the system needs a small helper. | **Built in** as a `.dark` class with a second token set; we write the documented fifty-line provider for system preference and storage. |
| Agent support | Official llms.txt, MCP server, skills. | None official. | Official MCP server, llms.txt. |
| Who owns the components later | **Mantine does.** We upgrade a package; fixes and new components arrive; a major roughly yearly with a migration guide. | Radix does. | **We do.** Every component is copied into `src/web/`. No upgrades to take, and no fixes either; thirty files of ours to keep consistent, which with many agents in turn is where drift starts. |
| What it costs | About four packages and a PostCSS preset; the most opinionated look until themed. | One package. | Tailwind and its Vite plugin, class-variance-authority, clsx, tailwind-merge, an icon set and the primitives, about eight packages; a second styling paradigm beside plain CSS. |

Under any of the three, the dark palette is new work: nothing in the repo
defines what paper, ink and orange become at night. Radix is the only one
whose warm neutral ships a dark scale that fits without deciding that.

Tried, 2026-09-08, on the Product Owner's ask: both MCP servers were run
from this repository over stdio, the way Claude Code runs them, with a
throwaway script that sent initialize, tools/list and a few read-only calls.
Nothing was added to `.mcp.json`. shadcn's server (`bun x shadcn@latest mcp`)
started in 1.3s and offers seven tools: registries, list, fuzzy search, view,
examples, the add command, and an audit checklist. Searching "sidebar"
returned 31 items in 161ms; the example for `sidebar-07` came back as 17KB of
Tailwind JSX; viewing the `sidebar` component listed its dependencies
(radix-ui, class-variance-authority, lucide-react) but not its source, and
the search output printed `[object Promise]` where each add command should
be, a bug in the server itself. Three of its tools say they need the
components manifest that only shadcn's init command writes, so the full
experience assumes Tailwind is already in. Mantine's server (`bun x @mantine/mcp-server`,
version 9) started in 1.8s and offers four tools: list, docs, props, search.
Searching "drawer" returned the Drawer in 626ms; its props came back as
structured JSON with descriptions, defaults and types (9.5KB); the AppShell
doc came back as 20KB of markdown with a link to its llms page. Both work
without any project setup. The difference in what they return is the
difference in the libraries: shadcn hands an agent code to paste and
Tailwind classes to imitate; Mantine hands it an API to call.

The Product Owner then asked whether anything else in the field is better
and as easy for an agent. Checked the same day against current docs. Agent
support turned out to be table stakes in 2026: every library below ships an
MCP server and LLM docs. What separates them is the rest of the list.

| Also considered | Why not, or why maybe |
| --- | --- |
| Chakra UI v3 | The nearest peer to Mantine: official MCP server, llms.txt, three official Claude Code skills (build, migrate, refactor), a Drawer with placements and focus trap, colour mode, semantic tokens, readable style props. Costs: Emotion runtime CSS-in-JS on phones, no app shell (blocks are in the paid Pro), a neutral cool look, and v2 training data that contradicts v3. Not better than Mantine; a fair second. |
| HeroUI v3 | The most AI-first newcomer: MCP server, agent skills, llms.txt, a theme builder exporting CSS with OKLCH tokens (ours are OKLCH already), prebuilt themes, a Drawer with four placements and drag to dismiss, React Aria accessibility, Apache-2.0. Costs: Tailwind v4, no app shell (templates are paid), a rounded "beautiful by default" look far from paper and ink, and a v3 too young for training data. Worth watching; not the safer choice for a repo that wants decisions to hold. |
| MUI | Official MCP server and llms.txt, Drawer, dark mode, the largest training footprint of all. It is Material, and Material is the opposite of this identity. The heaviest of everything here. No. |
| daisyUI 5 | 35 themes, and four are warm paper (caramellatte, retro, autumn, coffee), the closest palette to ours anywhere; an official MCP code generator. But the components are CSS classes with no behaviour: no focus trap, no keyboard handling, no React. The admin console was ported off daisyUI once already. No. |
| Park UI on Ark UI | Ark ships an MCP server and llms.txt; Park adds Radix colours (sand and orange) and copy-in components on Panda CSS. A third styling paradigm, the copy model, and a small community. No. |

Recommendation as of 2026-09-08, second revision: **Mantine.** It is the only
candidate that meets the drawer, the light/dark and the agent-support
requirements together; the theme is the one place it asks for a day of
mapping. Radix Themes falls on the drawer. shadcn meets the requirements but
brings Tailwind into a plain-CSS codebase. The gate answer names the system.

### B1 — tooling first, standard setup, no surface swapped

The Product Owner's instruction, 2026-09-08: "I want to not change any of
our GUI yet. I want to make sure the tooling is set up perfectly first."
And, on a first draft of this stage that promised a byte-for-byte capture
comparison and a hand-trimmed Tailwind import: "seems stupid to me. We do
not want to reinvent wheels." So B1 is shadcn's own setup exactly as it
ships, nothing bespoke around it. "No GUI change" means the plain thing: no
component is replaced yet. If Tailwind's base reset shifts a native control
somewhere, that is fixed forward the shadcn way, not by trimming the import.
Acceptance is the existing gate and a look at the captures, nothing new.

- [x] **1. Init on the Vite app.** Done 2026-09-08, by hand to what init
      writes, because init's non-interactive path scaffolds a new project and
      its presets (Nova and friends) fix a font we do not want. A scratch
      `init --template vite -p nova` in the scratchpad showed exactly what it
      writes for shadcn 4.21, and this repo now carries the same shape:
      `components.json` (style base-nova, base colour **Stone**, css
      `src/web/styles.css`, the `@/` aliases), the packages as dev
      dependencies like React here (tailwindcss, @tailwindcss/vite, shadcn,
      cn, class-variance-authority, @base-ui/react, lucide-react,
      tw-animate-css; not the Geist font), `paths` in `tsconfig.json` and the
      alias plus the Tailwind plugin in `src/web/vite.config.ts`,
      `src/web/lib/utils.ts` re-exporting `cn`, and in `src/web/styles.css`
      the three imports, the dark variant, our four font tokens as Tailwind's
      theme, and shadcn's theme blocks exactly as its tooling writes them.
      **The theme is decided by shadcn's preset system, not by us.** A first
      draft mapped shadcn's colour names onto our paper and ink by hand; the
      Product Owner rightly called that reinventing, and it is gone. The
      preset (style Nova, base colour Stone, theme Orange, font Inter, default
      radius, the same fields https://ui.shadcn.com/create offers) is recorded
      in `components-lock.json`, and `bun run ops ui theme` sends it to
      shadcn's preset endpoint and lets `shadcn add` write the light and dark
      values into the stylesheet. Change the theme by editing that JSON and
      running the command, or by clicking through the create page and
      copying its fields in. Proof: running the command on the finished file
      changed one trailing newline and nothing else. One line in the theme
      block is ours, `--font-heading: var(--font-display)`, headings in Space
      Grotesk; the fonts themselves stay self-hosted for Thai. So that
      shadcn's names are shadcn's, our old orange is now `--brand` and our
      6px corner `--radius-legacy` in the legacy rules and in `main.tsx`; our
      old type scale is `--type-*` so Tailwind's `--text-*` scale, which
      shadcn's components are designed against, stays untouched. Proof:
      build, typecheck and lint green; the client stylesheet went from
      47,991 bytes (8,411 gzipped) to 71,897 (13,152) — Tailwind's base, the
      preset's tokens and the button's utilities, which Tailwind generates
      for any component in the tree whether imported or not; the JavaScript
      is byte-identical at 612,577 (171,511 gzipped).
- [x] **2. Agents get the same setup.** Done: the shadcn server is in
      `.mcp.json` beside Playwright, as `bun x shadcn mcp`, pinned through
      `package.json`. Proof: run from the repo it listed its seven tools and
      read the manifest (no configured namespaces yet, as intended). The
      allowlist lives in `components-lock.json`, not the manifest, because
      the official index resolves namespaces with no configuration at all;
      the reasoning is in `scripts/lib/registry-lock.ts`.
- [x] **3. Owned components cannot drift.** Done: `bun run ops ui add
      <item...>` and `bun run ops ui check` in `scripts/ops/ui.ts`, the lock
      logic in `scripts/lib/registry-lock.ts`, and `tests/repo/registry.test.ts`
      asking the same question in the repo tier. Proof, run 2026-09-08: added
      `button` through the command (one file locked with its sha256); check
      green; appended a comment by hand; check red, naming the file and the
      re-add command; re-added; check green; `add @magicui/marquee` refused
      with the allowlist and how to extend it. knip treats
      `src/web/components/ui/*.tsx` and the utils alias as entries, with the
      reasons beside them.
- [x] **4. Light and dark, wired but not switched.** Done, smaller than
      planned: `src/web/lib/theme.ts` holds the part with no React in it
      (the three choices, resolution against the system, the class on the
      root, the storage key `remy.theme`) with `tests/unit/theme.test.ts`;
      the `.dark` token block is defined and marked provisional. The React
      provider and the switch are not written until the shell mounts them
      (B2 step 8): a component nothing renders is what knip is for.
- [x] **5. Guards for the new surface.** Done: `tests/repo/styles.test.ts`
      refuses `text-[Npx]` under 12px and any `font-[…]` class in JSX, and
      allows the `dark` class with the reason. Twelve rules in that file now.
- [x] **6. Gate and a look.** Done 2026-09-08: `bun run check` passed
      **868 unit/repository/Worker checks and 319 rendering checks**;
      `bun run test:e2e` passed **all 49** with cleanup; `bun run shots --
      --grep-invert 'devices.*desktop'` passed **186** with isolated storage
      removed. Looked at Discover, event management, the Places tab, sign-in,
      a phone profile and the Thai entries page. One thing had moved: the
      court names on Places, headings with no rule of their own, lost the
      browser's bold default because Tailwind's reset makes headings inherit.
      Put back as a base heading rule in the layer init writes, the standard
      way, not by trimming the reset; the render tier and the Places captures
      were run again after it.

When B1 is done the repository has Tailwind, shadcn's manifest, its MCP
server, the add-and-lock command, the drift check, the dark tokens and the
theme logic, and no component has been replaced. **That is the state on
2026-09-08.** Not committed.

Two things learned in B1 that the next agent should not relearn:

- The MCP server's search and list output prints `[object Promise]` where
  each add command should be (shadcn 4.21). The add command itself is
  correct: `bunx shadcn@latest add @shadcn/<item>`, or here,
  `bun run ops ui add <item>`.
- `shadcn apply <code>` answered 400 for every preset code on 2026-09-08,
  including the project's own, and `init` without a preset prompts. The
  endpoint both use, `https://ui.shadcn.com/init?…&only=theme`, works, tells
  you its accepted values when you get one wrong, and `shadcn add <that url>`
  writes the result; that is what `bun run ops ui theme` does.
- Tailwind's reset makes headings inherit; a heading with no rule of its own
  loses the browser's bold. The base heading rule in the stylesheet is the
  standard answer.
- shadcn's Vite theme provider is a 200-line component with a `d` keyboard
  shortcut and cross-tab sync. When B2 writes ours it can start from that
  file (the scratch init wrote it) and drop what the app does not want.

### B2 — the surfaces, one family at a time

Not before the Product Owner says so, after B1's proof. The word came
2026-09-08, the same day, after the B1 summary: step 8 first.

**Language and dates do not move.** shadcn's components carry no text and
no dates: a Button renders what it is given, and everything visible stays a
paraglide message, as now. The few registry components that ship an English
word of their own (a Dialog's screen-reader "Close", Pagination's "Previous"
and "Next", the Calendar's weekdays) are caught by the existing copy check,
which walks `src/web/components/ui/` like everything else, and the fix is
never to edit the copied file: hide the built-in control by prop and render
our own with our message, or pass the label in. Dates keep formatting through
`src/web/lib/dates.ts` (Intl, per locale, per time zone) and the native
date-time inputs the schedule uses today; no shadcn calendar is adopted
unless it is wired to that formatter and the reader's locale.

- [x] **8. The shell from blocks.** Done 2026-09-08. Installed through the
      lock command, one item per command: `sidebar`, `sheet`, `dropdown-menu`,
      `toggle-group`, `switch`, `avatar`, `tooltip`, `separator`, `skeleton`
      (15 locked items; the sidebar's `use-mobile` hook is locked with them).
      The shell is `components/app-sidebar.tsx` on the registry's Sidebar
      (`collapsible="icon"`), the Sheet under 768px is the registry's own, and
      <!-- docs-check-ignore --> `components/sidebar.tsx` — the file this step
      replaced — is gone with `.nav-backdrop`, the `navOpen` state and 96
      lines of shell CSS. The topbar is one row at every
      size: our own menu button (not the registry's `SidebarTrigger`, which
      carries a hardcoded English screen-reader label), the brand moved in
      from the sidebar, then Sign in or the person as one DropdownMenu
      trigger whose menu holds Profile, Devices, Admin when permitted, Install
      app when the element says it can, and Sign out — the account chores the
      mobile plan found clipping off an admin's phone. Settings live in the
      sidebar's Settings group: language as a ToggleGroup, spoiler as a
      labelled Switch, theme as a dropdown over the new `lib/theme-provider.tsx`
      (the provider B1 step 4 promised, now mounted). Test ids moved with the
      elements (`account-…`); the topbar overflow check from the mobile plan's
      step 1 now runs for every role at 320 and 390px, and `nav-<page>` ids
      carry `aria-current`. Proof: `bun run check` green — 868 unit and
      repository checks, 333 rendering (319 + the 14 new topbar checks) —
      `bun run test:e2e` all 49 with cleanup, and 222 captures with the dark
      slice added to the shots harness (6 screens × 3 locales × 2 viewports,
      `remy.theme` set before first paint).

      Three things found on the way, recorded so the next agent does not
      relearn them:

      - The registry's mobile Sheet announces itself to screen readers in
        hardcoded English ("Sidebar", "Displays the mobile sidebar."). It is
        inside the copied file, not parameterisable, and the fix is never to
        edit the copied file — so it stands, and `tests/repo/copy.test.ts`
        now exempts `src/web/components/ui/` with the reason: those files are
        hash-locked, the per-line ignore marker cannot be written into one
        without breaking the lock, and the reader-facing guarantee moves to
        this check over everything we author, the render-tier i18n checks,
        and the rule that we render our own labelled control rather than a
        registry one that carries English. The topbar's menu button is ours
        for exactly that reason.
      - The topbar fit at 320px three times: the brand still carried its
        sidebar padding and border (48px of dead gutter), the account name
        needed to become an ellipsis at narrow widths, and the webfont
        loading late measured wider than the fallback face — so the brand is
        shrinkable with an ellipsis and the overflow check waits for both the
        stylesheet and `document.fonts.ready` before it measures.
      - The provisional dark tokens from B1 are now live, and the bespoke
        legacy surfaces that hardcode `var(--paper)` (the Discover live
        banner is the loudest) render as light islands in the dark shots.
        That is step 13's work, not step 8's: the dark palette for the
        remaining bespoke rules is still owed.
- [x] **9. Forms.** Done 2026-09-08. Every form is the system's components:
      sign-in, organisation editing, event settings, score entry, invitations,
      divisions, players, sessions, profile, devices, notifications, the box
      score and the admin forms — Field/FieldLabel/FieldError/FieldGroup,
      Input, NativeSelect, Textarea, Button, Alert. The replaced rules are
      deleted from `src/web/styles.css` in the same change: `.btn` and its
      variants, `.form-stack` and the global `:where(input, select, textarea)`
      field rule, `.province-filter` — no compatibility aliases, and the
      dead-class check holds the line. What deliberately stays: the
      `admin-table` button rules (the tables are step 10's surface), the
      global field rule scoped to its last users (the admin role select and
      the two inline fixture controls), `.login-code`, and the focus ring.
      Proof: `bun run check` — **897 unit/repository/Worker checks and 333
      rendering checks**; `bun run test:e2e` all green.

      Three findings the swap surfaced, recorded because each one is a rule
      for the steps that follow:

      - **Base UI's Button must not render links.** It enforces
        `role="button"` on whatever it renders — its own docs say links have
        their own semantics and must not pass through it. The first swap used
        `render={<a>}` with `nativeButton={false}`; every such control
        rendered as an anchor that announced itself as a button, and
        `getByRole("link")` found nothing. The answer is
        `src/web/components/button-link.tsx`: an `<a>` with the registry's
        `buttonVariants` plus `min-h-11`, used at every route link that is
        dressed as a button (17 sites).
      - **Unlayered CSS beats utilities, whatever the specificity.** The old
        `button { background: none }` reset sat unlayered while Tailwind's
        `.bg-primary` lives in `@layer utilities`, so the Save button rendered
        with no fill at all. The element resets now sit in `@layer base`,
        where a reset belongs: defaults that any component's utilities beat.
      - **The 44px control height is a product rule, not a legacy accident.**
        The registry sizes for a desktop mouse (button and select 32px, input
        36px); the render tier holds every control to `--control-height`
        (44px) for a thumb at courtside. One min-height rule in our layer
        lifts them all via their `data-slot` hooks — the locked files stay
        byte-identical — and the topbar is the documented exception, because
        its row is 56px by the mobile plan's number and the overflow check
        holds it there.
- [ ] **10. Lists and tables.** Event list, standings, management tables,
      badges and type tags: Table, Badge, Card. Proof: same, plus the
      320/390/1440 EN/TH/JA alignment checks.
- [ ] **11. Our own registry.** A registry manifest at the repository root
      naming the game summary row, score entry, the standings table and the
      page frame, with their dependencies, so the repository is a GitHub
      registry with no build step; the allowlist gains it. Proof:
      `bun x shadcn@latest view joeblew999/remy-sport/game-summary` returns
      the item, and the MCP search finds it.
- [ ] **12. Tests follow the markup.** Move render-test locators from class
      names to roles and labels as each surface migrates. On 2026-09-08
      `tests/render/` has 66 class-based locators and 47 role/label ones.
      Proof: no `locator(".…")` remains for a migrated surface.
- [ ] **13. Delete what is replaced.** `src/web/styles.css` under 900 lines
      when the shell is done; every remaining rule is a token, a layout rule,
      or media-specific (court board, video). Proof: the dead-class rule and
      the B1 guards pass.
- [ ] **14. Full gate and visual record**, counts recorded below; Product
      Owner review of Discover, an event, sign-in and the admin console on a
      phone and a desktop, in EN, TH and JA, light and dark.

### If shadcn is chosen: registries, researched 2026-09-08

The Product Owner asked how shadcn's registries work and how to leverage
other people's. Read from shadcn's registry, namespace, GitHub-registry and
authentication docs, the official index, and a live test from this repo.

**Mechanics.** A registry is a catalogue of JSON items; each item names its
type (ui, block, theme, style, hook, lib, page, file), its source files, its
npm dependencies and its `registryDependencies` on other items, in any
registry. `add` copies the files into the project and installs the
dependencies; cross-registry dependencies are resolved, ordered and
deduplicated. Items are addressed as `@namespace/item`.

**Three kinds of namespace.**

| Kind | How it resolves | Setup |
| --- | --- | --- |
| The official index | About 400 open-source registries listed at `https://ui.shadcn.com/r/registries.json`; the CLI consults it on `add` and `search`, so `@magicui/marquee` works with **no configuration**. Listing is by pull request with schema validation and no gatekeeping. | None. |
| A configured namespace | The components manifest maps `@name` to a URL template with `{name}`; private ones add headers such as `Authorization: Bearer ${TOKEN}` with the value from the environment. | One entry per registry. |
| A GitHub repository | `add <user>/<repo>/<item>` reads a registry manifest at the repository root; no build, no server. Public repos work anonymously; private ones through the GitHub CLI's login or `GH_TOKEN`, and the token never enters the shadcn process. | A registry manifest in the repo. |

**Live test, this repo, no manifest present.** `bun x shadcn@latest search
@shadcn --query calendar` found five items; `search @magicui --query marquee`
found six from a third-party registry the repo had never named; `view
@magicui/marquee` returned the component's source, its theme variables and
its keyframes in full. The MCP server searches the same namespaces.

**What is out there.** Themes (tweakcn's editor, glass and brutalist sets),
blocks (150 to 600 per registry, some paid), charts, animation sets (Magic
UI, Animate UI, Aceternity), forms, a headless data grid, kanban and gantt,
AI chat primitives, and vendor registries from Auth0, Clerk and Better Auth.
The Better Auth one is relevant here: this app authenticates with Better Auth.

**How to leverage it here, in order.**

1. Install the shell, sign-in and dashboard from `@shadcn` blocks by name.
2. Apply a theme preset rather than writing tokens by hand.
3. Publish our own registry from this repository: a registry manifest naming
   the game summary row, score entry, standings table and the shared page
   frame as items with their dependencies. Any agent then installs
   `@remy/game-summary` instead of re-creating it, and the MCP server finds
   it in search. A private GitHub registry is enough.
4. Pull single components from vetted third-party registries when a need is
   real (a date picker, a data grid), never whole sets.

**The rule that makes it safe.** Every added item is code from whoever wrote
the catalogue, and the official index has no gatekeeping. So the components
manifest lists an allowlist, `@shadcn` and `@remy` plus any registry approved by name
with a reason, and a repository check under `tests/repo/` refuses an item
whose namespace is not on it and fails if a file under the UI folder differs
from its registry version, so `add --overwrite` stays safe. Without that rule
the ecosystem is how drift arrives; with it, it is a parts bin.

### Kept as-is, on purpose

The court board, the live video page and the bracket view keep their own
rules. They are media and sport-specific and no design system has them. They
still use the font tokens and the type scale.

## Done when

Stage A: the body is 16px, nothing is under 12px, monospace appears only where
digits align, every font-family is a token, and the repo check enforces all
four. Gate and captures recorded.

Stage B: the gate answer is recorded (it is: shadcn); every form, list, table
and shell control is a shadcn component under the lock, the MCP server and
the registry allowlist are in the repo, our own registry answers by name,
`src/web/styles.css` is under 900 lines, retired classes are guarded, and the
gate is green with the captures reviewed in light and dark.

## Log

- 2026-09-08 — written. Evidence gathered by reading `src/web/styles.css`, the
  captures under `screenshots/`, and the render tests. No application code was
  changed and no tests were run for this plan; the docs check was run after
  writing it.
- 2026-09-08 — Stage A done, same day, on the Product Owner's "GO". The
  stylesheet is 1,456 lines from 1,891; 42 dead classes deleted; four font
  tokens and a type scale; body 16px, floor 12px; mono in 8 rules, uppercase in
  8. `tests/repo/styles.test.ts` grew from one rule to ten. Gate: 859 + 319;
  shots: 186 with cleanup. Working tree also carries the earlier, unrelated
  browser-isolation edits (`playwright.config.ts`, `scripts/e2e.ts`,
  `scripts/db.ts`, `src/web/vite.config.ts`, `tests/helpers/auth.ts`,
  `tests/e2e/auth.setup.ts`, `tests/render/mobile-layout.spec.ts`); they are
  not part of this change and were not touched. Nothing is committed. Next:
  the Stage B gate answer.
- 2026-09-08 — gate answered: shadcn, by the Product Owner, against this
  document's Mantine recommendation and with the reasons in view. Stage B
  rewritten as the shadcn setup above, then split on the Product Owner's
  instruction into B1 (tooling) and B2 (surfaces).
- 2026-09-08 — B1 done, same day, on "YES make sure you get the tooling
  right". Standard setup mirrored from a scratch init; button added through
  the new lock command as the proof; the legacy type scale renamed
  `--type-*` so Tailwind's scale stays its own; one base heading rule after
  the captures. Gate 868 + 319, e2e 49, shots 186. Then, on the Product
  Owner's "YES I want to use their tooling so that we fully align", the
  hand-mapped theme was replaced by shadcn's preset output through the new
  `bun run ops ui theme`, our orange and radius renamed out of shadcn's
  names, and the render tier (319) and 27 captures run again unchanged.
  Three upstream facts noted above for the next agent. B2 waits for the
  Product Owner.
- 2026-09-08 — B2 opened on the Product Owner's "ok" at the step-8 question.
  Before it, the registry items step 9 and 10 will need were added raw
  through the lock command and no surface swapped: button (re-added after a
  stale copy was deleted; byte-identical, so the component source was never
  the problem), card, input, badge, table, tabs. Lock: 6 items, check green.
  Step 8 (the shell) is in progress.
- 2026-09-08 — **B2 step 8 done.** The shell is the registry's Sidebar with
  the account dropdown on the topbar avatar, settings in the sidebar, the
  theme provider mounted, and the old sidebar, backdrop and shell CSS gone.
  Gate: 868 unit/repository, 333 render, 49 e2e, 222 shots including the new
  dark slice. The mobile plan's steps 1 to 4 are absorbed (its doc records
  the change of mechanics); its remaining steps (compact detail headers,
  sticky tabs) stay open. Lock: 15 items. Tech debt recorded in step 8: the
  ui/ copy-check exemption with its reason, the two registry sr-only English
  strings that still mount on phones, and the legacy `var(--paper)` surfaces
  that now read as light islands in dark mode until step 13. Nothing is
  committed; the working tree carries B1, the raw items, and this step. Next:
  step 9, forms.
