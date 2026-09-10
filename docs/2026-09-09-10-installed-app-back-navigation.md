# Back navigation in the installed app

Status: proposed 2026-09-09, scope corrected 2026-09-10. Planning only;
application behavior is unchanged.

The user reports that installing through Add to Home Screen removes the browser
Back button. Every app screen must provide a usable route out without browser
chrome. Implement this once in the shared shell using our existing shadcn UI.

## Which surfaces lose what — corrected 2026-09-10

This was scoped as a phone problem. It is not. The product ships to Android,
iOS, Windows and Mac, as a web install today and as a Tauri app for **Windows
and Mac** when that ships (`src-tauri/tauri.conf.json` targets `app` and `dmg`
today, so Windows targets are added with it).

| Surface | Hierarchy (crumbs, ≥`sm`) | Platform back | Net |
| --- | --- | --- | --- |
| Browser tab, any OS | yes | yes — browser button | fine |
| Installed web app, **Android** phone | **no** — folded below `sm` | yes — system back | degraded |
| Installed web app, **iOS** phone | **no** — folded below `sm` | **no** — edge-swipe only, undiscoverable, fights horizontal scrollers | **nothing** |
| Installed web app, **Windows / Mac** | yes | `Alt+←` / `Cmd+[`, no visible control | hierarchy only |
| **Tauri, Mac and Windows** | yes | **no** — no chrome, no system back | **hierarchy only** |

**So there are two failures, not one, and the second is the larger.**

1. **Phones lose hierarchy.** `BreadcrumbItem` carries `hidden … sm:inline-flex`,
   so on a 390px phone the ancestors are not rendered at all.
2. **Every installed surface loses *return*.** The `from=` trail has no control
   at any width on any surface. Crumbs cannot stand in: they lead to a team's
   *parent*, never back to the filtered schedule the reader actually came from.
   This includes the 1280px Tauri window, where the screen is large and the
   information is still unreachable.

The control therefore belongs at **every width on every installed surface**, not
behind a phone breakpoint. `isNativeApp()` in `src/web/lib/push.ts` already
distinguishes Tauri, and the app already knows when it is installed.

**And we cause it.** The app ships `<pwa-install>` and actively prompts —
"This site has app functionality. Add it to your Dock" — so we invite readers
into the mode that removes their Back button and then render no replacement.

### Two things considered and rejected

- **`display: "minimal-ui"`** keeps platform back/forward chrome. It would help
  Android, Windows and Mac — which already have a working back — and does
  nothing for iOS, which has never honoured it, or for Tauri, which has no
  browser chrome to keep. It fixes the rows that are not broken. Noted here so
  it is not proposed again. (`display: "standalone"` in `src/web/vite.config.ts`
  carries no comment, unlike `id`, `start_url` and `theme_color` around it, so
  it currently reads as a default rather than a decision; whichever value
  survives should say why.)
- **`history.back()`** as the control's action. The app pushes history entries
  for tabs and filters, so it frequently undoes a filter instead of leaving the
  page. That is precisely why `from=` exists in `routeHref`, where it already
  survives same-page tab and filter changes and trims at `MAX_TRAIL`.

### The registry has already solved the first failure

`breadcrumb-responsive` is in the shadcn registry and is the sanctioned answer
to crumbs that do not fit: it **collapses** ancestors behind an ellipsis into a
Dropdown on desktop and a Drawer on mobile, rather than hiding them. Our
`hidden sm:` is the deviation. Adopt it for the hierarchy half — composing the
`sheet` we already have rather than adding `drawer` for one control — and keep
this plan's own work for the return half, which no registry item can supply
because it is application state.

## Findings and the shadcn approach

- `src/web/vite.config.ts` sets `display: "standalone"` and `start_url: "/"`.
  Browser navigation controls cannot be assumed in that mode.
- `src/web/components/topbar.tsx` has menu, brand, page title and account, but
  no Back control. `src/web/lib/router.tsx` exposes route, goto and setParam;
  it listens to hashchange but has no application-owned history boundary.
- Navigation uses both ordinary hash links and goto. Tracking goto alone would
  miss links. Query changes also create history entries today.
- The header already draws parent links, and not from the file this plan first
  named. `PageHeader` in `src/web/components/page.tsx` puts the trail in a
  context; `src/web/components/topbar.tsx` renders it as the registry Breadcrumb
  beside the title and folds the ancestors away below `sm` — so on the phone
  this is about, the hierarchy links are not on screen at all. (`page.tsx` also
  still exports a `Crumbs` nothing renders: the registry plan's leftover, named
  here so it is not lost, not this plan's to fix.) Those links express
  hierarchy; they cannot return to the exact previous filtered list.
- The crumb ladder is already this app's parent table, and
  `tests/repo/navigation.test.ts` holds it — crumbs are the ancestors, each one
  linked. The pages write it today: event → Discover, game → its event (with the
  division tab), watch/broadcast → game, team and player → Teams, org → Orgs.
  A second table restating it is the list that drifts.
- Three not-found screens already carry an escape link, and none of them follows
  the rules below. `m.back_to_discover()` is "← Back to discover": a parent link
  labelled Back, with the arrow inside the translated string, rendered as a bare
  `<a>` rather than through ButtonLink (`src/web/pages/event.tsx`,
  `src/web/pages/team.tsx`). `src/web/pages/game.tsx` offers Live the same way.
  Team's points at Discover although a team's parent is Teams. The shell's
  control replaces all three; that is part of this work, not a leftover.
- `components.json` selects base-nova, Base UI and Lucide. Compose the existing
  Button and ArrowLeftIcon in the shell. Keep registry files untouched and use
  their variants, sizes, focus treatment and theme. Routing behavior belongs
  in the router; shadcn's Button does not supply a PWA history policy.

Primary references checked 2026-09-09:
[shadcn Base UI Button](https://ui.shadcn.com/docs/components/base/button),
[shadcn Breadcrumb](https://ui.shadcn.com/docs/components/base/breadcrumb),
[MDN standalone apps](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Create_a_standalone_app),
[MDN history length](https://developer.mozilla.org/en-US/docs/Web/API/History/length).
History length counts session entries; it does not establish that the previous
entry belongs to this app. The safe-back policy below is our application design.

## Behavior to implement

| Situation | Control and result |
| --- | --- |
| A known previous app entry exists | Back returns to that entry, including query state and saved list scroll. |
| Fresh entry on a detail page | A named parent link provides a deterministic exit. |
| Fresh entry on another non-home page | Home link returns to the app root. |
| Home with no previous app entry | No Back control; keep the menu available. |
| Home reached from another app page | Back remains available to return to that page. |
| Loading, missing record, forbidden or unknown route | The shell still provides Back or Home; it must not wait for successful data loading. |

The fallback parent is the last linked crumb the page has registered. That
ladder is built by the page, which is the only thing holding the ids, and it is
already checked; do not restate it as a second table. Crumbs arrive in an effect
and are absent while a page loads, fails or renders a missing record, so a
static per-`Page` backstop covers that moment and nothing else: event →
Discover; game, watch and broadcast → Live; team and player → Teams;
org → Orgs; every other non-home page → Home. Those are the destinations the
existing not-found states already offer, apart from team's, which is wrong
today and becomes Teams. Use only validated internal routes and available ids.
A known previous entry takes priority over both.

Show the control in ordinary browser tabs and installed windows at every size.
Installation detection must not determine whether a user can navigate.
Use a real Button for history Back and a real anchor styled with the existing
buttonVariants/ButtonLink convention for a named parent or Home destination.
Do not label a parent destination as though it were browser history Back.

Put navigation beside the menu in the existing persistent header. Preserve the
56px row and the one page title. Use the registry ghost/icon variant for Back
on narrow screens with a translated accessible name, decorative arrow and a
translated tooltip for pointer/keyboard users; expose visible text where space
permits. Named fallback links need translated destination labels. Keep controls
reachable at 320px, and measure the row that actually renders there: the brand's
words are already `hidden sm:block` and the crumb ancestors fold away at the
same width, so 320px is menu, mark, `h1` and account. The title truncates; the
new control must not. Home without a previous entry draws no control, so decide
and record whether the row reserves that space or is allowed to shift when it
appears. Verify touch target spacing and focus visibility, including Thai.
Keep existing breadcrumb hierarchy and sidebar navigation.

## Implementation sequence

1. **Use the return trail that already exists. Do not build a history boundary.**
   This step used to specify namespaced `history.state` entry IDs, a per-tab
   session record, forward-branch truncation and reload reconciliation — roughly
   a hundred and fifty lines of the fiddliest code in any front end, to answer
   one question: *is there a previous app screen?*

   `routeHref` already answers it. `from=` **nests** — `ancestorsOf` walks it and
   `MAX_TRAIL` caps it at four — so it is a full return stack, not one level, and
   it survives things `history.state` cannot:

   | | `from=` trail | a `history.state` boundary |
   | --- | --- | --- |
   | Multi-level back | yes, capped at 4 | yes |
   | Survives reload | **yes — it is in the URL** | no |
   | Survives a shared link | **yes** | no |
   | Survives a cold launch from a notification | **yes** | no |
   | Code to write | **none; it exists** | ~150 lines |

   For an installed app that is cold-launched from a notification — which is
   this product — URL-carried state is not a workaround, it is the better
   design. So the control reads `ancestorsOf(route)`, takes the last entry, and
   falls back to the page's parent when the trail is empty.

   **The divergence from the browser's own Back is deliberate and is not a gap.**
   Browser Back undoes one filter or tab change at a time; the shell's control
   returns to the previous *screen*. Both are correct for what they are, and
   step 2 records why.

2. Add explicit replacement navigation. Fresh-entry fallback replaces the
   current entry so it cannot create a Back loop. Successful sign-in replaces
   its transient login entry; verify that Back cannot cycle through completed
   authentication. `setParam` keeps writing an entry per filter or tab change,
   and the browser's own Back keeps undoing them one at a time — that stays.
   The shell's control does not: it returns to the previous *screen*, stepping
   over consecutive same-route query-only entries, because a Back button that
   changes one chip on the page you are already looking at reads as a control
   that did nothing. Native Back remains native. Same-route navigation must not
   add duplicate entries. Protect against rapid double activation
   while a history traversal is pending.
3. Pass the navigation state from the existing useRouter instance in
   `src/web/main.tsx` into the shared shell; do not mount a second independent
   router inside Topbar. Add the registry-based control and translated copy.
   Keep the backstop exhaustive over `Page` so newly added routes have an exit
   by construction, and hold that in `tests/repo/navigation.test.ts`, which
   already owns the crumb rule — a page with no way out should fail the repo
   tier, not be found on a phone. Loading/errors must have an immediate generic
   fallback while more specific parent data is unavailable.
4. Preserve the existing page scroll restoration and verify focus after Back.
   Dialogs and the mobile sidebar retain their accessible close controls and
   modal focus behavior. Do not introduce fake history entries for overlays.
   Audit routes with editing or broadcasting side effects: Back must leave a
   page exactly the way every other navigation does. Two facts read from the
   tree on 2026-09-09, so nobody re-derives them: `src/web/pages/video.tsx`
   holds no effect and no teardown of its own — the MoQ custom elements unmount
   with it — and nothing under `src/web` registers a `beforeunload` or any
   unsaved-change guard. So there is no known cleanup defect to fix and no guard
   to bypass. If the audit finds one, record it here and fix it; if it finds
   none, write that down and move on.
5. Add behavioral coverage, run the shared gates, then verify installed apps
   on actual phones. Update this plan and the docs index with evidence and any
   remaining device limitation. Completion requires both automation and the
   installed-device checks below.

## Deferred, and deliberately not folded in: this app has no router library

Recorded here because this plan is where it surfaced, and losing it would mean
re-deriving it. **`src/web/lib/router.tsx` is 315 hand-written lines and there is
no routing dependency at all**, in an application that already depends on
`@tanstack/react-query`. TanStack Router is the obvious sibling and would supply,
as library code rather than ours: keyed history entries and `canGoBack()`, typed
search parameters, and scroll restoration — all of which exist here by hand.

The first draft of step 1 above was this repository reinventing that wheel one
layer deeper. It is cut, and the *feature* no longer needs it.

**Adopting a router is a separate decision and a separate plan**, for reasons
that are about risk rather than merit:

- It touches every route, every link and every navigation test in a live
  application serving twenty-seven locales.
- The trigger would be a routing need, not a button. Swapping the router to add
  a Back control is the scope creep that goes wrong.
- It is a Product Owner call. The current router works, is tested, and its
  `from=` design is genuinely well suited to an installed app.

What would justify opening it: typed search parameters becoming a real need,
route-level code splitting, or a second hand-rolled history mechanism appearing.
Any of those, and this stops being a preference.

Coordinate implementation with the ongoing header/main-content changes in
[the registry plan](done/2026-09-09-07-main-content-on-the-registry.md). The edits
that were uncommitted when this plan was written are committed and the tree is
clean, but that plan still reads *proposed, nothing implemented*, and the status
index was corrected on 2026-09-09 for claiming the shadcn conversion was
finished — so this plan does not call it complete either. Re-read Topbar,
PageHeader and main.tsx before editing. This plan owns the missing navigation
and history boundary and nothing about the visual migration.

## Acceptance and verification

- Unit coverage: safe boundary; every Page's fallback; push/replace/back/forward;
  duplicate routes; unknown state; reload; forward branch discarded after a
  new navigation; sign-in replacement; unavailable session storage.
- Browser coverage: filtered Discover → Event → Game → Back → Back restores
  filters and scroll; ordinary anchor and goto journeys behave identically;
  browser Back/Forward interleaved with app Back; locale remount; repeated
  clicks; fresh deep link/reload; deleted record; sign-in and sign-out.
- Include a browser-tab entry from outside the app. The app control must offer
  a safe internal fallback when no previous app entry is proven, even when
  history.length is greater than one. Native browser Back remains native.
- Rendering coverage: header at 320px, 375px and desktop; English/Thai;
  light/dark; signed in/out; long titles; keyboard labels, focus and no overflow.
  Cover Back and fallback states, not just a fresh Home screenshot.
- Run `bun run ops ui check`, `bun run check`, then `bun run test:e2e` using
  the documented automation. Browser runs remain sequential and isolated
  from the user's dev server. If extra test setup is needed, put it in that
  shared workflow with cleanup, not in a private harness.
- Real iPhone A2HS and Android installed app: cold launch, multi-page Back,
  relaunch, notification entry where available, rotation and safe areas.
- **Every surface the product ships to, because they fail differently.** A
  browser tab proves nothing about the installed cases, and a phone proves
  nothing about Tauri:
  | Surface | What only this surface proves |
  | --- | --- |
  | iOS, Add to Home Screen | The one case with no platform back at all. If the control is wrong here, the reader is stuck with the sidebar. |
  | Android, installed | The app's Back and the system's Back interleaved — the app must not fight the platform's. |
  | Windows / Mac, installed web app | Hierarchy is visible here, so this proves the *return* control is distinguishable from a crumb rather than a duplicate of it. |
  | **Tauri, Mac** | A 1280px window with no chrome and no system back — the case that shows this is not a small-screen feature. |
  | **Tauri, Windows** | The same, on the platform whose bundle targets do not exist yet; add them with the Tauri release rather than discovering this then. |
  These are checks a person runs on real hardware. No browser tier reaches an
  installed app or a Tauri window, and saying so is part of the plan rather
  than a gap to be discovered at acceptance.
  Confirm Android system Back and iOS gestures still behave normally. Browser
  emulation alone is insufficient evidence for installed-app behavior.
- The Tauri shells have this problem more completely than an installed PWA
  does — `src/web/lib/router.tsx` says the hash routing exists for that webview,
  and a desktop window has no browser chrome at all. The control is
  unconditional, so they get it without extra work; prove that with one
  `bun run ops tauri dev` pass, and confirm the same for `ops tauri ios-dev`
  or record that the iOS target was not exercised.

The separate [iOS external-link requirement](2026-09-08-04-ios-installed-web-app-links.md)
remains separate: this fix provides navigation inside the window that opened.

## Planning validation

Inspected current source, package scripts and operations CLI help, and checked
the primary references above. No application implementation, deployment or
installed-phone validation has been performed for this plan.

Reviewed against the tree 2026-09-09. What held: the manifest is `standalone`
with `start_url: "/"` (`src/web/vite.config.ts`); Topbar has no Back and takes
no props; `useRouter` is called once, in `src/web/main.tsx`; `goto` only ever
pushes, so Back does cycle through a completed sign-in; `bun run ops ui check`
exists (`scripts/ops/ui.ts`); English and Thai are the offered locales, `ja`
being a declared draft. What was corrected: the crumb trail renders in
`topbar.tsx`, not `page.tsx`; the fallback parents were a second copy of the
crumb ladder and are now derived from it; the 320px note described brand text
that is already hidden at that width; the ordered acceptance item to fix a
navigation cleanup defect named no defect and none was found. What was added:
the entry-stamping mechanism, the query-only Back decision, the three existing
not-found escape links, the repo-tier check, and the Tauri shells.
