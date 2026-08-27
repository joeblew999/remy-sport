import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { Sidebar } from "./components/sidebar";
import { Topbar } from "./components/topbar";
import { useRouter } from "./lib/router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LocaleProvider, useLocale, type Locale } from "./lib/locale";

import { DiscoverPage } from "./pages/discover";
import { EventPage } from "./pages/event";
import { LivePage } from "./pages/live";
import { TeamPage } from "./pages/team";
import { ProfilePage } from "./pages/profile";
import { LoginPage } from "./pages/login";
import { DevicesPage } from "./pages/devices";
import { AdminPage } from "./pages/admin";
import { OrgsPage, OrgPage } from "./pages/org";
import { StandingsTable } from "./pages/event";
import { m } from "./lib/i18n";

interface TweakDefaults {
  accentColor?: string;
  showTauriChrome?: boolean;
  spoilerMode?: boolean;
  language?: Locale;
}

declare global {
  interface Window {
    TWEAK_DEFAULTS?: TweakDefaults;
  }
}

const DEFAULTS: Required<TweakDefaults> = {
  accentColor: "#D17246",
  showTauriChrome: true,
  spoilerMode: false,
  language: "en",
};

/**
 * Re-renders the whole tree when the language changes.
 *
 * Paraglide's messages are plain functions, not hooks — nothing subscribes to
 * them, so a locale switch would leave already-rendered copy in the old
 * language. Keying the subtree is the documented way to force re-evaluation,
 * and it is cheap: the page is remounted, and the API data it needs is already
 * in the query cache, keyed independently of locale.
 */
function LocalisedApp() {
  const { locale } = useLocale();
  return <App key={locale}/>;
}

function App() {
  const tweaks = { ...DEFAULTS, ...(window.TWEAK_DEFAULTS ?? {}) } as Required<TweakDefaults>;
  const { route, goto } = useRouter();
  const [spoiler, setSpoiler] = useState<boolean>(tweaks.spoilerMode);
  // Mobile sidebar drawer state
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    document.documentElement.style.setProperty("--accent", tweaks.accentColor);
    document.documentElement.style.setProperty("--accent-deep", tweaks.accentColor);
  }, [tweaks.accentColor]);

  // A detail page keeps its list highlighted in the nav.
  const sidebarPage = (route.page === "event" || route.page === "bracket") ? "discover"
    : route.page === "org" ? "orgs"
    : route.page;

  const handleSpoilerSet = (fn: boolean | ((prev: boolean) => boolean)) => {
    setSpoiler(prev => typeof fn === "function" ? fn(prev) : fn);
  };

  const setPageAndCloseDrawer = (p: string) => {
    goto({ page: p });
    setNavOpen(false);
  };

  return (
    <>
      {tweaks.showTauriChrome && (
        <div className="tauri-chrome">
          <div className="traffic"><span className="red"/><span className="yellow"/><span className="green"/></div>
          <div className="title">Remy Sport · {route.page === "live" ? "LIVE — QF2" : route.page}</div>
        </div>
      )}
      <div className={`app ${navOpen ? "nav-open" : ""}`} style={tweaks.showTauriChrome ? { height: "calc(100vh - 28px)" } : {}}>
        <Sidebar page={sidebarPage} setPage={setPageAndCloseDrawer}/>
        {navOpen && <div className="nav-backdrop" onClick={() => setNavOpen(false)}/>}
        <div className="main">
          <Topbar spoiler={spoiler} setSpoiler={handleSpoilerSet} onMenu={() => setNavOpen(o => !o)} goto={goto}/>
          <div className="page">
            {route.page === "discover" && <DiscoverPage goto={goto} spoiler={spoiler}/>}
            {route.page === "events" && <DiscoverPage goto={goto} spoiler={spoiler}/>}
            {route.page === "event" && <EventPage id={route.id} goto={goto}/>}
            {route.page === "live" && <LivePage goto={goto} spoiler={spoiler} setSpoiler={handleSpoilerSet}/>}
            {route.page === "team" && <TeamPage id={route.id} goto={goto}/>}
            {route.page === "profile" && <ProfilePage goto={goto}/>}
            {route.page === "login" && <LoginPage goto={goto}/>}
            {route.page === "devices" && <DevicesPage goto={goto}/>}
            {route.page === "admin" && <AdminPage goto={goto}/>}
            {route.page === "orgs" && <OrgsPage goto={goto}/>}
            {route.page === "org" && <OrgPage id={route.id} goto={goto}/>}
            {route.page === "standings" && (
              <>
                <div className="page-header">
                  <div className="crumbs">STANDINGS</div>
                  <h1>Bangkok Schools League · Spring '26</h1>
                  <div className="sub">U18 Boys · Round 6 of 14 · Updated 12:45 today</div>
                </div>
                <StandingsTable/>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// Forward webview console output to the Rust logger when running inside Tauri.
// src-tauri/src/lib.rs registers tauri-plugin-log for debug builds, but only
// the Rust half was installed — so `tauri dev` and `tauri ios dev` showed
// nothing the SPA logged, and `tauri info` reported the JS half missing.
//
// Guarded and dynamically imported so a plain browser never loads it.
if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
  import("@tauri-apps/plugin-log")
    .then(({ attachConsole }) => attachConsole())
    .catch(() => {
      /* logging is best-effort; never block the app from mounting */
    });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Reference data and events change on human timescales, not per-navigation.
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      /**
       * A 404 is an answer, not a failure.
       *
       * Retrying one keeps the query `pending` through three round trips, so a
       * deep link to a deleted id renders {m.loading()} instead of "does not
       * exist". Only retry what could plausibly succeed next time.
       */
      retry: (count, error) => {
        const status = (error as { status?: number } | null)?.status
        if (typeof status === "number" && status >= 400 && status < 500) return false
        return count < 2
      },
    },
  },
});

/**
 * Let a test hand the cache its data instead of the network.
 *
 * A rendering test — "the team page shows a placeholder", "sample data is
 * labelled" — has nothing to say about the API. Driving one used to mean
 * seeding D1, signing in, and waiting on a real round trip, so an assertion
 * about a `<div>` cost a database.
 *
 * `page.addInitScript` sets this before any bundle runs; TanStack then reads
 * the value synchronously on mount and never fetches. The keys come from
 * `orpc.*.key()`, so a test seeds the same key the component subscribes to and
 * a renamed procedure breaks the test at compile time.
 *
 * Guarded on the property existing, so nothing ships to a real browser: no
 * test, no seed, ordinary fetching.
 */
declare global {
  interface Window {
    __QUERY_SEED__?: { queryKey: readonly unknown[]; data: unknown }[];
  }
}

for (const { queryKey, data } of window.__QUERY_SEED__ ?? []) {
  queryClient.setQueryData(queryKey, data);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* One provider. Query owns fetch state, caching and dedup for every
        resource — including who is signed in, which used to need a
        SessionProvider of its own. */}
    <QueryClientProvider client={queryClient}>
      {/* Locale wraps the app because every page renders names, and the view
          models resolve them against the current locale. */}
      <LocaleProvider>
        <LocalisedApp/>
      </LocaleProvider>
    </QueryClientProvider>
  </StrictMode>,
);
