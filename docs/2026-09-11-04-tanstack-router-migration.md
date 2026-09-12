# Task — Migrate to TanStack Router and unify routing with TanStack Query

**File:** `2026-09-11-04-tanstack-router-migration.md` — refer to this plan by that name.

**Repo:** `joeblew999/remy-sport`
**Depends on:** `2026-09-11-03-notifications-unification.md` Part D4 (the `route.ts` / `router.tsx` split and `cta.route` as a `Route` object). Ship that first; this task must not change any notification content builder, queue message, or Durable Object.
**Sequencing:** one PR, all pages at once. No page-by-page migration — two routers in one app is the state the current `router.tsx` header warns against.

## Principle

**One route tree is the source of truth for pages, params, search params, data loading, layouts, and code splitting.** Nothing declares a page, parses a param, or prefetches data outside it. A page that doesn't exist, a param with the wrong type, or a search key nobody handles is a compile error.

## Current state (what is being replaced)

| Concern | Where it lives today |
|---|---|
| Page list | `PAGES` const union in `src/web/lib/router.tsx` (21 pages) |
| Route shape | `{ page: Page; id?: string; query?: Record<string, string> }` — `id` is untyped, `query` is stringly |
| Rendering | `renderPage: Record<Page, () => ReactNode>` in `src/web/main.tsx` |
| Navigation | `goto`, `setParam`, `query`, `spoiler` threaded as props into every page (12 `goto` sites in `main.tsx` alone) |
| Data | 24 `use*` hooks in `src/web/lib/data.tsx` over `createTanstackQueryUtils(api)` from `@orpc/tanstack-query` |
| Prefetching | none — `prefetchQuery` / `ensureQueryData` appear nowhere, despite the decided list-to-detail prefetch pattern |
| Code splitting | hand-rolled `lazily()` in `main.tsx` for `broadcast` and `watch` only |
| Hash routing | `#/` everywhere, justified by biz ADR 003 ("required for Tauri"). **Stale**: Tauri has fallen back to `index.html` for unknown paths since 1.0.0-beta.2 (June 2021), so history-mode routing works in the webview. The hash was a workaround for a problem that no longer exists. |
| Sign-in redirect | `?next=#/...` parsed by hand in the `login` branch |
| Deep links from notifications | `Route` objects rendered by `routeHref` (after D4) |

---

## Part A — Route tree

### A1. File-based routes with the Vite plugin

Add `@tanstack/react-router` and `@tanstack/router-plugin` (Vite). Routes live in `src/web/routes/`, generated `routeTree.gen.ts` is committed. **Browser history** (`createBrowserHistory()`, the default) — the hash goes. Biz ADR 003 is superseded; write the one-paragraph reason in `__root.tsx` and open a PR against `remy-sport-biz` marking the ADR superseded.

Map every page in `PAGES` to a route file. Paths are clean and plural (`/events/<id>`, `/games/<id>`), matching the API. There are no production users, so no `#/` redirect shim — but the Worker must return the shell for `/#/...` legacy hashes gracefully (it will: the hash never reaches the server), and the root route should read `location.hash` once on first load and `navigate()` to the equivalent clean path so any old link in a test fixture or QR code still lands.

```
__root.tsx                     app chrome, sidebar, QueryClientProvider, error + pending boundaries
index.tsx                      home
discover.tsx
events/$eventId.tsx            event layout: header, tabs, venue timezone in context
events/$eventId/index.tsx      schedule (default tab)
events/$eventId/standings.tsx
events/$eventId/sessions.tsx
events/$eventId/settings.tsx
games/$gameId.tsx
live.tsx
teams/index.tsx
teams/$teamId.tsx
players/$playerId.tsx
orgs/index.tsx
orgs/$orgId.tsx
meetings/index.tsx
meetings/$meetingId.tsx
profile.tsx
devices.tsx
notifications.tsx
admin.tsx
login.tsx
broadcast/$gameId.tsx          lazy
watch/$gameId.tsx              lazy
meeting-test.tsx               dev-only; gated by `POLICY[env].devSessionRoutes` in beforeLoad
```

`not-found` becomes the root `notFoundComponent`, not a page.

### A2. Server serves the shell for every app path

Already done by `server-routing-unification.md` Part C: the fetch handler tries `ASSETS.fetch` and returns the shell on a 404 `GET`. Nothing to do here except add the `smoke` check (Part E): `GET /events/anything` returns the shell with a 200.

### A3. Delete the hand-rolled router

Remove `PAGES`, `Page`, `Route`, `parseRoute`, `routeHref`, `ancestorsOf`, `useRouter`, `signInRoute`, `ROUTES` from `src/web/lib/router.tsx` / `route.ts`. Delete `renderPage` from `main.tsx`. Delete `lazily()`.

The tests that walk `ROUTES` (`tests/**/route-walk*`, `ops-help`, `browser-cli` — grep for `ROUTES`) switch to iterating the generated route tree.

### A4. Typed params and search

- Every `$param` is a string id; routes that need it to exist use `beforeLoad` to `throw notFound()` rather than rendering an empty pane.
- Search params are validated with Zod via `validateSearch`, using schemas from `src/domain/` where one exists (e.g. `spoiler: z.boolean().default(false)`, `tab`, `next`). `route.query` as `Record<string, string>` is gone; a search key nobody declared is a type error at the `Link`.
- `spoilerMode` moves from a `useState` in `main.tsx` to a search param on the routes that use it, so it survives reload and is shareable.

---

## Part B — Unify with TanStack Query

### B1. Loaders own data, hooks own rendering

For each of the 24 `use*` hooks in `data.tsx`, the route that renders it gets a `loader` that calls `queryClient.ensureQueryData(orpc.<proc>.queryOptions(...))`. The hook stays for the component (`useSuspenseQuery` with the same options) so rendering is unchanged; the loader guarantees the cache is warm before the component mounts.

`queryClient` reaches loaders through `createRouter({ context: { queryClient } })` — no module-level singleton import into route files.

### B2. Prefetch on intent — the decided pattern, finally implemented

`defaultPreload: 'intent'` on the router, `defaultPreloadStaleTime: 0` so TanStack Query's own `staleTime` governs. Every `<Link>` from a list to a detail (events → event, event → game, game → team, teams → team, orgs → org, meetings → meeting) now prefetches on hover/touchstart with no per-link code. Delete any manual prefetch that gets written between now and then.

### B3. Invalidation stays where it is

Mutations already invalidate with `orpc.<proc>.key()`. Do not move invalidation into the router; loaders read the cache, mutations write it. `router.invalidate()` is only for `beforeLoad` results (auth, policy), never for data.

### B4. Pending and error boundaries per route

Replace the app-wide `<Loading />` with `pendingComponent` on routes that load, and `errorComponent` with the existing `report.ts` capture wired in. `defaultPendingMs: 200` so fast loads don't flash.

### B5. Auth in `beforeLoad`, not in pages

`authedRoute` equivalents on the client: a `beforeLoad` on the routes that need a session reads the session from the query cache (`orpc.session.queryOptions()`), and `throw redirect({ to: '/login', search: { next: location.href } })`. The `login` route's `next` is a validated search param, not a hand-parsed `#/` string. Delete `signInRoute`.

---

## Part C — Notifications and Tauri stay unchanged

### C1. The D4 boundary

`NotificationContent.cta.route` is `{ page, id, query }`. Replace the body of `routeHref` (server side, in `route.ts`) with a lookup from `page` to the TanStack path pattern — a 21-line table — so the Worker and `native-notify.ts` keep producing correct hash URLs without importing the router. No content builder, queue message, DO, or `notification.tsx` changes. `tests/repo/notifications.test.ts` gains one case: every `page` the content builders emit resolves to a real route in `routeTree.gen.ts`.

### C2. Every place that assumes `#/`

All of these change from hash to path in this PR — grep for `#/`, `location.hash`, `hashchange`:

- `routeHref` in `route.ts` — emits `/events/<id>` not `#/event/<id>`; still the only place a URL is built for notifications and native.
- `sw.ts` `notificationclick` and `lib/notification-url.ts` — `openWindow(path)` and `client.navigate(path)`; the comment about `/sw.js#/games/abc` is deleted with the bug it described.
- `native-notify.ts` `listenForTaps` — `router.navigate({ to })` via a small bridge, not `location.hash = …`.
- `lib/report.ts` `routeShape` — reads `location.pathname`, not `location.hash`.
- `lib/calendar.ts` `url` and every email `url` in the content builders — `${origin}${routeHref(route)}` already; only `routeHref` changes.
- `login` `?next=` — becomes a validated search param carrying a path, not a `#/` string.
- `pwa-assets.config.ts` / manifest `start_url` and `scope` — confirm they are `/`, not `/#/`.
- `src-tauri/tauri.conf.json` — no change needed; confirm `frontendDist` points at `dist/client` and nothing sets a hash in the window URL.
- Playwright configs and `scripts/ops/screenshots.ts` — page URLs drop the `#`.

Verify with `test:render` and one manual tap on a push notification in the Tauri build, because that is the path Playwright cannot drive.

### C3. Deferred deep links

Out of scope. First-launch route recovery in the Tauri build is the plugin work in the ZipQuantum issue; when it lands it assigns `location.hash`, which this router handles like any other.

---

## Part D — Type safety

- `routeTree.gen.ts` is committed and `bun run check` fails if it is stale (`tsr generate --check` or equivalent).
- Every `<Link to>` and `navigate({ to })` is a literal from the tree; a renamed route breaks every link at compile time.
- `validateSearch` schemas are the only place a search key is declared; `useSearch({ from })` is typed from them.
- `loader` return types flow to `useLoaderData({ from })`; no `as` casts in pages.
- `knip` (already in `bun run lint`) must report zero unused exports after the old router is deleted — anything it flags is a call site that was missed.

---

## Part E — `bun run ops` and checks

- `ops ui` / screenshots (`scripts/ops/screenshots.ts`, `ui.ts`) enumerate pages; switch them to the generated tree.
- `smoke` "the SPA is served" adds: every route in the tree returns the shell (a `HEAD` per path is enough — the point is a route that 404s at the asset layer).
- `coverage-gui.ts` (`check:model`) maps model actions to GUI surfaces; update it to key on route ids.
- `test:render` (Playwright render config) is the acceptance test for this task: every page must render the same before and after, screenshots diffed.

---

## Constraints

- Browser history from day one. Hash routing is not kept as a fallback; ADR 003 is superseded, not amended.
- One PR. All 21 pages. The old router is deleted in the same PR, not deprecated.
- No change to oRPC procedures, Drizzle schema, or any `src/api` file except where a client type import moves.
- No ADR — the `__root.tsx` header carries the same explanation the old `router.tsx` header did: what went wrong with three route lists, and why the tree is now the only one.
- New dependencies: `@tanstack/react-router`, `@tanstack/router-plugin`, `@tanstack/router-devtools` (dev only). Nothing else.

## Delivery order

1. `route.ts` / `router.tsx` split and D4 from the notifications task are merged. Confirm `routeHref` is the only place a hash URL is built outside the router.
2. Confirm the server spec has shipped (shell for every path); `smoke` proves it on dev. Then add the plugin and the route tree with **stub** components that render the existing pages unchanged, browser history, old router still mounted behind a flag. `test:render` green.
3. Swap `main.tsx` to `<RouterProvider>`; delete `renderPage`, `lazily`, prop threading. Pages read params/search/loader data via hooks. `test:render` green.
4. Loaders + `preload: 'intent'` + boundaries (Part B). `test:render` green; verify prefetch in devtools on one list → detail path.
5. `beforeLoad` auth and policy gating (B5, `meeting-test`). Delete the old router files. `knip` zero, `bun run check` green.
6. Part E updates; `ops smoke --env staging`.

## Decisions (made, Sep 2026)

- TanStack Router adopted for the whole client, in one PR, after notifications unification.
- Browser history. `createHashHistory` was a workaround for a Tauri limitation fixed in 2021; biz ADR 003 to be marked superseded.
- Clean plural paths (`/events/<id>`), matching the API. No `#/` compatibility shim beyond a one-time hash-to-path bounce on first load.
- Loaders warm the TanStack Query cache; hooks render from it; mutations invalidate by `orpc.*.key()` as today.
- Prefetch-on-intent is router-level, not per-link.
- `spoilerMode` becomes a search param.
- Notifications' `cta.route` shape is frozen; only `routeHref`'s body changes.
- Deferred deep links stay in the Tauri plugin issue.

## Open

- None blocking. The ADR 003 supersession PR in `remy-sport-biz` is Remy's to merge but does not gate this work.