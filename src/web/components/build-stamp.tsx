/**
 * What this page is, and whether the server has moved on without it.
 *
 * Two answers, from two independent places. The CLIENT's is the content-hashed
 * script this page loaded. The SERVER's comes from /api/versions, which each
 * deployment serves from the stamp vite.config.ts baked into its Worker. When
 * the served shell names a different bundle, this page is running code the
 * deployment has replaced — the reader has a stale bundle and a reload fixes it.
 *
 * ## Why this exists when the service worker already reloads
 *
 * `registerType: "autoUpdate"` means a newly activated worker calls
 * `window.location.reload()` on its own, so the forcing is solved. What is not
 * solved is *noticing*: the browser only looks for a new worker on navigation
 * and otherwise on its own schedule, so a tab left open across a deploy keeps
 * serving yesterday's bundle without knowing. And there are cases the worker
 * cannot cover at all — Tauri registers none (main.tsx skips it), and a browser
 * that refused registration loses push, not the app.
 *
 * So this is the honest fallback: it does not reload anything, it says what is
 * true and lets the reader decide.
 *
 * ## Why the environment is shown only when it is not production
 *
 * "Which environment am I looking at" is the question this answers most often,
 * and it is only ever a question away from production. On production the name
 * would be noise on every screen for every reader.
 */
import { useEffect, useState } from "react";
import { m } from "../lib/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Muted } from "./page"

interface Stamp {
  environment?: string;
  git?: { commit?: string; github?: string };
}

/**
 * The script tag this page was actually loaded with.
 *
 * The bundle's identity is its own content-hashed filename, which is the one
 * thing that cannot lie about which build is running. The first version of this
 * baked the commit in at build time with a vite `define`, and it was wrong in a
 * way worth remembering: `git commit` moves HEAD without touching any file in
 * the bundle's `sources` list, so prepare.ts correctly judged the bundle fresh,
 * vite never re-ran, and the deployed artifact carried the PREVIOUS commit
 * forever. Staging shipped a client stamped 01d7e89 against a server stamped
 * 707ea9a and told every reader to reload, which did nothing, because the bundle
 * really was that old.
 *
 * A hash cannot drift from the file it names.
 */
const loadedScript = () =>
  document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.getAttribute("src") ??
  null;

export function BuildStamp() {
  const [server, setServer] = useState<Stamp | null>(null);
  /**
   * The service worker's answer to the same question, which arrives later.
   *
   * The fetch below runs once at mount, so it can only ever catch a deployment
   * that happened before this page loaded. main.tsx polls the worker every
   * fifteen minutes and raises this when one is waiting — that is the path that
   * covers the tab left open all afternoon.
   */
  const [swReady, setSwReady] = useState(false);
  /** The served shell names a different bundle than the one this tab loaded. */
  const [bundleStale, setBundleStale] = useState(false);
  useEffect(() => {
    const onReady = () => setSwReady(true);
    window.addEventListener("remy:update-ready", onReady);
    return () => window.removeEventListener("remy:update-ready", onReady);
  }, []);

  useEffect(() => {
    let live = true;
    /**
     * No `.catch` chain that swallows into undefined — the whole promise is
     * guarded, because tests/render/no-backend.spec.ts asserts that no route
     * leaves a promise rejecting, and this component renders on every one of
     * them. That tier has no server at all, which is exactly the case here:
     * the fetch fails, `server` stays null, and nothing is drawn.
     */
    void fetch("/api/versions")
      .then((r) => (r.ok ? (r.json() as Promise<{ current?: Stamp }>) : null))
      .then((body) => {
        if (live) setServer(body?.current ?? null);
      })
      .catch(() => {
        /* no /api/versions: say nothing rather than guess */
      });

    /**
     * Is the shell the server serves now the one this tab loaded?
     *
     * `no-store` because a cached index.html would compare the page against
     * itself and never report anything. Guarded like the fetch above: the
     * render tier has no server, and a rejection there fails every route.
     */
    void fetch("/", { cache: "no-store" })
      .then((r) => (r.ok ? r.text() : null))
      .then((html) => {
        const mine = loadedScript();
        if (!live || !html || !mine) return;
        const latest = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/)?.[1];
        // Compare the filename, not the path: the shell writes "./assets/x.js"
        // and the DOM may report it either way.
        if (latest && latest.split("/").pop() !== mine.split("/").pop()) setBundleStale(true);
      })
      .catch(() => {
        /* no shell to compare against: say nothing */
      });

    return () => {
      live = false;
    };
  }, []);

  const serverCommit = server?.git?.commit;
  // Three routes to the same fact: the worker found a new version, the served
  // shell names a different bundle, or /api/versions is somewhere this page is
  // not. One button, because it is one thing to the reader.
  const stale = swReady || bundleStale;
  /**
   * On a developer's own machine, reload rather than ask.
   *
   * An agent driving the page edits code, the watcher rebuilds in a second, and
   * the next navigation still ran the previous bundle — with the button that
   * would have fixed it below the fold. A session went by looking at the
   * app before the edit and reasoning about it. Readers on a deployment keep
   * the button: a page pulled from under someone mid-read is worse than a
   * stale one for them.
   *
   * Once per bundle, remembered in sessionStorage: if a reload does not clear
   * the staleness — a worker still serving the old shell — the button shows as
   * it always did, rather than the page reloading forever.
   */
  useEffect(() => {
    if (!stale) return;
    if (location.hostname !== "localhost" && location.hostname !== "127.0.0.1") return;
    const mine = loadedScript() ?? "";
    const key = "remy:auto-reloaded-for";
    if (sessionStorage.getItem(key) === mine) return;
    sessionStorage.setItem(key, mine);
    window.location.reload();
  }, [stale]);
  const env = server?.environment;

  // Nothing to say without a server to say it about. The render tier has none,
  // and inventing a version there would be worse than an empty corner.
  if (!serverCommit) return null;

  // Quiet by default — it is for the moment someone asks "which one am I on".
  // The environment is shown only off production, where it is the whole
  // point; the hash is a hash, so it keeps its digits aligned.
  return (
    <Muted as="div" className="text-xs flex flex-wrap items-center gap-1.5" data-testid="build-stamp">
      {env && env !== "production" && <Badge>{env}</Badge>}
      <span className="tabular-nums">{serverCommit}</span>
      {stale && (
        // Loud enough to notice, and a button rather than a notice because
        // the fix is one click.
        <Button size="xs" data-testid="build-stale" onClick={() => window.location.reload()}>
          {m.build_update_available()}
        </Button>
      )}
    </Muted>
  );
}
