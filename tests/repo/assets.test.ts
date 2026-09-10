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

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { resolve } from "node:path"
// The named export, not the default. The Worker's default became
// `{ fetch, scheduled }` when it grew a cron trigger, and `.routes` is not on
// it — a check that reads a route table has to fail loudly or not at all.
import { app } from "../../src/index"
import { rule } from "./helpers"

const ROOT = resolve(import.meta.dirname, "../..")
const DIST = resolve(ROOT, "dist/client")

const wrangler = readFileSync(resolve(ROOT, "wrangler.toml"), "utf8")
// Nothing to check when assets run *after* the Worker (a collision cannot
// happen), or when the SPA is not built (`bun run check` does not build it —
// say so rather than passing on an absence, which would read as "no collisions").
const skipped = /^\s*run_worker_first\s*=\s*true/m.test(wrangler)
  ? "run_worker_first is on — the Worker wins every route, nothing to check"
  : !existsSync(DIST)
    ? "dist/client is not built — run 'bun run build' to check for real"
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
    clashes.map((c) => `  dist/client/${c} wins over the Worker's /${c}`).join("\n") +
    `\n\nAssets are served first (wrangler.toml). Rename the file, or move it under\n` +
    `assets/, or set run_worker_first and accept the cost stated there.`,
  skipped
    ? `check-assets: ${skipped}`
    : `check-assets: ${built.length} built path(s), none shadow the ${owned.size} the Worker owns ` +
        `(${[...owned].sort().join(", ")})`,
)

/**
 * A service worker that cannot finish installing never replaces the one before
 * it.
 *
 * A worker fetches every precache entry before it installs, and only an
 * installed worker can activate. If the install never finishes, the *previous*
 * worker goes on answering navigations from its own cache — so a returning
 * reader keeps the build they already had, for as long as that takes.
 *
 * On 2026-09-10 that was for ever. `build.emptyOutDir` defaults to false when
 * the output sits outside the Vite root, which it does here, so every build's
 * hashed assets accumulated — **765 files and 575MB** by 2026-09-10 — all of them uploaded and
 * all of them globbed into the manifest — `precache 369 entries (90111.55
 * KiB)`. Production served a week-old interface to anyone who had visited
 * before, while `/api/versions` and `curl` both reported the new one correctly,
 * because neither holds a cache. Emptying the directory took it to 61 entries
 * and 4MB.
 *
 * The number matters more than the count: this is a budget for what a phone on
 * a hotel connection must download before it can be given the new build. Ten
 * megabytes is already generous. If a real change pushes past it, raise it
 * deliberately and say why — the failure mode is not a slow install, it is a
 * reader who never gets the update at all.
 */
const SW = resolve(DIST, "sw.js")
const PRECACHE_BUDGET_MB = 10

/** What the manifest names, weighed on disk — workbox records no sizes. */
const precached = existsSync(SW)
  ? [...new Set([...readFileSync(SW, "utf8").matchAll(/"(?:url":")?((?:assets|fonts)\/[^"]+)"/g)].map((m) => m[1]!))]
  : []
const precacheBytes = precached.reduce((total, url) => {
  const file = resolve(DIST, url)
  return total + (existsSync(file) ? statSync(file).size : 0)
}, 0)
const precacheMb = precacheBytes / 1024 / 1024
const oversized =
  existsSync(SW) && precacheMb >= PRECACHE_BUDGET_MB
    ? [`${precached.length} file(s) totalling ${precacheMb.toFixed(1)}MB`]
    : []

rule(
  "the service worker's precache is small enough to install",
  oversized,
  `check-assets: the precache names ${oversized[0] ?? ""}, over the ${PRECACHE_BUDGET_MB}MB budget.\n\n` +
    `A worker downloads every entry before it installs, and a worker that never\n` +
    `installs never replaces the one already serving this reader. The failure is\n` +
    `not a slow install — it is a reader who never gets the update at all.\n\n` +
    `If dist/client/assets holds bundles from previous builds, the build is not\n` +
    `emptying its output: see build.emptyOutDir in src/web/vite.config.ts.`,
  existsSync(SW)
    ? `check-assets: precache is ${precached.length} file(s), ${precacheMb.toFixed(1)}MB of a ${PRECACHE_BUDGET_MB}MB budget`
    : `check-assets: no sw.js built — run 'bun run build' to check for real`,
)
