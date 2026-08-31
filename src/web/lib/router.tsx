// Hash-based router. Hash routes are required for Tauri webview compatibility
// (per ADR 003 in the biz repo). Production may swap to TanStack Router with
// hash-history mode without changing call-sites.

import { useEffect, useState } from "react";

export interface Route {
  page: string;
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

function parseHash(): Route {
  const raw = (window.location.hash || "").replace(/^#\/?/, "");
  const [path, search] = raw.split("?");
  const query: Record<string, string> = {};
  if (search) {
    for (const [key, value] of new URLSearchParams(search)) query[key] = value;
  }
  const parts = (path ?? "").split("/").filter(Boolean);
  const base: Route = parts.length === 0
    ? { page: "discover" }
    : parts[1]
      ? { page: parts[0]!, id: parts[1] }
      : { page: parts[0]! };
  return Object.keys(query).length ? { ...base, query } : base;
}

function serialize(route: Route): string {
  // Empty values are dropped rather than written as `province=`: an unset
  // filter should leave no trace in a link somebody is about to send.
  const entries = Object.entries(route.query ?? {}).filter(([, v]) => v !== "");
  const search = entries.length ? `?${new URLSearchParams(entries)}` : "";
  if (!route || !route.page || route.page === "discover") return `#/${search}`;
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
export const ROUTES = [
  "/",
  "#/live",
  "#/events",
  "#/my-events",
  "#/profile",
  "#/team",
  "#/orgs",
  "#/admin",
  "#/devices",
  "#/login",
  "#/event/evt_001",
  "#/org/org_001",
  "#/team/team_001",
  "#/broadcast/gam_002",
  "#/watch/gam_002",
] as const

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

export function useRouter(): RouterAPI {
  const [route, setRoute] = useState<Route>(parseHash);
  useEffect(() => {
    const onHashChange = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const write = (next: Route) => {
    setRoute(next);
    const h = serialize(next);
    if (window.location.hash !== h) window.location.hash = h;
  };

  const goto = (r: Route) => {
    write(r);
    document.querySelector(".page")?.scrollTo({ top: 0 });
  };

  const setParam = (key: string, value: string | null) => {
    const query = { ...(route.query ?? {}) };
    if (value === null || value === "") delete query[key];
    else query[key] = value;
    write({ ...route, query });
  };

  return { route, goto, setParam };
}
