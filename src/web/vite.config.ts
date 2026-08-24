import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Hash routing only — required for Tauri webview compatibility.
// See remy-sport-biz/decisions/decision-003-frontend-targets.md.
const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: __dirname,
  plugins: [react()],
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
    },
  },
});
