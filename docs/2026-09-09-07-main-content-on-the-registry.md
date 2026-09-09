# Plan — main content on the registry, like the sidebar already is

Status: partially implemented 2026-09-09; visual acceptance and remaining
registry/check reconciliation are open. The implementation log below supersedes
the original proposal. The earlier GUI-conversion plan is archived; this plan
owns its unfinished composition work.

The Product Owner: the sidebar — *"shadcn/sidebar, which is the drawer"* — has
great fonts and look, and all our main content has a shitty font and look.
Taken as reported and confirmed in the tree: the two halves of the screen are
built in two different ways, and only one of them is the registry's.

Throughout this file, **the drawer** means `@shadcn/sidebar` as rendered by
`src/web/components/app-sidebar.tsx`. It is not `@shadcn/drawer`, which is a
separate registry item and is **not installed**.

## The measurement

Read from the tree on 2026-09-09; no code changed to write this.

**The drawer is nine dedicated registry primitives.** `app-sidebar.tsx` composes
`Sidebar`, `SidebarContent`, `SidebarGroup`, `SidebarGroupContent`,
`SidebarGroupLabel`, `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton` and
`SidebarFooter`. Each one carries shadcn's own size, weight, density, muting,
hover and active states — a set tuned together, by them, as a system. Our file
adds 14 `className`s in total, and none of them is a font size.

**Main content is generic atoms, re-styled at each use.** Outside
`components/ui/`, our pages and components carry:

| Drift | Count |
| --- | --- |
| Hand-picked type classes (`text-*`, `font-*`, `tracking-*`) | **140** |
| `className` overrides of size, padding, radius or gap **on a registry component** | **100** |

The overrides concentrate exactly where content lives: `ItemTitle` 24,
`ItemGroup` 23, `Item` 20, `TableCell` 12, `CardContent` 12. `Item` is a
generic row, so every list re-decides what a row looks like.

**The page frame invents its own scale.** `src/web/components/page.tsx` is ours,
not the registry's, and it is where the content's typography is actually
decided:

- `h1` is `text-2xl font-semibold tracking-tight sm:text-3xl`
- `h2` is `text-xl font-semibold tracking-tight`
- `LinkRow` forces `ItemTitle` to `text-base` and `Item` to `rounded-none px-4 py-3`
- gutters are `px-4 py-5 sm:px-8 sm:py-6` and `py-6 pb-16`

Its own comment says shadcn has no page-header item, so it writes the JSX a
block would. That is a reasonable thing to have done, and it is also where a
second type scale entered the app — one nobody tuned against the first.

**So the two halves differ in kind, not in taste.** The drawer is a designed
system used as shipped. The content is an assembly of general-purpose parts,
each given a size at the call site. That is why one reads as designed and the
other reads as assembled, and it is what the Product Owner is seeing.

### `Item` is already as designed as the sidebar, and we override it

Read from the installed `components/ui/item.tsx` on 2026-09-09. It is not a
bare row: it ships a full size system, the same kind of thing the sidebar ships.

- `Item` — `rounded-lg border text-sm`, `gap-2.5 px-3 py-2.5`, with `sm` and
  `xs` sizes and `[a]:hover:bg-muted`
- `ItemGroup` — `gap-4`, tightening to `gap-2.5`/`gap-2` when its items are
  smaller, automatically
- `ItemTitle` — `text-sm leading-snug font-medium`
- `ItemDescription` — `text-sm leading-normal text-muted-foreground`, dropping
  to `text-xs` inside an `xs` item
- `ItemMedia` — `size-10`, to `size-8`, to `size-6`, by the item's size

We do not use any of it. **We work against it**, in two repeated ways:

| What we do | Times | What it means |
| --- | --- | --- |
| `rounded-none` on an `Item` | 33 | flattening the registry's `rounded-lg` |
| `text-base` on an `ItemTitle` | 23 | overruling the registry's `text-sm font-medium` |
| `divide-y` list built inline | 27, across 23 files | a pattern the registry does not ship |

That is the finding that matters most, and it is good news for the work. Those
83 overrides are not 83 decisions. They are **two**:

1. **A divided list inside one bordered box** is a real pattern the registry has
   no variant for — `ItemGroup` ships spaced cards. We have therefore written it
   by hand 27 times, in 23 files, each copy free to differ. It should be one
   variant on `ItemGroup`, written once.
2. **The row title size.** The registry says `text-sm font-medium`; we say
   `text-base`, 23 times. That is one decision about the content scale, taken
   23 times without ever being taken once.

So stage 2 is not an audit of a hundred call sites. It is two changes in two
component files, and then deleting the copies.

## Why the existing check did not catch it

`tests/repo/styles.test.ts` holds the line in `src/web/styles.css` — no literal
font families, no sizes under the floor — and it passes. It reads **the
stylesheet only**. All 140 type classes and all 100 overrides are in `.tsx`,
where no check looks.

The 2026-09-08 conversion moved the app off a bespoke stylesheet and onto the
preset, which is real and is why `styles.css` is now clean. The drift did not
stop; it moved to the JSX, and the guard did not follow it. **Closing that blind
spot is part of this plan, not a follow-up** — without it the same thing
returns by the same route.

## What is not wrong

Worth stating so the work is not aimed at the wrong thing.

- **The font is right.** `components-lock.json` records the preset's font as
  `inter`, and `styles.css` sets `--font-sans` to Inter and applies it at
  `html`. We are not overriding shadcn's choice of face; both halves of the
  screen are already Inter. What differs is the *scale, weight, density and
  rhythm* applied to it. "Shitty font" is a true report of a real difference;
  the cause is typography, not the typeface.
- **The theme is right.** Style Nova, base Stone, theme Orange, written by
  `bun run ops ui theme` and not hand-edited.

## Approach

The Product Owner's standing rule (2026-09-08): never reinvent a GUI wheel;
every generic element is the registry item; their theme, not ours. The drawer
obeys it. This applies the same rule to the other 80% of the screen.

The principle for every decision below: **a size is decided once, in a component
file, not at a call site.** When the registry ships a component for the job,
install it and use it as shipped. When it does not, the size still belongs in
one of our component files, chosen to sit on the registry's scale — never in a
page.

Twenty-five registry items are not installed, several of which we hand-roll
today: `accordion`, `dialog`, `select`, `popover`, `scroll-area`, `pagination`,
`progress`, `input-group`, `hover-card`, `command`, `combobox`, `form`,
`sonner`, `kbd`, `chart`. Each is a candidate to replace something we wrote.

## Stages

Ordered so each is provable on its own and none needs the next.

| Order | Deliverable | Acceptance |
| --- | --- | --- |
| 1 | **Two decisions, on one screen.** Show the Product Owner the registry's row against ours — `text-sm` title in a `rounded-lg` bordered row against our `text-base` title in a flat divided list — in both languages, light and dark. Nothing else in stage 1. | They pick the row. Everything below follows from it, and nothing below starts without it |
| 2 | **Write the two decisions once.** A divided-list variant on `ItemGroup` (replacing 27 inline copies across 23 files) and the chosen title size on `ItemTitle` (replacing 23). Then delete the copies: 83 of the 100 overrides go without a per-site judgement. | No `rounded-none`, `divide-y` or `text-base` on a registry component outside `components/ui/`; the render tier stays green |
| 2b | **The remaining 17.** `TableCell`, `CardContent` and the stragglers, each read on its own — this is the part that is genuinely one-at-a-time. | Same rule, or a comment beside it saying why it is exempt |
| 3 | **Put the page frame on that scale.** `page.tsx` stops inventing `text-2xl`/`text-xl`/`text-base` and takes its sizes from the same place the drawer does. | The page title, section heading and row title are one scale with the sidebar, in a screenshot the Product Owner accepts |
| 4 | **Install what we hand-rolled.** Replace our own versions with the registry item wherever one exists, chosen from the uninstalled list above by what pages actually do. | Each replacement is one commit naming the item and the code it deleted |
| 5 | **Close the guard's blind spot.** Extend the repo check from `styles.css` to the JSX: an ad-hoc type class outside `components/ui/` fails, with an allowlist that must name a reason. | The check fails on a reintroduced `text-2xl` in a page, and passes on the tree once stage 2 and 3 land |
| 6 | **Look at it.** Re-shoot the walk, light and dark, all three languages, phone and desktop, and put the before/after in front of the Product Owner. | The Product Owner says the content and the drawer look like one app |

## Risks, stated up front

- **The render tier asserts the current look.** 345 rendering checks include
  font-size relationships and layout. Changing the scale will move some of them.
  They must be re-read and re-justified one at a time, never bulk-updated until
  green — a test edited to match a change it was meant to catch is worse than no
  test.
- **Thai and Japanese.** The scale must be judged in all three languages, not
  English alone. Noto Sans Thai has a different vertical rhythm; a size that
  reads well in English can crowd Thai.
- **Touch targets.** The 44px rule in `styles.css` exists for courtside use and
  is not a typography decision. It stays.
- **This is a look change, so it needs the Product Owner's eye, not a green
  gate.** Stage 6 is the acceptance, and stages 1 and 3 need a decision from
  them before the work continues past each.
- **The page header is the one place with no registry answer.** shadcn ships no
  page-header item, so the `h1` and `h2` sizes in stage 3 are a choice, not a
  copy. It is a small choice — two sizes — and it should be pinned to the row
  scale agreed in stage 1 rather than picked freely. Everything else in this
  plan is deletion or a variant written once; this is the only design decision,
  and it should be called one when it is made.

## Done when

Main content and the drawer are built the same way: sizes decided in component
files on the registry's scale, no type classes scattered through pages, the
registry item used wherever one exists, a check that keeps it that way, and the
Product Owner looking at the result and saying the two halves belong to one app.

## Log

- 2026-09-09 — written, at the Product Owner's report that the drawer looks
  right and the main content does not. Measurement above is from the tree.
- 2026-09-09 — stages 2, 2b, 3 and 5 implemented on "GO", `431b19a`. Stage 1's
  decision was taken as the registry's own answer rather than put to the
  Product Owner first, because that is the standing rule; the result is a
  screenshot for them to reject if it reads wrong.
  - `RowGroup`/`Row` in the page frame; 22 inline copies gone. Rows keep
    `Item`'s padding, radius, hover and title size.
  - The heading ladder in one place, at `font-medium` — the registry's weight,
    where this app had used `font-semibold`.
  - `--font-heading` restored: the preset defines it as `var(--font-sans)` and
    `ops ui theme` drops it by asking `only=theme`, so `card`, `alert-dialog`,
    `sheet` and `empty` were referencing a token that did not exist. **No pixel
    moves** — it resolves to the sans face, exactly as the preset says.
  - Three JSX rules in `styles.test.ts`, which had only ever read the CSS.
  - Counts: type classes 140 → 113, `rounded-none` 33 → 8, inline `divide-y`
    27 → 6, resized `ItemTitle` 23 → 0.
  - Gate: 933 unit/repository/Worker, 345 rendering, typecheck, lint.

### Still open, and why it is not "finished"

- **Stage 4 is not started.** Twenty-five registry items are still uninstalled
  while we hand-roll their jobs. That is the largest remaining piece and the one
  that would most change how the app is built, not merely how it is sized.
- **The remainder is real, not rounding.** 113 type classes, 8 `rounded-none`,
  6 inline `divide-y` survive. Most are legitimate — a full-bleed `Alert`, a
  line-variant `TabsList`, a phone layout — but they have not each been read.
- **The method was retrofitting, not porting.** These edits were made by regex
  across twenty-four files and broke the build twice before they landed. The
  destination is right; the route to it is a sign that the September 8 port was
  declared complete while its composition half was untouched.
- **Stage 6 has not happened.** The walk has not been re-shot in three
  languages, light and dark, phone and desktop, and the Product Owner has not
  compared before and after. Until they have, this is not accepted.

## What a full port actually means — shadcn's own page, fetched 2026-09-09

The Product Owner, twice: it still looks the same, and this is not a full port.
Both are right, and guessing stopped here. `dashboard-01` for our exact preset
was fetched from `https://ui.shadcn.com/r/styles/base-nova/dashboard-01.json`
and read. It is shadcn's own answer for a page beside a sidebar, and it differs
from ours in **architecture, not in sizes**:

| | shadcn's block | Remy today |
| --- | --- | --- |
| Page title | `<h1 class="text-base font-medium">` **inside the top bar**, beside the sidebar trigger and a separator | `text-2xl/3xl font-semibold` in a bordered `PageHeader` band below the bar |
| Sidebar | `<AppSidebar variant="inset" />` — floating, rounded, shadowed | the default variant, flush |
| Header height | `--header-height` set on `SidebarProvider`, `h-(--header-height)` on the bar | our own topbar height |
| Content width | full width, gutters `px-4 lg:px-6` | `max-w-7xl mx-auto`, gutters `px-4 sm:px-8` |
| Responsiveness | container queries — `@container/main`, `@xl/main:grid-cols-2` | viewport breakpoints — `sm:`, `md:` |
| Content shape | `Card` grids, `CardDescription` above `CardTitle` | divided rows in a bordered box (`RowGroup`) |

So the components are the registry's and the **page architecture is ours**. That
is the honest answer to "is it fully ported": no, and no amount of adjusting our
own sizes closes it, because the difference is where the title lives and what a
list is — not how big the text is.

### The decision this needs

Adopting the block's architecture is a change to the product's information
architecture, not a restyle:

- The page title moves into the top bar at `text-base`. Breadcrumbs, subtitles,
  crests and per-page action rows — which `PageHeader` carries today on 13
  screens — have nowhere to go in that bar and would need re-homing.
- Lists become `Card` grids. A 20-row schedule read one-handed at courtside is
  the case `RowGroup` exists for; cards are taller per row.

That is why it has not been done unilaterally. It is worth doing — it is the
only way the preset decides the look instead of us — but it is the Product
Owner's call, and it is a bigger piece of work than everything above combined.

### Checks that encoded old decisions

The Product Owner: *a ton of the checks you do are based on old decisions too.*
True, and one has been fixed: the render tier asserted controls are ≥44px while
running Desktop Safari, which pinned a touch rule to a mouse and actively held
the preset's density out of the app. It now asserts the registry's floor on a
mouse and 44px in a `hasTouch` context.

Still to re-read in that light, none of them yet checked:
`MONO_ALLOWED` and `UPPERCASE_ALLOWED` in `styles.test.ts` (written for the
pre-shadcn stylesheet), the mobile-layout specs' pinned viewport expectations,
and the three JSX rules added today — which enforce **our** `RowGroup`, `Muted`
and heading ladder, and would need revisiting if the block's architecture is
adopted.

## Implemented — the shell, 2026-09-09

The Product Owner chose "shell now, lists stay dense". Done, `ed69a91` and
`348fee1`, on top of `431b19a` and `3f93e49`.

| Taken from `dashboard-01` | Where |
| --- | --- |
| `variant="inset"` sidebar — a floating, rounded, shadowed panel | `main.tsx`, `app-sidebar.tsx` |
| `--sidebar-width` and `--header-height` on `SidebarProvider` | `main.tsx` |
| The page's `h1` in the site header, `text-base font-medium`, after the trigger and a separator | `topbar.tsx` |
| `px-4 lg:px-6` gutters, full width, `@container/main` | `page.tsx` |
| Brand in the sidebar, user in its footer — followed below `sm` | `topbar.tsx`, `account.tsx` |

Kept deliberately, each with its reason beside the code: `RowGroup`'s divided
rows (courtside density, the Product Owner's choice), our own menu button (the
registry's `SidebarTrigger` ships an English label), 56px rather than 48px
header height (the mobile plan's number, with a check behind it), and 44px
controls under `pointer: coarse`.

### What the port actually changed, and what it cost

- The title moved out of the content, so `PageHeader` renders **nothing** when a
  page gives it only a title. Thirteen screens kept their API.
- It is drawn **once**. Rendering it in both the bar and the hero put the pages'
  own test ids in the document twice and 217 render checks resolved to two
  elements at once. Two specs that asserted an entity names itself in its hero
  now assert it names itself in the bar.
- `--font-heading` was restored earlier in the day: the preset defines it as
  `var(--font-sans)` and `ops ui theme` drops it by asking `only=theme`, so
  `card`, `alert-dialog`, `sheet` and `empty` were referencing a token that did
  not exist.

### Verified

934 unit/repository/Worker, 346 rendering, 49 browser checks, typecheck, lint.
Looked at through the Playwright MCP browser rather than the five-minute
screenshot walk: desktop discover, a team page, and 390px before and after the
header fix.

**Not verified by eye:** dark, Thai and Japanese at the new shell. The walk is
the tool for that and it was not re-run; the three `notifications` desktop
captures also hit the known WebKit stall recorded in the status index, which
followed the push-capability checks to their new page.

### Still open

- Lists are `RowGroup`, not the block's `Card` grids. That was the Product
  Owner's decision, not an omission; reversing it is now a small change.
- The checks named above as encoding old decisions have not all been re-read.
