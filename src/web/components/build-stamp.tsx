/**
 * What this page is, and whether the server has moved on without it.
 *
 * Two versions, from two independent places. The CLIENT's is baked in at build
 * time by vite.config.ts (`__BUILD_COMMIT__`, read from git). The SERVER's comes
 * from /api/versions, which each deployment serves from the stamp bundled into
 * it by scripts/deploy/versions.ts. When they disagree, this page is running
 * code the deployment has replaced — the reader has a stale bundle and a reload
 * fixes it.
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

declare const __BUILD_COMMIT__: string;

interface Stamp {
  environment?: string;
  git?: { commit?: string; github?: string };
}

export function BuildStamp() {
  const [server, setServer] = useState<Stamp | null>(null);

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
    return () => {
      live = false;
    };
  }, []);

  const client = __BUILD_COMMIT__;
  if (!client) return null;

  const serverCommit = server?.git?.commit;
  const stale = Boolean(serverCommit) && serverCommit !== client;
  const env = server?.environment;

  return (
    <div className="build-stamp" data-testid="build-stamp">
      {env && env !== "production" && <span className="build-env">{env}</span>}
      <span className="build-commit">{client}</span>
      {stale && (
        <button
          type="button"
          className="build-stale"
          data-testid="build-stale"
          title={`${client} → ${serverCommit}`}
          onClick={() => window.location.reload()}
        >
          {m.build_update_available()}
        </button>
      )}
    </div>
  );
}
