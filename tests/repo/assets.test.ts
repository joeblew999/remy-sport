/**
 * No built asset may shadow a Worker route.
 *
 * `wrangler.toml` serves assets *first* — the default, and the right choice:
 * a hashed bundle answered by the asset store costs nothing, where the same
 * request through the Worker is billed and writes an observability log.
 *
 * The cost of that choice is stated in wrangler.toml and is real: **a new
 * top-level file in `dist/web` that collides with a Worker route would silently
 * win it.** Silently is the word that matters. Nothing would throw. `/doc` would
 * start returning a static file, or `/api` would stop being an API, and the
 * first sign would be a support question.
 *
 * So the invariant is checked rather than remembered. The Worker's routes come
 * from Hono itself — `app.routes` — not from a list here that could fall behind
 * the routes it claims to describe.
 *
 * Only top-level names matter. Assets live at `/index.html` and `/assets/*`;
 * a collision can only happen at the first path segment, because that is all
 * the asset store matches on before the Worker is consulted.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
// The named export, not the default. The Worker's default became
// `{ fetch, scheduled }` when it grew a cron trigger, and `.routes` is not on
// it — a check that reads a route table has to fail loudly or not at all.
import { app } from "../../src/index"
import { rule } from "./helpers"

const ROOT = resolve(import.meta.dirname, "../..")
const DIST = resolve(ROOT, "dist/web")

const wrangler = readFileSync(resolve(ROOT, "wrangler.toml"), "utf8")
// Nothing to check when assets run *after* the Worker (a collision cannot
// happen), or when the SPA is not built (`bun run check` does not build it —
// say so rather than passing on an absence, which would read as "no collisions").
const skipped = /^\s*run_worker_first\s*=\s*true/m.test(wrangler)
  ? "run_worker_first is on — the Worker wins every route, nothing to check"
  : !existsSync(DIST)
    ? "dist/web is not built — run 'bun run build' to check for real"
    : null

/** Every first path segment the Worker answers on, from the router itself. */
const routes = (app as unknown as { routes: { path: string }[] }).routes
const owned = new Set<string>()
for (const r of routes) {
  const first = r.path.split("/").filter(Boolean)[0]
  // `*` is the catch-all that forwards to the asset store, and `:id` is a
  // parameter — neither is a name a file could collide with.
  if (first && first !== "*" && !first.startsWith(":")) owned.add(first)
}

const built = skipped ? [] : readdirSync(DIST)
const clashes = built.filter((name) => owned.has(name))

rule(
  "no built asset shadows a route the Worker owns",
  clashes,
  `check-assets: ${clashes.length} built asset(s) would shadow a Worker route:\n` +
    clashes.map((c) => `  dist/web/${c} wins over the Worker's /${c}`).join("\n") +
    `\n\nAssets are served first (wrangler.toml). Rename the file, or move it under\n` +
    `assets/, or set run_worker_first and accept the cost stated there.`,
  skipped
    ? `check-assets: ${skipped}`
    : `check-assets: ${built.length} built path(s), none shadow the ${owned.size} the Worker owns ` +
        `(${[...owned].sort().join(", ")})`,
)
