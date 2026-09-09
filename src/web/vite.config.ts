import { localBrowserState } from "../../scripts/lib/local-browser.ts";
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
 * A dev server that no service worker can shadow.
 *
 * Every build registers `/sw.js` as a classic script, and a browser that once
 * loaded a build from this origin — `wrangler dev` serving dist/, before the
 * Vite plugin — still holds that registration. Its worker precaches the whole
 * built shell and answers every navigation from the cache, so `bun run dev`
 * shows the old build, edit after edit. The way out is an update: the browser
 * refetches `/sw.js` on navigation and a worker with different bytes takes
 * over. But in dev vite-plugin-pwa answers `/sw.js` with sw.ts as an ES
 * module, and a registration made as a classic script cannot load an `import`.
 * The update fails silently, every time, and no console shows it: the page's
 * own code is the old build's. Found 2026-09-06, after an hour of edits that
 * changed nothing on screen.
 *
 * So in dev, `/sw.js` is a classic script whose whole job is to leave: it
 * installs, unregisters itself, and reloads every tab it controls. The next
 * load comes from Vite, and main.tsx registers the dev worker the plugin
 * serves at `/dev-sw.js?dev-sw` — which is what dev has used all along.
 * Nothing in dev asks for `/sw.js` except a stale registration, and this is
 * its way out. tests/e2e/dev-worker.spec.ts holds it.
 *
 * `serve` only, and before the plugin so it answers first: a build writes the
 * real worker at that path, and preview serves it.
 */
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
const git = (args: string): string => {
  try {
    return execSync(`git ${args}`, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};
function stamp(command: "build" | "serve", environment: string) {
  const commit = git("rev-parse --short HEAD");
  const repo = process.env.GITHUB_REPO_URL;
  return {
    commit,
    branch: git("branch --show-current"),
    builtAt: process.env.BUILD_ID ?? new Date().toISOString(),
    environment,
    app: (JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as { version: string }).version,
    github: repo && commit ? `${repo}/commit/${git("rev-parse HEAD")}` : null,
  };
}

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
       * Fast Refresh (oxc's, under this plugin) gives every module with a
       * component a self-import — `import * as currentExports from
       * "/main.tsx"` — by its bare URL. After the first edit of a dev session
       * Vite serves index.html with `<script src="./main.tsx?t=…">`, and a
       * URL with a query is a different module from the same URL without
       * one. So the entry ran twice: two React roots on one container, two
       * QueryClients, two apps listening to the same hash. Sign in happened
       * in the one you could see; the ghost still held the visitor's session
       * and bounced you to the login screen from a page you were allowed on.
       * Found 2026-09-06, and it is very likely what made the GUI feel
       * unreliable to work on: it only ever happens on a dev server that has
       * seen an edit, never on a fresh one, never in a build.
       *
       * Every other module's self-import gets its `?t=` rewritten and is the
       * same instance; only the entry, which the HTML names rather than
       * another module, misses out. The entry cannot hot-refresh anyway — a
       * change there is a full reload — so excluding it costs nothing.
       * tests/e2e/dev-entry.spec.ts holds it. `node_modules` stays excluded,
       * as the plugin's own default has it.
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
         * `<pwa-install>` reads these for its gallery — the "Show Gallery"
         * button — and Chromium's own install UI uses them for the richer card
         * it shows instead of a bare name and icon. Without them the dialog we
         * chose *because* its GUI is right was showing its plainest form, and
         * its gallery button had nothing behind it.
         *
         * One of each form factor is required, not stylistic: the component
         * filters the gallery by `deviceFormFactor()`, so a phone in portrait is
         * shown only the `narrow` entries and would open an empty gallery if
         * this listed just the desktop shot.
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
    sourcemap: true,
  },
  };
});
