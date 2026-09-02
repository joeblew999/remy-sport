import { StrictMode, Suspense, lazy, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { Sidebar } from "./components/sidebar";
import { Topbar } from "./components/topbar";
import { isNativeApp, pushState } from "./lib/push";
import { useNativeScoreNotifications } from "./lib/data";
import { useRouter } from "./lib/router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LocaleProvider, useLocale, type Locale } from "./lib/locale";
import { useSession } from "./lib/session";
import { m } from "./lib/i18n";
import { CrashBoundary } from "./components/crash";
import { watchForClientErrors } from "./lib/report";

import { DiscoverPage } from "./pages/discover";
import { MyEventsPage } from "./pages/my-events";
import { EventPage } from "./pages/event";
import { LivePage } from "./pages/live";
import { TeamPage } from "./pages/team";
import { ProfilePage } from "./pages/profile";
import { LoginPage } from "./pages/login";
import { DevicesPage } from "./pages/devices";
import { AdminPage } from "./pages/admin";
import { OrgsPage, OrgPage } from "./pages/org";
/**
 * The only lazily-loaded pages, and the reason is the bundle.
 *
 * `@moq/watch` and `@moq/publish` pull in a WebTransport stack, a media
 * pipeline and an Opus encoder. Imported statically they sat in the main chunk,
 * so **every** reader downloaded and parsed them — a schedule, a league table,
 * a team sheet — to open a page that never touches video. On a phone uplink in
 * a school gym, which is the network this product is actually for, that is the
 * whole point of the split.
 *
 * These two routes are also the only ones where a moment of loading is honest:
 * a viewer pressing Watch expects a connection to be made.
 *
 * Nothing else is lazy. Splitting a page that renders a list buys a round trip
 * and saves a few kilobytes, which is the wrong way round.
 */
const BroadcastPage = lazy(() =>
  import("./pages/video").then((m) => ({ default: m.BroadcastPage })),
);
const WatchPage = lazy(() => import("./pages/video").then((m) => ({ default: m.WatchPage })));

interface TweakDefaults {
  accentColor?: string;
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
/** The loading line, read at render so it follows a language switch. */
const loadingLabel = () => m.loading();

function LocalisedApp() {
  const { locale } = useLocale();
  return <App key={locale}/>;
}

/**
 * "You are waiting for an administrator" — the promise auth.config.ts makes.
 *
 * SUSPENDED and DEACTIVATED accounts are refused when their session is created,
 * so they never render a page. PENDING_APPROVAL deliberately is not, and the
 * reason is written down at src/auth.config.ts: such a referee "has an account
 * and needs to see that they are waiting". Nothing told them. They signed in to
 * an ordinary-looking app and could not tell their sign-up was incomplete.
 *
 * Above the page rather than on one screen, because there is no screen this
 * belongs to — it is a fact about the account, true wherever they are. Same
 * placement and the same reasoning as the impersonation banner.
 */
function PendingApprovalNotice() {
  const { user } = useSession();
  if (user?.statusCode !== "PENDING_APPROVAL") return null;
  return (
    <div className="admin-banner" data-testid="pending-approval-banner">
      <span>{m.pending_banner()}</span>
    </div>
  );
}

function App() {
  const tweaks = { ...DEFAULTS, ...(window.TWEAK_DEFAULTS ?? {}) } as Required<TweakDefaults>;
  const { route, goto, setParam } = useRouter();
  const [spoiler, setSpoiler] = useState<boolean>(tweaks.spoilerMode);
  // Mobile sidebar drawer state
  const [navOpen, setNavOpen] = useState(false);

  /**
   * Score notifications in the native app.
   *
   * Gated on the reader having granted the OS permission, asked from the
   * profile page — never on load. A permission prompt nobody asked for is the
   * thing every platform penalises, and `enableNative` is behind a button for
   * the same reason `enablePush` is.
   *
   * A no-op in the browser, where the service worker does this properly and
   * works with the app closed.
   */
  const [nativeOn, setNativeOn] = useState(false);
  useEffect(() => {
    // Synchronous, and first: `pushState()` fetches the VAPID key, so asking it
    // on every page load in a browser is a round trip for an answer no browser
    // needs — and it rejected unhandled where there is no Worker.
    if (!isNativeApp()) return;
    let live = true;
    /**
     * No `.catch`. `pushState` never rejects — a failure to find out comes back
     * as `unknown`, which is not `native`, so the notifier stays off. That is
     * already the truthful answer here: the root has one question, "may this app
     * notify", and "we could not find out" is a no.
     *
     * A swallowing catch would be worse than nothing now: it would hide a broken
     * contract rather than the transient failure it looks like it is handling.
     * tests/render/no-backend.spec.ts is what holds the contract.
     */
    void pushState().then((s) => {
      if (live) setNativeOn(s.status === "native");
    });
    return () => {
      live = false;
    };
  }, []);
  useNativeScoreNotifications(nativeOn);

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
      <div className={`app ${navOpen ? "nav-open" : ""}`}>
        <Sidebar page={sidebarPage} setPage={setPageAndCloseDrawer}/>
        {navOpen && <div className="nav-backdrop" onClick={() => setNavOpen(false)}/>}
        <div className="main">
          <Topbar spoiler={spoiler} setSpoiler={handleSpoilerSet} onMenu={() => setNavOpen(o => !o)} goto={goto}/>
          <PendingApprovalNotice />
          <div className="page">
            {route.page === "discover" && (
              <DiscoverPage goto={goto} spoiler={spoiler} query={route.query} setParam={setParam}/>
            )}
            {route.page === "events" && <MyEventsPage goto={goto}/>}
            {route.page === "event" && <EventPage id={route.id} goto={goto} spoiler={spoiler}/>}
            {route.page === "live" && <LivePage goto={goto} spoiler={spoiler} setSpoiler={handleSpoilerSet}/>}
            {route.page === "team" && <TeamPage id={route.id} goto={goto}/>}
            {route.page === "profile" && <ProfilePage goto={goto}/>}
            {route.page === "login" && <LoginPage goto={goto}/>}
            {route.page === "devices" && <DevicesPage goto={goto}/>}
            {route.page === "admin" && <AdminPage goto={goto}/>}
            {route.page === "orgs" && <OrgsPage goto={goto}/>}
            {/* Two surfaces, one per direction. `#/broadcast/<gameId>` points a
                camera at a game; `#/watch/<gameId>` receives it. Separate pages
                rather than one with a mode, because they need different
                permissions from the browser and fail in different ways. */}
            {(route.page === "broadcast" || route.page === "watch") && (
              /* One boundary for both, because they are one chunk. The fallback
                 is the app's ordinary loading line rather than a spinner: this
                 is a page arriving, which is what every other page does too. */
              <Suspense fallback={<div className="empty">{loadingLabel()}</div>}>
                {route.page === "broadcast" && <BroadcastPage id={route.id} goto={goto}/>}
                {route.page === "watch" && <WatchPage id={route.id} goto={goto}/>}
              </Suspense>
            )}
            {route.page === "org" && <OrgPage id={route.id} goto={goto}/>}
            {/* No standalone #/standings. A league table belongs to an event —
                there is no such thing as "the standings" across all of them —
                and the page carried a hardcoded header to hide that: "Bangkok
                Schools League · Spring '26 · U18 Boys · Round 6 of 14 · Updated
                12:45 today", none of which came from anywhere. The table lives
                on the event's Standings tab. */}
          </div>
        </div>
      </div>
      {/* Browser only — see the isNativeApp() gate on the import below. */}
      {!isNativeApp() && <pwa-install manifest-url="/manifest.webmanifest" use-local-storage/>}
    </>
  );
}

/**
 * The service worker — in a browser only, never inside Tauri.
 *
 * Web Push on iOS requires one, and it only works for a PWA installed to the
 * home screen. But desktop and iOS run this same bundle inside a Tauri webview
 * (decision-003: one bundle, three targets), where a service worker is at best
 * dead weight and at worst caches the app shell against a native build that
 * ships its own assets.
 *
 * So `vite-plugin-pwa` is configured with `injectRegister: null` — it emits the
 * worker and the manifest but writes no registration into index.html — and the
 * decision is made here at runtime, on the same `__TAURI_INTERNALS__` check the
 * logger below uses. A build flag could not do it: there is one bundle.
 *
 * Failure is silent on purpose. A browser that refuses to register a worker
 * loses push, not the app.
 */
if (
  typeof window !== "undefined" &&
  !("__TAURI_INTERNALS__" in window) &&
  "serviceWorker" in navigator
) {
  import("virtual:pwa-register")
    .then(({ registerSW }) =>
      registerSW({
        immediate: true,
        /**
         * Ask whether there is a new worker, because nothing else will.
         *
         * `registerType: "autoUpdate"` handles the update once one is FOUND —
         * it compiles to `window.location.reload()` on activation. What it does
         * not do is look. The browser checks on navigation and otherwise on its
         * own schedule, so a tab left open across a deploy serves the old bundle
         * indefinitely — which is the normal case here: a scoring table open on
         * a laptop at courtside for a whole tournament.
         *
         * Fifteen minutes is a cheap conditional request against the worker
         * script, not a download; the browser only fetches a new worker when the
         * bytes differ. `update()` rejects if the registration has gone away, so
         * it is caught — an unhandled rejection on a timer would fire forever.
         */
        onRegisteredSW(_url, registration) {
          if (!registration) return;
          setInterval(
            () => {
              void registration.update().catch(() => {
                /* offline, or the registration is gone: try again next tick */
              });
            },
            15 * 60 * 1000,
          );
        },
        /**
         * Tell the reader instead of reloading under them.
         *
         * Supplying this REPLACES autoUpdate's automatic
         * `window.location.reload()`. That default is fine on a page someone is
         * reading and wrong on one they are typing into — this product has live
         * score entry, and a reload mid-game loses whatever was in the form for
         * a change that could have waited a few seconds.
         *
         * The sidebar's build stamp already renders a reload button for the same
         * condition, reached the other way (its own /api/versions check), so
         * this raises the same signal rather than inventing a second one.
         */
        onNeedReload() {
          window.dispatchEvent(new CustomEvent("remy:update-ready"));
        },
      }),
    )
    .catch(() => {
      /* no service worker: the app still works, push does not */
    });
}

/**
 * The install-prompt component — in a browser only, never inside Tauri.
 *
 * Same reasoning as the service worker block above: Tauri users already have
 * the native app, so beforeinstallprompt/Web Install concepts do not apply
 * and showing an "Add to Home Screen" dialog inside an already-installed
 * native shell would be confusing at best. Gated on the same isNativeApp()
 * this file already imports for push, rather than re-deriving the check.
 *
 * Its dialog is not translated into Thai, and that cannot be fixed from here.
 * 0.6.4 ships 33 locales and `th` is not among them, so a Thai reader gets
 * English copy inside an otherwise Thai app. The component resolves its
 * language from navigator.language alone — exact code, then the two-letter
 * prefix, then a bare `catch {}` that leaves it on English — so an unsupported
 * language is indistinguishable from a supported one at runtime, which is why
 * this went unnoticed. That lookup also ignores our locale, which is
 * localStorage-first (lib/locale.tsx), so a reader on a Japanese browser who
 * chose English still gets a Japanese dialog; en and ja mismatch that way
 * today. It declares `changeLocale` in its .d.ts but does not expose it
 * through `exports` — the entry resolves to a bundle whose only export is
 * PWAInstallElement — so there is nothing to call and no local workaround
 * short of importing past the exports map. Both asked upstream:
 * https://github.com/khmyznikov/pwa-install/issues/169
 */
if (typeof window !== "undefined" && !isNativeApp()) {
  import("@khmyznikov/pwa-install").catch(() => {
    /* no install prompt: the app still works, install just isn't offered */
  });
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

// Before anything renders, so a failure during the first paint is still
// reported. Covers what a React boundary cannot see: timers, event handlers,
// failed chunk loads and unhandled promises.
watchForClientErrors();

/**
 * And, on a developer's own machine, show them.
 *
 * The beacon above goes to a dataset; nobody working sees it. Both copies of
 * the `pushState()` defect were a section that rendered as nothing with a
 * rejection nobody noticed.
 *
 * ## Not `import.meta.env.DEV`, which is never true here
 *
 * That was the first attempt and it was dead code. `mise run dev` runs
 * `vite build --watch` — a *production* build, watched — and the render tier
 * serves `dist/web` through `vite preview`. This repo never runs a vite dev
 * server, deliberately: what you develop against is the bundle you ship. So
 * `DEV` is false in every workflow here and the panel could never have appeared.
 *
 * The hostname is the honest signal and it fails safe: anything that is not
 * plainly this machine counts as not-development, so a deployment cannot show a
 * reader a red box. That excludes the tunnel too — it is a real hostname on the
 * public internet, and telling it from production needs configuration this
 * bundle does not have.
 *
 * Imported dynamically, so it is a separate chunk that production never fetches.
 */
if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
  void import("./lib/dev-rejections").then((m) => m.showRejectionsInDev());
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
    {/* Outermost, above every provider, because a boundary cannot catch a
        throw from a component rendered above it — and LocaleProvider throwing
        was exactly that case. Untranslated, since the thing that translates is
        one of the things it is catching. */}
    <CrashBoundary untranslated>
      <QueryClientProvider client={queryClient}>
      {/* Locale wraps the app because every page renders names, and the view
          models resolve them against the current locale. */}
      <LocaleProvider>
        {/* Inside LocaleProvider so the message it shows is in the reader's
            language, and outside the router so a crash on any page is caught.
            A render error used to unmount the tree and leave a white
            rectangle: no message, no way back, and no report. */}
        <CrashBoundary>
          <LocalisedApp/>
        </CrashBoundary>
      </LocaleProvider>
      </QueryClientProvider>
    </CrashBoundary>
  </StrictMode>,
);
