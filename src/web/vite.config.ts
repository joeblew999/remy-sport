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
  },
});
