# Back navigation in the installed app

Status: proposed 2026-09-09. Planning only; application behavior is unchanged.

The user reports that installing through Add to Home Screen removes the browser
Back button. Every app screen must provide a usable route out without browser
chrome. Implement this once in the shared shell using our existing shadcn UI.

## Findings and the shadcn approach

- `src/web/vite.config.ts` sets `display: "standalone"` and `start_url: "/"`.
  Browser navigation controls cannot be assumed in that mode.
- `src/web/components/topbar.tsx` has menu, brand, page title and account, but
  no Back control. `src/web/lib/router.tsx` exposes route, goto and setParam;
  it listens to hashchange but has no application-owned history boundary.
- Navigation uses both ordinary hash links and goto. Tracking goto alone would
  miss links. Query changes also create history entries today.
- `src/web/components/page.tsx` already uses shadcn Breadcrumb. Those links
  express hierarchy; they cannot return to the exact previous filtered list.
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

Fallback parents: event → Discover; game → its event when known, otherwise
Live; watch/broadcast → game when a valid game ID is available, otherwise Live;
team/player → Teams; org → Orgs. All remaining non-home pages → Home.
Use only validated internal routes and available IDs. A known previous entry
takes priority over these parents. Reuse contextual route construction where
it already exists, without guessing relationships from missing data.

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
reachable at 320px: let brand text yield space before navigation or account
controls. Verify touch target spacing and focus visibility, including Thai.
Keep existing breadcrumb hierarchy and sidebar navigation.

## Implementation sequence

1. Extend the existing hash router with one shared navigation state and a
   back operation. Use namespaced history.state entry IDs plus a per-tab
   session record to prove a previous app entry exists. Preserve unrelated
   history.state fields. Handle hash links, goto, popstate/hashchange,
   replacement and forward-branch truncation without recording traversal as
   a new visit or counting both events twice. Do not patch browser APIs globally.
   Reconcile state on reload and locale remount. When state cannot be trusted
   or storage is unavailable, start a new boundary and offer the fallback.
   Never infer safety from history.length or document.referrer alone.
2. Add explicit replacement navigation. Fresh-entry fallback replaces the
   current entry so it cannot create a Back loop. Successful sign-in replaces
   its transient login entry; verify that Back cannot cycle through completed
   authentication. Preserve existing query-history behavior in this work:
   Back can undo filter/tab changes one entry at a time. Same-route navigation
   must not add duplicate entries. Protect against rapid double activation
   while a history traversal is pending.
3. Pass the navigation state from the existing useRouter instance in
   `src/web/main.tsx` into the shared shell; do not mount a second independent
   router inside Topbar. Add the registry-based control and translated copy.
   Keep fallback policy exhaustive over Page so newly added routes have an
   exit by construction. Loading/errors must have an immediate generic fallback
   while more specific parent data is unavailable.
4. Preserve the existing page scroll restoration and verify focus after Back.
   Dialogs and the mobile sidebar retain their accessible close controls and
   modal focus behavior. Do not introduce fake history entries for overlays.
   Audit routes with editing or broadcasting side effects: Back must use the
   same cleanup/leave behavior as other navigation and must not bypass an
   existing unsaved-change guard. Record and fix a demonstrated navigation
   cleanup defect as part of this work.
5. Add behavioral coverage, run the shared gates, then verify installed apps
   on actual phones. Update this plan and the docs index with evidence and any
   remaining device limitation. Completion requires both automation and the
   installed-device checks below.

Coordinate implementation with the ongoing header/main-content changes in
[the registry plan](2026-09-09-07-main-content-on-the-registry.md). At inspection,
Topbar, PageHeader and main.tsx had uncommitted edits from other work. Re-read
their final state before editing. This plan owns the missing navigation and
history boundary; it does not reopen the completed visual migration.

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
  Confirm Android system Back and iOS gestures still behave normally. Browser
  emulation alone is insufficient evidence for installed-app behavior.

The separate [iOS external-link requirement](2026-09-08-04-ios-installed-web-app-links.md)
remains separate: this fix provides navigation inside the window that opened.

## Planning validation

Inspected current source, package scripts and operations CLI help, and checked
the primary references above. No application implementation, deployment or
installed-phone validation has been performed for this plan.
