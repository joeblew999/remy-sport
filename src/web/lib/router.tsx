// Hash-based router. Hash routes are required for Tauri webview compatibility
// (per ADR 003 in the biz repo). Production may swap to TanStack Router with
// hash-history mode without changing call-sites.

import { useEffect, useState } from "react";

/**
 * Every page, once. This is the list; nothing else may declare one.
 *
 * There were three, and they disagreed. `parseHash` accepted any string as a
 * page, `main.tsx` was sixteen hand-written `route.page === "x"` branches, and
 * `ROUTES` below was a third array maintained for the tests. Nothing tied them
 * together, so the app shipped with `my-events` listed in ROUTES and rendered
 * by nothing: `#/my-events` was a blank pane inside the chrome. `#roster`, or
 * any typo, did the same — the branches all missed and the page rendered
 * nothing at all, with no error anywhere.
 *
 * The route-walking spec did not catch it because it asserts `#root` is
 * non-empty, and the sidebar is always there.
 *
 * With `Page` as a union, an unknown page is a compile error rather than an
 * empty screen, `renderPage` in main.tsx is a `Record<Page, …>` so a page with
 * no screen will not build, and ROUTES is derived rather than restated.
 */
export const PAGES = [
  "home",
  "discover",
  "event",
  "game",
  "live",
  "team",
  "teams",
  "player",
  "profile",
  "login",
  "devices",
  "admin",
  "orgs",
  "org",
  "broadcast",
  "watch",
  "not-found",
] as const;

export type Page = (typeof PAGES)[number];

const isPage = (s: string): s is Page => (PAGES as readonly string[]).includes(s);

export interface Route {
  page: Page;
  id?: string;
  /**
   * Everything after `?`, for state that belongs in the address bar.
   *
   * Discover's filters live here rather than in `useState`, for two reasons and
   * the first one is a bug. `main.tsx` renders `<App key={locale}>` so that a
   * language switch re-evaluates Paraglide's messages, which are plain
   * functions nothing subscribes to. Keying remounts the tree — and remounting
   * resets every `useState` in it. Choosing a province, then switching to Thai,
   * silently cleared the filter and the selected tab and put every event back
   * on the page. The chips looked untouched.
   *
   * The second reason is the one worth having anyway: a filtered view is a
   * thing people send each other. "Everything in Chiang Mai this month" was not
   * a link, and now it is.
   */
  query?: Record<string, string>;
}

export function parseRoute(hash: string): Route {
  const raw = (hash || "").replace(/^#\/?/, "");
  const [path, search] = raw.split("?");
  const query: Record<string, string> = {};
  if (search) {
    for (const [key, value] of new URLSearchParams(search)) query[key] = value;
  }
  const parts = (path ?? "").split("/").filter(Boolean);
  if (parts[0] === "games") parts[0] = "game";
  // An unrecognised page is "not-found", never itself. This is the line that
  // turned `#roster` into a blank pane: it used to take `parts[0]` on trust.
  // The root is Home — what is yours when signed in, Discover for a visitor.
  const page: Page = parts.length === 0 ? "home" : isPage(parts[0]!) ? (parts[0] as Page) : "not-found";
  const base: Route = parts[1] ? { page, id: parts[1] } : { page };
  return Object.keys(query).length ? { ...base, query } : base;
}

export function routeHref(route: Route): string {
  // Empty values are dropped rather than written as `province=`: an unset
  // filter should leave no trace in a link somebody is about to send.
  const entries = Object.entries(route.query ?? {}).filter(([, v]) => v !== "");
  const search = entries.length ? `?${new URLSearchParams(entries)}` : "";
  if (!route || !route.page || route.page === "home") return `#/${search}`;
  if (route.id) return `#/${route.page}/${route.id}${search}`;
  return `#/${route.page}${search}`;
}

/**
 * Every route the app serves, as a hash a test can navigate to.
 *
 * Exported so `tests/render/no-backend.spec.ts` cannot fall behind the app: a
 * page added here is covered the day it becomes routable, rather than the day
 * somebody remembers to list it in a spec. The ids are seeded fixtures — the
 * detail pages have to render *something* to be worth visiting.
 *
 * Kept beside the router rather than in the test because it is a fact about the
 * app, and because a second list in a test file is the thing that drifts.
 */
/**
 * Derived from PAGES, not restated beside it.
 *
 * This was a hand-written array and it had drifted: it listed `#/my-events`,
 * which no branch in main.tsx rendered, so the spec walked to a blank page and
 * passed. A list maintained next to the thing it describes is a list that will
 * disagree with it.
 *
 * The ids are seeded fixtures — a detail page has to render something to be
 * worth visiting. `not-found` is excluded because it is the answer to an
 * unroutable hash rather than a destination.
 */
const DETAIL_IDS: Partial<Record<Page, string>> = {
  event: "evt_001",
  game: "gam_002",
  org: "org_001",
  team: "team_001",
  player: "ply_001",
  broadcast: "gam_002",
  watch: "gam_002",
};

export const ROUTES: readonly string[] = [
  "/",
  ...PAGES.filter((p) => p !== "home" && p !== "not-found").map((p) =>
    DETAIL_IDS[p] ? `#/${p}/${DETAIL_IDS[p]}` : `#/${p}`,
  ),
]

export interface RouterAPI {
  route: Route;
  goto: (r: Route) => void;
  /**
   * Change one query parameter, staying on this page.
   *
   * Separate from `goto` because a filter is not navigation: it must not scroll
   * the page back to the top, which is what `goto` does and what a reader
   * halfway down a list of events does not want.
   */
  setParam: (key: string, value: string | null) => void;
}

const scrollPositions = new Map<string, number>();

export function useRouter(): RouterAPI {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onHashChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Store the actual scroll container, not window.scrollY. Retain positions
  // across locale remounts and restore after asynchronous content arrives.
  useEffect(() => {
    const page = document.querySelector<HTMLElement>(".page");
    if (!page) return;
    const key = routeHref(route);
    const target = scrollPositions.get(key) ?? 0;
    let restoring = true;
    const restore = () => {
      if (!restoring) return;
      page.scrollTop = target;
      if (Math.abs(page.scrollTop - target) < 2) restoring = false;
    };
    const save = () => { if (!restoring) scrollPositions.set(key, page.scrollTop); };
    const cancel = () => { restoring = false; };
    const observer = new ResizeObserver(restore);
    for (const child of page.children) observer.observe(child);
    const frame = requestAnimationFrame(restore);
    page.addEventListener("scroll", save);
    page.addEventListener("wheel", cancel);
    page.addEventListener("touchstart", cancel);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      page.removeEventListener("scroll", save);
      page.removeEventListener("wheel", cancel);
      page.removeEventListener("touchstart", cancel);
    };
  }, [route]);

  const write = (next: Route) => {
    setRoute(next);
    const h = routeHref(next);
    if (window.location.hash !== h) window.location.hash = h;
  };

  const goto = (r: Route) => {
    write(r.page === "login" && route.page !== "login" ? { ...r, query: { ...r.query, next: routeHref(route) } } : r);
  };

  const setParam = (key: string, value: string | null) => {
    const query = { ...(route.query ?? {}) };
    if (value === null || value === "") delete query[key];
    else query[key] = value;
    write({ ...route, query });
  };

  return { route, goto, setParam };
}
