import { localBrowserState } from "../../scripts/lib/local-browser.ts";
import { stamp } from "../../scripts/lib/build-stamp.ts";
import { i18nOptions } from "../../scripts/lib/i18n.ts";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
// Tailwind, because shadcn's components are written in it. It processes the
// stylesheet index.html links (src/web/styles.css) and nothing else changes;
// see docs/done/2026-09-08-01-typography-and-design-system.md, Stage B1.
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { paraglideVitePlugin } from "@inlang/paraglide-js";
import { VitePWA } from "vite-plugin-pwa";
import { installName } from "./lib/install-name.ts";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

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
 * `--mode render` leaves the Cloudflare plugin out: the render tier is a
 * browser against a static file server and starts no Worker.
 *
 * No build-time version constant: `git commit` moves HEAD without touching any
 * file the bundle is built from, so a baked-in `rev-parse HEAD` carries the
 * previous commit forever. build-stamp.tsx compares content hashes instead.
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
 * A dev server that no service worker can shadow.
 *
 * A browser that once loaded a build from this origin still holds a `/sw.js`
 * registration made as a classic script, and that worker answers every
 * navigation from its precache — so `bun run dev` shows the old build, edit
 * after edit. It cannot update itself out of the way: in dev the plugin serves
 * `/sw.js` as an ES module, which a classic registration cannot load, and the
 * failure is silent.
 *
 * So in dev `/sw.js` is a classic script whose whole job is to leave: install,
 * unregister, reload every tab it controls. main.tsx then registers the dev
 * worker at `/dev-sw.js?dev-sw`. tests/e2e/dev-worker.spec.ts holds it.
 *
 * `serve` only, and before the plugin: a build writes the real worker there.
 */
/**
 * The deep-link association files, as build artefacts.
 *
 * `.well-known/apple-app-site-association` and `assetlinks.json` were Worker
 * routes reading four env vars. They are static JSON that changes only when
 * the app identifiers change, so they belong to the client build — and only
 * Vite may write into dist/client, which the plugin owns and rewrites.
 *
 * **Nothing is emitted when the identifiers are unset**, so the path 404s from
 * the asset store exactly as the route did. That is deliberate rather than
 * tidy: Apple caches the AASA aggressively, and a placeholder with wrong IDs
 * is worse than no file at all. None of the four is set in any environment
 * today.
 *
 * No extension on the Apple path, and `application/json` on both: Apple's
 * crawler requires that exact path and type, and will not follow a redirect.
 */
function deepLinkAssociations(): Plugin {
  const appleId = () =>
    process.env.APPLE_TEAM_ID && process.env.APPLE_BUNDLE_ID
      ? `${process.env.APPLE_TEAM_ID}.${process.env.APPLE_BUNDLE_ID}`
      : null;
  return {
    name: "remy:deep-link-associations",
    apply: "build",
    generateBundle() {
      // The Worker build runs through this config too; these are client assets.
      if (this.environment?.name !== "client") return;

      const appId = appleId();
      if (appId) {
        this.emitFile({
          type: "asset",
          fileName: ".well-known/apple-app-site-association",
          source: JSON.stringify({
            applinks: {
              details: [
                {
                  appIDs: [appId],
                  // Every SPA route is reachable by universal link. The SPA uses
                  // hash routing, so the server only ever sees /app.
                  components: [{ "/": "/app*", comment: "SPA and all hash routes beneath it" }],
                },
              ],
            },
            // Declared so the same file works if Handoff or App Clips arrive.
            webcredentials: { apps: [appId] },
          }),
        });
        /**
         * The AASA path carries no extension, by Apple's requirement, so the
         * asset store infers no Content-Type and serves it with none at all —
         * measured, not assumed. Apple demands `application/json`, so the
         * header is stated here. The Worker route this replaced set it
         * explicitly; dropping it would have been a silent regression that
         * only an iPhone would have shown.
         *
         * Emitted only beside the file it describes, and only as long as no
         * other `_headers` exists in this build to collide with.
         */
        this.emitFile({
          type: "asset",
          fileName: "_headers",
          source: "/.well-known/apple-app-site-association\n  Content-Type: application/json\n",
        });
      }

      const pkg = process.env.ANDROID_PACKAGE_NAME;
      const fingerprint = process.env.ANDROID_CERT_FINGERPRINT;
      if (pkg && fingerprint) {
        this.emitFile({
          type: "asset",
          fileName: ".well-known/assetlinks.json",
          source: JSON.stringify([
            {
              relation: ["delegate_permission/common.handle_all_urls"],
              target: {
                namespace: "android_app",
                package_name: pkg,
                sha256_cert_fingerprints: [fingerprint],
              },
            },
          ]),
        });
      }
    },
  };
}

function legacyWorkerKillSwitch(): Plugin {
  const script = [
    "// The old worker's way out — legacyWorkerKillSwitch in src/web/vite.config.ts.",
    "self.addEventListener('install', () => self.skipWaiting());",
    // Claim first: a tab is only listed, and only reloaded, by the worker that
    // controls it — and the claim itself fires `controllerchange`, which the
    // shell's own registration code answers with a reload. WebKit needed that
    // path; Chromium reloaded on `navigate` alone. Both are kept, and a
    // `navigate` an engine refuses must not stop the worker leaving.
    "self.addEventListener('activate', (event) => event.waitUntil(",
    "  self.clients.claim()",
    "    .then(() => self.registration.unregister())",
    "    .then(() => self.clients.matchAll({ type: 'window' }))",
    "    .then((clients) => Promise.all(clients.map((client) => client.navigate(client.url).catch(() => undefined)))),",
    "));",
    "",
  ].join("\n");
  return {
    name: "remy:legacy-worker-kill-switch",
    apply: "serve",
    enforce: "pre",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if ((req.url ?? "").split("?")[0] !== "/sw.js") return next();
        res.setHeader("Content-Type", "text/javascript");
        res.setHeader("Cache-Control", "no-store");
        res.end(script);
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

/**
 * The Add to Home Screen name, per environment.
 *
 * The mapping lives in `lib/install-name.ts`, imported here and by
 * `tests/repo/manifest.test.ts`, so the build and the check share one table.
 * It is keyed off the single `environment` value computed in `defineConfig` —
 * the same one `stamp()` bakes into `__BUILD__.environment` — so the manifest
 * name and the reported environment share one source of truth and cannot
 * disagree.
 */
export default defineConfig(({ mode, command }) => {
  // The single source of truth for which environment this build is for. It
  // feeds both `__BUILD__.environment` (via `stamp`) and the manifest's
  // install name, so the two cannot disagree. See `installName` above.
  const environment = process.env.CLOUDFLARE_ENV ?? (command === "serve" ? "dev" : "production");
  const { name, short_name } = installName(environment);
  return {
  root: __dirname,
  // `@/` is this directory: shadcn's components import `@/lib/utils` and
  // `@/components/ui/...` (components.json `aliases`). tsconfig.json carries
  // the same mapping for the type checker.
  resolve: { alias: { "@": __dirname } },
  plugins: [
    legacyWorkerKillSwitch(),
    deepLinkAssociations(),
    tailwindcss(),
    ...(mode === "render"
      ? []
      : [
          cloudflare({
            configPath: resolve(ROOT, "wrangler.toml"),
            // The same local D1 that `wrangler d1 migrations apply --local`
            // writes, so the database the tests migrate is the one dev serves.
            persistState: { path: mode === "e2e" ? localBrowserState(process.env.E2E_STATE_DIR) : resolve(ROOT, ".wrangler/state") },
          }),
          seedOnStart(),
        ]),
    react({
      /**
       * No Fast Refresh for the entry, and this is why.
       *
       * Fast Refresh gives every module a self-import by its bare URL. After
       * the first edit of a session Vite serves the entry as `main.tsx?t=…`,
       * and a URL with a query is a different module — so the entry ran twice:
       * two React roots, two QueryClients, two apps on one hash. Sign-in
       * happened in the visible one while the ghost held the visitor session
       * and bounced you to login from a page you were allowed on.
       *
       * Only the entry is affected, because the HTML names it rather than
       * another module. It cannot hot-refresh anyway, so excluding it costs
       * nothing. tests/e2e/dev-entry.spec.ts holds it.
       */
      exclude: [/\/node_modules\//, /\/src\/web\/main\.tsx$/],
    }),
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
        name,
        short_name,
        description: "Basketball events, teams and live scoring for Thailand.",
        /**
         * The app's identity, which is not its URL.
         *
         * Without this the browser identifies the installed app by `start_url`,
         * so changing that — the one field most likely to change, since it is a
         * route — orphans every existing install and offers a second copy. `/`
         * is what the browser was already deriving, so declaring it now costs
         * nothing and pins it.
         *
         * It is also what `<pwa-install>` 0.7.0 will need: its Web Install API
         * path skips `navigator.install()` when neither the element's
         * `manifest-id` nor the manifest's own `id` is set, falls back to a
         * retained `beforeinstallprompt`, and reports a `DataError` if there
         * isn't one. The version bump that carries the Thai locale carries that
         * too (khmyznikov/pwa-install#170).
         */
        id: "/",
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
        /**
         * What the install dialog shows before a reader commits.
         *
         * `<pwa-install>` reads these for its gallery, and Chromium's install
         * UI for its richer card. Without them both fall back to a bare name
         * and icon.
         *
         * One of each form factor is required, not stylistic: the component
         * filters by `deviceFormFactor()`, so a phone shown only `narrow`
         * entries would open an empty gallery if this listed the desktop shot.
         *
         * Both are promoted from the screenshot walk by `bun run ops
         * screenshots` and committed, because the walk needs a seeded database
         * and a running Worker and a build may not depend on that. Listed
         * rather than globbed for the same reason the icons are, and the sizes
         * are checked against the actual files by tests/repo/manifest.test.ts —
         * a manifest that misdescribes its own screenshot is ignored silently
         * by the browser, which is the failure mode this whole file is careful
         * about.
         */
        screenshots: [
          {
            src: "screenshot-wide.png",
            sizes: "1280x900",
            type: "image/png",
            form_factor: "wide",
            label: "Events, teams and live scores",
          },
          {
            src: "screenshot-narrow.png",
            sizes: "390x844",
            type: "image/png",
            form_factor: "narrow",
            label: "Follow a team from your phone",
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
   * The two dependencies the scanner cannot find on its own.
   *
   * Vite pre-bundles what it reaches by walking static imports. Both of these
   * are reached only dynamically — `workbox-window` through
   * `import("virtual:pwa-register")`, `workbox-precaching` from the service
   * worker's separate entry — so Vite discovers them mid-session and broadcasts
   * a full reload to every open page. In the e2e tier that lands in the middle
   * of a test and fails a different spec each run.
   *
   * Naming them bundles them at startup, when no page is open to reload.
   * docs/done/2026-09-09-18-browser-tier-flakiness.md.
   */
  optimizeDeps: { include: ["workbox-window", "workbox-precaching"] },
  /**
   * One port, the one everything else in this repo already knows: the tunnel's
   * ingress, `.dev.vars`' BETTER_AUTH_URL, the e2e tier's baseURL, Tauri's
   * devUrl. `host: true` binds every interface so a phone on the same wifi can
   * reach it — and sign-in works from either address, because trustedOrigins
   * derives from the request URL (src/auth.ts).
   */
  server: {
    port: mode === "e2e" ? 8788 : 8787,
    strictPort: true,
    host: true,
    /**
     * Vite answers only localhost and IP hosts unless told otherwise, so a
     * request arriving through the dev tunnel — Host: dev-remy… — was a 403
     * "Blocked request" and `bun run ops tunnel -- --run` served nothing. The
     * hostname comes from mise's [env], the same place the tunnel reads it.
     */
    allowedHosts: process.env.TUNNEL_HOSTNAME ? [process.env.TUNNEL_HOSTNAME] : [],
  },
  define: { __BUILD__: JSON.stringify(stamp(command, environment)) },
  build: {
    // The plugin writes dist/client and dist/remy_sport beneath this.
    outDir: resolve(ROOT, "dist"),
    /**
     * Empty it first, which Vite will not do on its own here.
     *
     * `emptyOutDir` defaults to true only when the output is inside the Vite
     * root. This root is `src/web` and the output is `<repo>/dist`, so Vite
     * silently refused and every build's hashed assets accumulated — hundreds
     * of megabytes, all uploaded on every deploy and all precached.
     *
     * A service worker must fetch every precache entry before it installs, and
     * one that never installs never activates: the previous worker goes on
     * answering from its own cache, so readers keep a stale build indefinitely
     * while `/api/versions` correctly reports the new one.
     *
     * The trade: for the length of a build `dist/client` is empty and a server
     * reading it answers 404. Deploy builds and publishes in sequence so it
     * cannot see that window; a watcher under a running preview can.
     */
    emptyOutDir: true,
    sourcemap: true,
  },
  };
});
