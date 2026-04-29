#!/usr/bin/env bun
/**
 * Serve the design prototype (docs/design/prototype/) as static files.
 *
 * The prototype uses Babel-via-CDN to compile JSX in-browser, so it must
 * be served over HTTP (file:// trips CORS on the local <script src=...>
 * imports). Run with `mise run design:serve` or `bun run scripts/serve-design.ts`.
 */
import { resolve } from "node:path";

const PORT = Number(process.env.DESIGN_PORT ?? 5174);
const ROOT = resolve(import.meta.dir, "..", "docs", "design", "prototype");

let server;
try {
  server = Bun.serve({
    port: PORT,
    hostname: "127.0.0.1",
    async fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname === "/" ? "/index.html" : url.pathname;
      const file = Bun.file(`${ROOT}${path}`);
      if (await file.exists()) return new Response(file);
      return new Response("Not Found", { status: 404 });
    },
  });
} catch (e) {
  console.error(`Could not start server on port ${PORT}: ${e}`);
  console.error(`Try: DESIGN_PORT=5175 mise run design:serve`);
  process.exit(1);
}

const url = `http://localhost:${server.port}/`;
console.log(`Design prototype → ${url}`);
console.log(`Serving from ${ROOT}`);
console.log("Press Ctrl+C to stop.");
setTimeout(() => {
  Bun.spawn(["open", url]).exited.catch(() => {});
}, 500);
