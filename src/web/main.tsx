import { StrictMode, Suspense, lazy, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { AppSidebar } from "./components/app-sidebar";
import { Topbar } from "./components/topbar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ThemeProvider } from "./lib/theme-provider";
import { Button } from "@/components/ui/button";
import { isNativeApp, pushState } from "./lib/push";
import { useNativeScoreNotifications } from "./lib/data";
import { parseRoute, useRouter, type Page } from "./lib/router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LocaleProvider, directionOf, useLocale, type Locale } from "./lib/locale";
import { DirectionProvider } from "@/components/ui/direction";
import { useSession } from "./lib/session";
import { m } from "./lib/i18n";
import { CrashBoundary } from "./components/crash";
import { PageInner, PageTitleProvider } from "./components/page";
import { EmptyState, Loading } from "./components/states";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { watchForClientErrors } from "./lib/report";

import { DiscoverPage } from "./pages/discover";
import { HomePage } from "./pages/home";
import { GamePage } from "./pages/game";
import { EventPage } from "./pages/event";
import { LivePage } from "./pages/live";
import { TeamPage } from "./pages/team";
import { ProfilePage } from "./pages/profile";
import { LoginPage } from "./pages/login";
import { DevicesPage } from "./pages/devices";
import { NotificationsPage } from "./pages/notifications";
import { MeetingsPage } from "./pages/meetings";
import { MeetingPage } from "./pages/meeting";
import { AdminPage } from "./pages/admin";
import { OrgsPage, OrgPage } from "./pages/org";
import { TeamsPage } from "./pages/teams";
import { PlayerPage } from "./pages/player";
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
const MeetingTestPage = lazy(() => import("./pages/meeting-test").then((m) => ({ default: m.MeetingTestPage })));

interface TweakDefaults {
  spoilerMode?: boolean;
  language?: Locale;
}

declare global {
  interface Window {
    TWEAK_DEFAULTS?: TweakDefaults;
  }
}

const DEFAULTS: Required<TweakDefaults> = {
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

/**
 * The locale keys the subtree; the direction wraps it.
 *
 * `document.dir` (set in lib/locale.tsx) is enough for CSS — logical
 * properties, Tailwind's `rtl:` variants, the browser's bidi algorithm. It is
 * not enough for Base UI, which decides which way a menu opens, which way a
 * slider fills and which arrow key moves forward from its own context rather
 * than from the DOM. Without this provider an Arabic reader gets mirrored text
 * inside primitives that still behave left-to-right, which is worse than either
 * direction done consistently.
 *
 * `@shadcn/direction` is that provider, taken from the registry rather than
 * written here — docs/done/2026-09-09-15-language-picker-at-fifteen.md, step 5.
 */
function LocalisedApp() {
  const { locale } = useLocale();
  return (
    <DirectionProvider direction={directionOf(locale)}>
      <App key={locale}/>
    </DirectionProvider>
  );
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
    <Alert className="rounded-none border-x-0 border-t-0" data-testid="pending-approval-banner">
      <AlertDescription>{m.pending_banner()}</AlertDescription>
    </Alert>
  );
}

/**
 * @answers INSTALL_APP
 *
 * `<pwa-install>`, in a browser only — never inside Tauri, where the reader
 * already has the native app.
 *
 * ## It asks when asked, not on arrival
 *
 * It used to prompt by itself, and on localhost that looked fine: the install
 * criteria are never met there, so the element stays inert and every local test
 * passed. On staging — a real origin, a real manifest, a real service worker —
 * it threw its dialog over the app on load at z-index 2147483001, and the first
 * e2e run against a deployment could not click Sign out. Playwright named the
 * element: "<pwa-install> intercepts pointer events".
 *
 * A reader would have hit the same thing, one dialog before they had seen
 * anything to want installed.
 *
 * `manual-apple` and `manual-chrome` turn the automatic prompt off. The way in
 * is a menu item beside Devices and Admin, which appears only while the element
 * reports that installing is actually available — so it is not the "always
 * visible, correct only sometimes" button this comment used to warn against.
 * The element knows; it just was not being asked.
 */
function App() {
  const tweaks = { ...DEFAULTS, ...(window.TWEAK_DEFAULTS ?? {}) } as Required<TweakDefaults>;
  const { route, goto, setParam } = useRouter();
  const [spoiler, setSpoiler] = useState<boolean>(tweaks.spoilerMode);

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

  // Who is here decides what the root is: Home for a person, Discover for a
  // visitor. Nothing else in the shell depends on the session.
  const { user, loading: sessionLoading } = useSession();

  // A detail page keeps its list highlighted in the nav, and the root is
  // Discover's for a visitor, who has no Home.
  const sidebarPage = route.page === "home" && !user ? "discover"
    : (route.page === "event" || route.page === "game" || route.page === "watch" || route.page === "broadcast") ? "discover"
    : route.page === "org" ? "orgs"
    : route.page === "team" ? "teams"
    : route.page === "player" ? "teams"
    : route.page;

  const handleSpoilerSet = (fn: boolean | ((prev: boolean) => boolean)) => {
    setSpoiler(prev => typeof fn === "function" ? fn(prev) : fn);
  };


  /**
   * Every page's screen, keyed by page. Exhaustive by type.
   *
   * `broadcast` and `watch` are the only lazy ones and share a Suspense
   * boundary, because they are one chunk — see the note on their imports. The
   * fallback is the app's ordinary loading line rather than a spinner: this is
   * a page arriving, which is what every other page does too.
   *
   * There is deliberately no `standings` page. A league table belongs to an
   * event — there is no such thing as "the standings" across all of them — and
   * the standalone page carried a hardcoded header to hide that. It lives on
   * the event's Standings tab.
   */
  const lazily = (node: React.ReactNode) => (
    <Suspense fallback={<PageInner><Loading>{loadingLabel()}</Loading></PageInner>}>{node}</Suspense>
  );

  const RENDER: Record<Page, () => React.ReactNode> = {
    discover: () => (
      <DiscoverPage goto={goto} spoiler={spoiler} query={route.query} setParam={setParam}/>
    ),
    // What is yours when signed in; the platform when not. Held until the
    // session is known, so a coach does not see Discover flash before Home.
    home: () =>
      sessionLoading ? <PageInner><Loading>{loadingLabel()}</Loading></PageInner>
      : user ? <HomePage goto={goto}/>
      : <DiscoverPage goto={goto} spoiler={spoiler} query={route.query} setParam={setParam}/>,
    event: () => <EventPage id={route.id} goto={goto} spoiler={spoiler} query={route.query} setParam={setParam}/>,
    game: () => <GamePage id={route.id} goto={goto} spoiler={spoiler}/>,
    live: () => <LivePage spoiler={spoiler} setSpoiler={handleSpoilerSet}/>,
    // No id: the directory, which already puts yours on top.
    team: () => route.id ? <TeamPage id={route.id} goto={goto} setParam={setParam} query={route.query} spoiler={spoiler}/> : <TeamsPage/>,
    profile: () => <ProfilePage goto={goto}/>,
    login: () => <LoginPage goto={goto} next={route.query?.next?.startsWith("#/") ? parseRoute(route.query.next) : undefined}/>,
    devices: () => <DevicesPage/>,
    notifications: () => <NotificationsPage/>,
    meetings: () => <MeetingsPage/>,
    meeting: () => <MeetingPage route={route}/>,
    admin: () => <AdminPage goto={goto}/>,
    orgs: () => <OrgsPage/>,
    teams: () => <TeamsPage/>,
    player: () => <PlayerPage id={route.id}/>,
    org: () => <OrgPage id={route.id}/>,
    // Two surfaces, one per direction. `#/broadcast/<gameId>` points a camera
    // at a game; `#/watch/<gameId>` receives it. Separate pages rather than one
    // with a mode, because they need different permissions from the browser and
    // fail in different ways.
    broadcast: () => lazily(<BroadcastPage id={route.id}/>),
    watch: () => lazily(<WatchPage id={route.id}/>),
    "meeting-test": () => lazily(<MeetingTestPage route={route} goto={goto}/>),
    /**
     * The address bar said something this app does not serve.
     *
     * Reached from `parseHash`, which now resolves an unrecognised page here
     * rather than passing it through. Says so, and offers the way back — the
     * previous behaviour was an empty pane, which reads as the app being broken
     * rather than the link being wrong.
     */
    "not-found": () => (
      <PageInner>
        <EmptyState data-testid="route-not-found">
          <p>{m.route_not_found()}</p>
          <Button onClick={() => goto({ page: "discover" })}>
            {m.browse()}
          </Button>
        </EmptyState>
      </PageInner>
    ),
  };

  return (
    <>
      {/*
        The shell is the registry's Sidebar (B2 step 8). Under 768px it is a
        Sheet by itself — which is what replaces `.nav-backdrop`, the
        `navOpen` state and the old drawer outright — and on desktop it
        collapses to icons rather than disappearing. `h-svh` and
        `overflow-hidden` keep the scroll architecture the app already had:
        the page scrolls inside its own container, the chrome stays put, and
        the shell cannot pan sideways. The theme provider mounts here too,
        with its toggle in the sidebar's Settings group.
      */}
      <PageTitleProvider>
      <SidebarProvider
        className="h-svh overflow-hidden"
        /* The block's own variables. `--header-height` is 56px rather than its
           48px: 56 is the mobile plan's number, held by the topbar overflow
           check. The mechanism is shadcn's; only the value is ours. */
        style={{ "--sidebar-width": "calc(var(--spacing) * 72)", "--header-height": "3.5rem" } as React.CSSProperties}
      >
        <AppSidebar variant="inset" page={sidebarPage} spoiler={spoiler} onSpoilerChange={handleSpoilerSet} />
        <SidebarInset className="overflow-hidden">
          <Topbar />
          <PendingApprovalNotice />
          {/*
            The app shell must never pan sideways. `overflow-x-clip` is the
            structural fix for a class of bug found three times by eye and
            never by a check: `overflow-y: auto` alone computes `overflow-x`
            to `auto`, so any too-wide descendant made the whole content area
            slide under a topbar that stayed put. `clip` is the only value
            that does not force the other axis. Anything too wide is now
            clipped rather than reachable by dragging, which is worse-looking
            and therefore better: it turns a silent escape hatch into a
            visible defect, and tests/render/mobile-layout.spec.ts names the
            element responsible. Fix the widget; do not reach for a wider
            container.
          */}
          <div id="page" className="flex-1 overflow-x-clip overflow-y-auto" data-testid="page">
            {/*
              One entry per page, and the type makes that mandatory.

              This was sixteen `route.page === "x"` branches with no else, so a
              page nobody had written a branch for rendered NOTHING — the
              sidebar and an empty pane, no error, no clue. `#/my-events` shipped
              that way: listed in ROUTES, rendered by no branch, and walked by
              the route spec, which passed because it only checks that `#root`
              is non-empty and the chrome always is.

              `Record<Page, …>` is what stops it recurring. Adding a page to
              PAGES without a screen here is a compile error, not a blank
              screen a reader finds.
            */}
            {RENDER[route.page]()}
            {/* No standalone #/standings. A league table belongs to an event —
                there is no such thing as "the standings" across all of them —
                and the page carried a hardcoded header to hide that: "Bangkok
                Schools League · Spring '26 · U18 Boys · Round 6 of 14 · Updated
                12:45 today", none of which came from anywhere. The table lives
                on the event's Standings tab. */}
          </div>
        </SidebarInset>
      </SidebarProvider>
      </PageTitleProvider>
      {/* Browser only — see the isNativeApp() gate on the import below.
          `manual-*` because it must not prompt on arrival; components/account.tsx
          calls showDialog() when a reader asks. */}
      {!isNativeApp() && (
        <pwa-install
          id="pwa-install"
          manifest-url="/manifest.webmanifest"
          use-local-storage
          manual-apple="true"
          manual-chrome="true"
        />
      )}
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
/**
 * Take the new build at the reader's next navigation.
 *
 * A worker precaches the built shell and answers navigations from it, so a
 * returning reader keeps whatever was deployed the last time they visited —
 * indefinitely, if nothing makes them take the update. On 2026-09-10 production
 * moved a week and 284 commits forward and the site still showed the previous
 * interface to a browser that had one cached. Nothing was broken: the Worker
 * served the new bundle, `curl` proved it, and the reader saw the old one.
 * Every check ran without a service worker and so was blind to the only thing
 * that mattered.
 *
 * Reloading the moment a worker is ready is the wrong fix and stays rejected:
 * this product has live score entry, and a page pulled out from under somebody
 * mid-form loses what they typed for a change that could have waited.
 *
 * A hash change is the boundary where both are true — the reader has finished
 * with whatever they were doing and the page is being replaced anyway. So the
 * update is applied there, once, at the destination they asked for. Someone who
 * stays on one screen keeps their page and keeps the build stamp's button,
 * which is the immediate way out and the only one that existed before.
 */
function applyOnNextNavigation(): void {
  const take = () => {
    window.removeEventListener("hashchange", take);
    // The hash has already moved, so this reloads INTO where they were going.
    window.location.reload();
  };
  window.addEventListener("hashchange", take);
}

if (
  typeof window !== "undefined" &&
  !("__TAURI_INTERNALS__" in window) &&
  "serviceWorker" in navigator
) {
  // Hung off the event rather than called from `onNeedReload`, so that anything
  // raising "an update is waiting" gets this — and so a test can raise it.
  // The build stamp listens to the same event to show its button.
  window.addEventListener("remy:update-ready", applyOnNextNavigation, { once: true });

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
 *
 * Why the package stays: its GUI is right, and Thai is a translation to
 * contribute rather than a component to rewrite. The Product Owner's own
 * pull request, khmyznikov/pwa-install#170, adds it; a version bump here when
 * it ships.
 *
 * Why `lit` is listed beside it in package.json although nothing of ours
 * imports it: the component's ES build externalizes `lit` instead of bundling
 * it, so without `lit` installed the vite build cannot resolve `import "lit"`.
 * knip is fine with that. The gate runs it as `--include files,unlisted`, and
 * declared-but-unimported is a different report.
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
//
// Why the Tauri packages stay: see the `tauri` command in scripts/ops.ts.
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
 * ## The hostname, not `import.meta.env.DEV`
 *
 * The hostname is the honest signal and it fails safe: anything that is not
 * plainly this machine counts as not-development, so a deployment cannot show a
 * reader a red box. That excludes the tunnel too — it is a real hostname on the
 * public internet, and telling it from production needs configuration this
 * bundle does not have. (`DEV` was false in every workflow here for a long
 * time — development ran a production build, watched — and a panel gated on
 * it was dead code. It is true under `vite dev` now, and the hostname still
 * answers the question better.)
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
          {/* The theme choice is read before the first paint (lazy state
              initialisers in the provider), and its toggle renders in the
              sidebar's Settings group (B2 step 8). Outside the locale key on
              purpose: switching language remounts the app subtree, and the
              theme choice should survive that untouched. */}
          <ThemeProvider>
            <LocalisedApp/>
          </ThemeProvider>
        </CrashBoundary>
      </LocaleProvider>
      </QueryClientProvider>
    </CrashBoundary>
  </StrictMode>,
);
