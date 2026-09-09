# Plan — the top of the page on a phone

Archive: completed (2026-09-09). Delivered through the GUI conversion; subsequent shell changes belong to the active main-content plan.

Current work: [project index](../README.md). Original evidence follows.

Status: planned 2026-09-08; steps 1 to 4 **absorbed into B2 step 8** of
[readable type, then a design system](2026-09-08-01-typography-and-design-system.md)
the same day, with two changes of mechanics the Product Owner's step 8 chose:
the account chores went into a **DropdownMenu on the topbar avatar** (not nav
items in the sidebar), and the settings went into the sidebar's Settings
group. The old <!-- docs-check-ignore --> `components/sidebar.tsx` is gone — it
names the file this plan replaced, kept so the history reads; the shell is the registry's
Sidebar driven by `components/app-sidebar.tsx`, committed as `d2ae514`. The
overflow check (step 1) landed with it. The remaining steps (compact detail
headers, sticky tabs) are delivered by the page-chrome step of that plan under
the Product Owner's rule of 2026-09-08 — no reinvented wheels — with the
registry's Tabs and ButtonGroup, not sticky and scrolling rules of our own.
The Product Owner asked for it the same day: "on mobile it is totally
cluttered".

## What is wrong, from the captures

Read from the phone captures under `screenshots/mobile/` taken 2026-09-08 at
390 × 844, and from `components/topbar.tsx`, `components/account.tsx` and the
<!-- docs-check-ignore --> `components/sidebar.tsx` of that day — it names the
file step 8 replaced, so the history reads; its successor is
`components/app-sidebar.tsx`.

| Finding | Evidence | What it costs the reader |
| --- | --- | --- |
| Signed in, the topbar is two rows of pills | Row one: menu, TH / EN / JA, the spoiler eye. Row two: avatar, Install app, Devices, Sign out, and Admin for an admin. Five buttons that are account chores, on every page. | Chrome takes 110px before the page begins. |
| **Sign out is clipped off the screen for an admin** | `admin.en.png`: the row reads "Install app · Admin · Devices · Sign o". `.account-slot` is `flex-shrink: 0` and does not wrap, and `.main` clips overflow. | An admin on a phone cannot sign out. `tests/render/mobile-layout.spec.ts` measures `.page` only, so no check saw it. |
| Who you are is shown twice, acted on once | The drawer's bottom card shows the same name and role as the topbar and does nothing; the topbar carries the actions. | Two places say who you are; the one with room has no actions. |
| Settings pose as tasks | The language switch is three permanent buttons and the spoiler toggle an unlabelled eye, in the topbar on every page and every size. The live page also has its own labelled spoiler bar. | Two chrome-level settings occupy the most valuable row on the screen. |
| A detail page's header is most of the first screen | `schedule.th.png`: topbar, back link and status badge, title, meta line, four action buttons over two rows, the tab strip, then the division filter. Content begins about 545px down an 844px screen. | Nearly two-thirds of the first screen is heading before a single game is visible. |
| Nothing says which app this is on a phone | The brand lives in the sidebar, which is hidden on a phone. The topbar shows a menu button and buttons. | A shared link opens to chrome with no name on it. |

A stale note goes with this: `components/account.tsx` says the account control
lives in the topbar "because that is where it sits in the harness too". That
harness GUI moved into the SPA (ADR 020) and no longer exists; the constraint
is gone.

## Where things live afterwards

**One layout at every size.** Nothing is placed differently on a phone and on
a desktop. The only thing a phone does differently is what it already does:
under 768px the sidebar folds into a drawer that the menu button opens. Values
still scale (gutters, the title size), placement never changes. The Product
Owner asked for this on 2026-09-08 because two layouts are two things to keep
right, and the first draft of this plan had quietly added two.

The rule: **the topbar is identity, the sidebar is navigation, account and
settings.**

| Place | At every size |
| --- | --- |
| Topbar, one row, 56px | Menu button (rendered only while the sidebar is folded, as today) · brand mark and wordmark · spacer · Sign in, or the avatar with the name as a link to Profile. |
| Sidebar top | You: Home, Profile. Browse: Discover, Live now, Teams, Organisations. The brand moves up to the topbar, so the sidebar begins with navigation. |
| Sidebar bottom, account | The person: avatar, name, role, as a link to Profile. Under it as nav items: Devices, Admin when permitted, Install app when the browser says it can, Sign out. |
| Sidebar bottom, settings | Language as one segmented control. Spoiler as a labelled switch, "Spoiler mode". |
| Page header on a detail page | Back link or crumb line, title, one meta line, then the actions as **one row that never wraps and scrolls when it must**, with the edge fade the tab strip already uses. On a desktop it never needs to scroll, so it reads as it does now. |
| Tab strip on a detail page | **Sticky** at the top of `.page` while the header scrolls away. |
| Live page spoiler bar | Stays. It is the in-context control; the sidebar holds the setting. |

Not in this plan: the division filter row keeps its current rules, and status
pills, the banners above the page (pending approval, impersonation) and the
build stamp do not move.

## Steps

- [x] **Make the defect visible to a check.** Done in `d2ae514` with B2 step 8:
      "the topbar stays one row" in `tests/render/mobile-layout.spec.ts` holds
      every role at 320 and 390px to one row with every control inside the
      viewport, 14 checks, measuring after the stylesheet and
      `document.fonts.ready` have loaded. It failed on the admin's Sign out
      first, as this step predicted.
- [x] **Account into the sidebar — absorbed, with a change.** Done in `d2ae514`. B2 step 8 put
      the account chores in a DropdownMenu on the topbar avatar instead of
      nav items in the sidebar, and `components/account.tsx` shrank to the
      topbar's Sign in button or the avatar-and-name trigger, as planned.
      Test ids moved with the elements and
      are renamed for where they are (`account-…`, not `topbar-…`); the files
      to update are `tests/e2e/games.spec.ts`, `tests/e2e/identity-cache.spec.ts`,
      `tests/e2e/spa-login.spec.ts`, `tests/render/admin-reachable.spec.ts` and
      `tests/render/devices.spec.ts`. Proof: those suites pass, and the
      end-to-end sign-out journey still signs out.
- [x] **Settings into the sidebar.** Done in `d2ae514` by B2 step 8. The language switch and the spoiler switch
      move to a Settings group at the bottom of the sidebar; the eye leaves the
      topbar. New messages `settings` and `language` in all three locales;
      `spoiler_mode` and `menu` already exist. `tests/render/i18n.spec.ts` and
      `tests/render/geography.spec.ts` open the drawer on a phone before
      switching language, the way a reader does. Proof: those suites pass at
      both widths.
- [x] **One topbar.** Done in `d2ae514` by B2 step 8. Menu button while folded, brand, spacer, account. The
      brand leaves the top of the sidebar, so it is in one place at every
      size. Proof: the new check from step 1 passes for every role at 320 and
      390px, and the desktop captures show the brand once.
- [x] **Compact detail headers, one rule.** Done 2026-09-08 with step 11 of
      the design-system plan, as the registry's parts: the page frame in
      `components/page.tsx`, actions as one scrolling ButtonGroup, the event
      tabs as Tabs sticky at the top of the scroller. Checked in
      `tests/render/event-overview.spec.ts` at 390 × 844: the first game
      above 60% of the screen, the tab strip still in view after a 400px
      scroll. As planned: `.event-hero`, `.team-hero` and
      `.page-header` lose padding at phone widths (values, not placement);
      `.event-actions` becomes a row that never wraps and scrolls when it
      must, with the existing fade; `.detail-tabs` is sticky at the top of
      `.page`. All three rules apply at every width. Proof: a render check
      opens `#/event/evt_002` at 390 × 844 and asserts the first game row's
      top is above 60% of the viewport (505px), and that after scrolling 400px
      the tab strip is still within the viewport; the same page at 1440px
      shows every action without scrolling.
- [x] **Delete what moved.** Done 2026-09-08 with step 13: no topbar, hero
      or tab rule of ours remains, and the stale harness note in
      `components/account.tsx` is gone. As planned: the old topbar button rules, the two-row wrap
      rules, and the stale harness note in `components/account.tsx`. The
      dead-class rule in `tests/repo/styles.test.ts` fails if anything is left
      behind. Proof: that test passes.
- [x] **Gate and captures.** Done 2026-09-08 as the design-system plan's
      step 14: `bun run check` 898 + 334, e2e 49, 222 captures in light and
      dark; the phone captures for the admin, a coach and a visitor are under
      `screenshots/mobile/`. The Product Owner's look is theirs. As planned:
      `bun run check`, then
      `bun run shots -- --grep-invert 'devices.*desktop'`. Review the phone
      captures for the admin, a coach and a visitor on Discover, an event page
      and the sign-in page, in EN, TH and JA. Proof: counts in the log, and
      the Product Owner has seen the captures.

## Done when

A phone shows one topbar row with nothing clipped, for every role, at 320 and
390px, and a check says so. Every element at the top of the page is in the
same place at every size; the only phone-specific rule is the folded sidebar.
On the event page at 390 × 844 the first game is visible without scrolling,
and the tabs stay put while the header scrolls away. The gate and the
screenshot walk are green and the counts are below.

## Under shadcn (decided 2026-09-08)

The design-system gate chose shadcn the same day, and this plan's steps 1 to 4
were delivered by step 8 of that plan (`d2ae514`): the registry's Sidebar
(which becomes a Sheet under 768px by itself), a DropdownMenu on the avatar
for the account items, a ToggleGroup for the language and a Switch for the
spoiler in the sidebar's Settings group. What this plan decides — what is in
the sidebar, that the topbar is one row, that tabs stick and actions scroll —
does not change, and its step 1 check is the acceptance that shell step met.
Steps 5 to 7 (compact detail headers, deletion, gate) are delivered by that
plan's page-chrome step and its final gate, with the registry's Tabs and
ButtonGroup rather than sticky and scrolling rules of our own, on the Product
Owner's rule of 2026-09-08: no reinvented wheels, and their theme, not ours.

## Log

- 2026-09-08 — written from the day's phone captures and the three shell
  components. No application code was changed and no tests were run for this
  plan; the docs check was run after writing it.
- 2026-09-08 — revised the same day to one layout at every size, on the
  Product Owner's question. The first draft had a brand that appeared only
  on phones, an action row that scrolled only on phones, and an avatar that
  did different things by width. All three are now one rule each.
- 2026-09-08 — steps 1 to 4 done by B2 step 8 of the design-system plan and
  committed in `d2ae514`; boxes ticked here the same day. Steps 5 to 7 move
  to that plan's page-chrome step under the no-wheels rule.
