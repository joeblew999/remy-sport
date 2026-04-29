// Hash-based router. Hash routes are required for Tauri webview compatibility
// (per ADR 003 in the biz repo). Production may swap to TanStack Router with
// hash-history mode without changing call-sites.

import { useEffect, useState } from "react";

export interface Route {
  page: string;
  id?: string;
}

function parseHash(): Route {
  const raw = (window.location.hash || "").replace(/^#\/?/, "");
  if (!raw) return { page: "discover" };
  const parts = raw.split("/").filter(Boolean);
  if (parts.length === 0) return { page: "discover" };
  const [page, id] = parts;
  return id ? { page, id } : { page };
}

function serialize(route: Route): string {
  if (!route || !route.page || route.page === "discover") return "#/";
  if (route.id) return `#/${route.page}/${route.id}`;
  return `#/${route.page}`;
}

export interface RouterAPI {
  route: Route;
  goto: (r: Route) => void;
}

export function useRouter(): RouterAPI {
  const [route, setRoute] = useState<Route>(parseHash);
  useEffect(() => {
    const onHashChange = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  const goto = (r: Route) => {
    setRoute(r);
    const h = serialize(r);
    if (window.location.hash !== h) {
      window.location.hash = h;
    }
    document.querySelector(".page")?.scrollTo({ top: 0 });
  };
  return { route, goto };
}
