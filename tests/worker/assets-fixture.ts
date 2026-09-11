import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"

/**
 * A fixture association file in the served assets, for the one thing only the
 * runtime can answer: does the asset store honour `_headers`?
 *
 * `deepLinkAssociations` in src/web/vite.config.ts emits
 * `.well-known/apple-app-site-association` with no extension, because Apple
 * requires that exact path — and measured, the asset store then serves it with
 * **no Content-Type at all**. A `_headers` file beside it states
 * `application/json`. That contract spans Vite and wrangler, and nothing in
 * the repo tier can see it: one side emits, the other serves.
 *
 * A fixture rather than the real file, because the real one is emitted only
 * when the app identifiers are set and none of them is set in any environment.
 * Waiting for that to be true is waiting for iOS to report the bug.
 *
 * `globalSetup`, not a setup file: worker setup files run inside workerd and
 * have no filesystem, and the assets must exist before the pool reads them.
 * Whatever was there before is restored, so a build that did emit its own
 * files is not clobbered by running the tests.
 */

const ROOT = resolve(import.meta.dirname, "../..")
const ASSETS = join(ROOT, "dist/client")

/**
 * A path of the same *shape* as the association file, not the path itself.
 *
 * `tests/worker/read.test.ts` asserts the real path 404s while the identifiers
 * are unset — which is true, and worth keeping, since none of them is set
 * anywhere. A fixture at that path would make both assertions impossible in
 * one tier.
 *
 * What is under test is the contract, not the filename: an extensionless file
 * that the asset store would otherwise serve with no Content-Type, and a
 * `_headers` entry that gives it one. Any extensionless path demonstrates it,
 * and this one cannot collide with a real emission.
 */
export const AASA_PATH = "/.well-known/fixture-association"
export const FIXTURE_APP_ID = "FIXTURE123.com.remy.test"

const files = {
  [join(ASSETS, ".well-known/fixture-association")]: JSON.stringify({
    applinks: { details: [{ appIDs: [FIXTURE_APP_ID], components: [{ "/": "/app*" }] }] },
    webcredentials: { apps: [FIXTURE_APP_ID] },
  }),
  [join(ASSETS, "_headers")]: `${AASA_PATH}\n  Content-Type: application/json\n`,
}

const saved = new Map<string, string | null>()

export function setup(): void {
  for (const [path, source] of Object.entries(files)) {
    saved.set(path, existsSync(path) ? readFileSync(path, "utf8") : null)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, source)
  }
}

export function teardown(): void {
  for (const [path, before] of saved) {
    if (before === null) rmSync(path, { force: true })
    else writeFileSync(path, before)
  }
  saved.clear()
}
