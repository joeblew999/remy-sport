import { i18nOptions } from "../../scripts/lib/i18n";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import { paraglideVitePlugin } from "@inlang/paraglide-js";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Hash routing only — required for Tauri webview compatibility.
// See remy-sport-biz/decisions/decision-003-frontend-targets.md.
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

/**
 * One Vite, for the Worker and the SPA.
 *
 * `vite dev` runs the Worker in workerd beside the SPA, with D1 and the other
 * bindings from wrangler.toml and the secrets from .dev.vars, and the SPA gets
 * HMR. `vite build` writes both: dist/client for the assets and
 * dist/remy-sport for the Worker with the wrangler.json that `wrangler deploy`
 * then uses. There is no dist/ during development at all.
 *
 * That replaces a 300-line dev script that ran `vite build --watch` into
 * dist/web beside a `wrangler dev` serving it — a directory one process wrote
 * while another read it, which was the race behind a day of stale bundles,
 * 945 superseded chunks, and two checks that existed only to police it.
 *
 * `--mode render` leaves the Cloudflare plugin out: the render tier is a
 * browser against a static file server, on purpose, and starts no Worker.
 *
 * No build-time version constant here, and the reason is worth keeping: a
 * `define` once baked `git rev-parse HEAD` into the bundle, and `git commit`
 * moves HEAD without touching any file the bundle is built from, so the
 * artifact carried the previous commit forever. components/build-stamp.tsx
 * compares the served shell's content-hashed script against the one the page
 * loaded instead; a hash cannot disagree with its bytes.
 */

/**
 * Seed the local database when the dev server starts.
 *
 * The seed is an endpoint (`POST /api/seed`, dev only), so the server has to
 * be up before it can run; the old dev script polled /api/health and then
 * posted. Here the server tells us when it is listening. Retried, because the
 * Worker may still be starting on the first attempt.
 */
function seedOnStart(): Plugin {
  return {
    name: "remy:seed-on-start",
    apply: "serve",
    configureServer(server) {
      server.httpServer?.once("listening", () => {
        const address = server.httpServer?.address();
        const port = typeof address === "object" && address ? address.port : 8787;
        const seed = async (attempt = 1): Promise<void> => {
          const ok = await fetch(`http://localhost:${port}/api/seed`, { method: "POST" })
            .then((r) => r.ok)
            .catch(() => false);
          if (ok) server.config.logger.info("  seeded the local database — #/login lists the seeded people");
          else if (attempt < 5) setTimeout(() => void seed(attempt + 1), 1000);
          else server.config.logger.warn("  could not seed the local database (POST /api/seed failed five times)");
        };
        void seed();
      });
    },
  };
}

/**
 * What this build is: baked into the Worker as `__BUILD__` (src/build.d.ts) and
 * served at /api/versions. The commit from git, the build id from the deploy
 * (`BUILD_ID`, which it then waits for the origin to report) or the clock, the
 * environment from CLOUDFLARE_ENV — dev when serving, production otherwise,
 * since the top-level config has no name.
 */
const git = (args: string): string => {
  try {
    return execSync(`git ${args}`, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};
function stamp(command: "build" | "serve") {
  const commit = git("rev-parse --short HEAD");
  const repo = process.env.GITHUB_REPO_URL;
  return {
    commit,
    branch: git("branch --show-current"),
    builtAt: process.env.BUILD_ID ?? new Date().toISOString(),
    environment: process.env.CLOUDFLARE_ENV ?? (command === "serve" ? "dev" : "production"),
    app: (JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as { version: string }).version,
    github: repo && commit ? `${repo}/commit/${git("rev-parse HEAD")}` : null,
  };
}

export default defineConfig(({ mode, command }) => ({
  root: __dirname,
  plugins: [
    ...(mode === "render"
      ? []
      : [
          cloudflare({
            configPath: resolve(ROOT, "wrangler.toml"),
            // The same local D1 that `wrangler d1 migrations apply --local`
            // writes, so the database the tests migrate is the one dev serves.
            persistState: { path: resolve(ROOT, ".wrangler/state") },
          }),
          seedOnStart(),
        ]),
    react(),
    paraglideVitePlugin(i18nOptions),
    /**
     * The service worker is not registered here, and that is deliberate.
     *
     * A browser should have one — offline shell, push, install to the home
     * screen. But desktop and iOS run this same bundle inside a Tauri webview
     * (decision-003: one bundle, three targets), where a service worker is at
     * best dead weight and at worst caches the app shell against a native
     * build. One bundle serves all three targets, so this cannot be a build
     * flag; registration happens in main.tsx, guarded on the same
     * `__TAURI_INTERNALS__` check the logger already uses.
     *
     * The icons are the files `bun run ops icons` cuts from brand.svg. They are
     * listed rather than globbed so a missing one is a failed build instead of
     * a manifest that quietly offers fewer sizes than it claims.
     */
    VitePWA({
      injectRegister: null,
      registerType: "autoUpdate",
      // `injectManifest`, not the default `generateSW`, because a push handler
      // cannot be expressed as Workbox config. `generateSW` writes the whole
      // service worker from the options below, so there is nowhere to put a
      // `push` listener; this strategy takes sw.ts as the source and only
      // substitutes the precache manifest into it.
      strategies: "injectManifest",
      srcDir: ".",
      filename: "sw.ts",
      manifest: {
        name: "Remy Sport",
        short_name: "Remy",
        description: "Basketball events, teams and live scoring for Thailand.",
        // Hash routing, so every route is "/" plus a fragment — and a fragment
        // is not sent to the server. See decision-003.
        start_url: "/",
        scope: "/",
        display: "standalone",
        // The brand orange, so the splash and the status bar match the mark
        // rather than flashing white before the app paints.
        theme_color: "#dd5230",
        background_color: "#dd5230",
        icons: [
          { src: "pwa-64x64.png", sizes: "64x64", type: "image/png" },
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,woff2,png,svg,ico}"],
      },
      // The dev server serves a real service worker too, so push can be tested
      // against `bun run dev` instead of only against a deploy. Without this,
      // `navigator.serviceWorker.register` 404s in dev and every push feature
      // is untestable until it is live — which is how you ship a broken one.
      devOptions: { enabled: true, type: "module" },
    }),
  ],
  base: "./",
  /**
   * One port, the one everything else in this repo already knows: the tunnel's
   * ingress, `.dev.vars`' BETTER_AUTH_URL, the e2e tier's baseURL, Tauri's
   * devUrl. `host: true` binds every interface so a phone on the same wifi can
   * reach it — and sign-in works from either address, because trustedOrigins
   * derives from the request URL (src/auth.ts).
   */
  server: { port: 8787, strictPort: true, host: true },
  define: { __BUILD__: JSON.stringify(stamp(command)) },
  build: {
    // The plugin writes dist/client and dist/remy_sport beneath this.
    outDir: resolve(ROOT, "dist"),
    sourcemap: true,
  },
}));
