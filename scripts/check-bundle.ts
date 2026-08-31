/**
 * The service worker must not contain the server.
 *
 * `src/web/sw.ts` imports `PushBody` from `src/api/push.ts`, so the worker and
 * the sender cannot drift about the payload shape. That is only safe while the
 * import *erases*: `import type` compiles to nothing, and the worker bundle
 * stays the ~20KB of workbox and two event handlers that it should be.
 *
 * ## Why `verbatimModuleSyntax` is not enough
 *
 * It was turned on for this, and it catches half of it: changing
 * `import type { PushBody }` to `import { PushBody }` is now a typecheck error.
 * It does not catch the case that is actually tempting — adding a *real* value
 * to the same module and importing it, a shared const alongside the type. That
 * typechecks perfectly, and measured on 2026-08-31 it took the worker bundle
 * from 19,791 bytes to 387,122, with drizzle inside it, on a file that runs on
 * somebody's phone.
 *
 * So the guarantee lives here, where it can be stated directly, rather than
 * being inferred from an import style. This was checked once by hand with grep;
 * a fact worth grepping for once is worth asserting on every run.
 *
 * ## Two assertions, because either alone is escapable
 *
 * The named modules say *what* leaked and are the useful failure message. The
 * size ceiling catches a leak this list has not learned about yet — a different
 * ORM, a date library, the whole domain model — which is the failure the named
 * list is least able to predict.
 */

import { existsSync, readFileSync, statSync } from "fs"
import { resolve } from "path"

const SW = resolve(import.meta.dir, "../dist/web/sw.js")

/**
 * Modules that have no business running in a service worker.
 *
 * Server-only, or app-only. `@orpc/client` is in the SPA legitimately and is
 * still wrong here: the worker talks to the API with bare `fetch`, precisely so
 * it carries no client.
 */
const FORBIDDEN = ["drizzle", "hono", "@orpc", "better-auth", "react"]

/**
 * Measured at 20,283 bytes with workbox's precache manifest included.
 *
 * Roughly double, so a legitimate handler can be added without anyone editing
 * this, and a leaked dependency cannot hide under it — the one that prompted
 * this check was 19x.
 */
const CEILING = 45_000

if (!existsSync(SW)) {
  console.error(
    `check-bundle: ${SW} not found — run 'mise run web:build' first.\n` +
      "  This task depends on it, so reaching here means the build did not produce a worker.",
  )
  process.exit(1)
}

const source = readFileSync(SW, "utf8")
const size = statSync(SW).size
const problems: string[] = []

const leaked = FORBIDDEN.filter((name) => source.includes(name))
if (leaked.length) {
  problems.push(
    `the service worker bundle contains ${leaked.join(", ")}.\n` +
      "    Something in src/web/sw.ts imports a *value* from server or app code.\n" +
      "    A type is fine and erases; a shared const does not. Move the value, or\n" +
      "    duplicate it — a copied string is cheaper than shipping an ORM to a phone.",
  )
}

if (size > CEILING) {
  problems.push(
    `the service worker bundle is ${size.toLocaleString()} bytes, over the ${CEILING.toLocaleString()} ceiling.\n` +
      "    It was 20,283 when that was set. Find what it started importing before\n" +
      "    raising this — the bundle is downloaded by every visitor and runs with\n" +
      "    no page open.",
  )
}

if (problems.length) {
  console.error("check-bundle: the service worker is carrying code it should not\n")
  for (const p of problems) console.error(`  ${p}\n`)
  process.exit(1)
}

console.log(
  `check-bundle: the service worker is ${size.toLocaleString()} bytes and carries none of ${FORBIDDEN.join(", ")}`,
)
