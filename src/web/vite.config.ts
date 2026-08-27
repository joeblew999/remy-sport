import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { paraglideVitePlugin } from "@inlang/paraglide-js";
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
      outdir: resolve(__dirname, "paraglide"),
      // We own the locale (lib/locale.tsx: localStorage, then the browser's
      // preference). Paraglide reads it through overwriteGetLocale rather than
      // keeping a cookie of its own, so there is one source of truth for which
      // language the reader is in.
      strategy: ["globalVariable", "baseLocale"],
    }),
  ],
  base: "./",
  build: {
    outDir: resolve(__dirname, "../../dist/web"),
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 5175,
    strictPort: true,
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
