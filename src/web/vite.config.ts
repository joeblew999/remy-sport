import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { paraglideVitePlugin } from "@inlang/paraglide-js";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Hash routing only — required for Tauri webview compatibility.
// See remy-sport-biz/decisions/decision-003-frontend-targets.md.
const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: __dirname,
  plugins: [
    react(),
    // UI copy is compiled, not looked up at runtime: a missing key is a build
    // error and unused messages are tree-shaken out. The locale list in
    // project.inlang/settings.json is derived from the model's ALL_LOCALES,
    // so the languages the interface can be written in are the languages the
    // data is available in — one list, not two.
    paraglideVitePlugin({
      project: resolve(__dirname, "../../project.inlang"),
      // Up a level: the Worker sends email using the same messages, so they
      // are the product's copy rather than the SPA's. src/web must not be a
      // dependency of src/.
      outdir: resolve(__dirname, "../paraglide"),
      // We own the locale (lib/locale.tsx: localStorage, then the browser's
      // preference). Paraglide reads it through overwriteGetLocale rather than
      // keeping a cookie of its own, so there is one source of truth for which
      // language the reader is in.
      strategy: ["globalVariable", "baseLocale"],
    }),
    /**
     * The manifest and service worker, without which iOS will not install this
     * as an app and Web Push cannot work at all.
     *
     * Installing it before this existed put a screenshot of the page on the
     * home screen, because index.html referenced no manifest and no icons.
     *
     * `injectRegister: null` is the load-bearing option. The plugin's default
     * writes a registration snippet into index.html — and Tauri loads that same
     * index.html on desktop and iOS, where a service worker is at best dead
     * weight and at worst caches the app shell against a native build. One
     * bundle serves all three targets (decision-003), so this cannot be a build
     * flag; registration happens in main.tsx, guarded on the same
     * `__TAURI_INTERNALS__` check the logger already uses.
     *
     * The icons are the files `mise run brand:icons` cuts from brand.svg. They
     * are listed rather than globbed so a missing one is a failed build instead
     * of a manifest that quietly offers fewer sizes than it claims.
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
      // against `mise run dev` instead of only against a deploy. Without this,
      // `navigator.serviceWorker.register` 404s in dev and every push feature
      // is untestable until it is live — which is how you ship a broken one.
      devOptions: { enabled: true, type: "module" },
    }),
  ],
  base: "./",
  /**
   * `vite preview` proxies nothing. This is not a tidy-up.
   *
   * Vite defaults `preview.proxy` to `server.proxy`, so the render tier — which
   * describes itself as "no Worker, no database, no sign-in" — quietly became an
   * integration tier whenever `mise run dev` happened to be running: `/api` and
   * `/rpc` reached the real Worker, the profile page got a 401 from an endpoint
   * that should not have been reachable, and the page stopped responding.
   *
   * It cost two rounds of chasing, because the symptom was four mobile-layout
   * timeouts that named the layout and never the network, and the workaround was
   * to stop the tunnel for every test run. An empty proxy makes the tier what it
   * says it is, and makes the result the same whether or not a Worker is up.
   */
  preview: { proxy: {} },
  build: {
    outDir: resolve(__dirname, "../../dist/web"),
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 5175,
    strictPort: true,
    // Bind every interface, not just loopback. The whole point of this server
    // is a fast loop, and a layout bug you can only reproduce on a phone is not
    // one you can iterate on from localhost — `mise run tunnel:quick` and a
    // handset both need to reach it. Same reason `dev` passes --ip 0.0.0.0.
    host: true,
    // Send the API to the Worker.
    //
    // Without this, `mise run web:dev` serves the SPA but every /api/* call
    // lands on Vite, which has no such route — so the session never resolves,
    // sign-in 404s and every page renders empty. That looked like "the SPA is
    // broken" when the SPA was fine and simply had no backend.
    //
    // Requires `mise run dev` in another terminal. web:dev deliberately does
    // not start the Worker itself: two dev servers under one task is a worse
    // trade than one extra terminal, and the ports differ so both can run.
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: false,
      },
      // The SPA's own client speaks oRPC here; /api stays the REST surface.
      "/rpc": {
        target: "http://localhost:8787",
        changeOrigin: false,
      },
    },
  },
});
