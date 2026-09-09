# Plan — main content on the registry, like the sidebar already is

Status: proposed 2026-09-09, nothing implemented.

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
  Nothing implemented; stage 1 needs their decision before stage 2 starts.
