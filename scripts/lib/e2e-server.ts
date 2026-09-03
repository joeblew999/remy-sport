/**
 * The Worker the e2e tier tests against — its own, sharing nothing.
 *
 * It used to reuse whatever was on :8787, which is the dev server when one is
 * running. Three separate problems came out of that one decision, and each got
 * its own workaround before the cause was named:
 *
 *   the assets   `wrangler.toml` binds [assets] to ./dist/web, which the dev
 *                watcher rewrites on every save. A rebuild mid-run is a page
 *                served with a half-written chunk.
 *   the database e2e bans people, revokes sessions and signs out devices. On a
 *                shared D1 that is the developer's data, mutated by a test run
 *                they did not start — mystery bans, sessions gone mid-work.
 *   the deploy   `3-deploy` runs the e2e tier, so deploying meant stopping the
 *                dev server. First that was an instruction to the operator,
 *                then a stop/restart the script performed. Both are the same
 *                workaround for a Worker that should never have been shared.
 *
 * So: its own port, its own assets built from source, its own D1 under
 * `.wrangler/e2e`. Nothing it touches is anything a person is using.
 *
 * ## Why a script rather than a shell chain in the config
 *
 * Playwright's `webServer.command` is one string, and this is three steps that
 * must happen in order and can each fail with a reason worth reading. A `&&`
 * chain reports "command failed" for all of them.
 *
 * The last step `exec`s wrangler rather than spawning it, so Playwright's
 * process supervision applies to the Worker itself — a spawned grandchild
 * outlives the run and holds the port.
 */
import { existsSync, rmSync } from "fs"

const PORT = 8788
const PERSIST = ".wrangler/e2e"
const ASSETS = "dist/e2e"

function must(label: string, argv: string[]): void {
  const proc = Bun.spawnSync(argv, { stdout: "pipe", stderr: "pipe" })
  if (proc.exitCode !== 0) {
    process.stderr.write(proc.stdout?.toString() ?? "")
    process.stderr.write(proc.stderr?.toString() ?? "")
    console.error(`e2e-server: ${label} failed — the tier cannot start`)
    process.exit(1)
  }
}

/**
 * Built from source, not copied from dist/web.
 *
 * A copy would be a point-in-time snapshot of a directory something else is
 * writing, which is a smaller version of the same race. `vite build` reads src.
 */
must("build assets", [
  "bun", "x", "vite", "build",
  "--config", "src/web/vite.config.ts",
  "--outDir", `../../${ASSETS}`,
  "--emptyOutDir",
  "--logLevel", "warn",
])

/**
 * A fresh database every run, which is the point of owning one.
 *
 * Sessions, bans and revocations accumulate: "sign out all other devices leaves
 * exactly the current one" expected six and found seven, because the previous
 * run's sessions were still there. Sharing the dev database hid this by being
 * unpredictable in a different way — there was never a known starting state to
 * notice drifting from.
 *
 * Cheap because it is only migrations: the seed arrives afterwards over
 * /api/seed, and D1 here is a local SQLite file with nothing to tear down.
 */
rmSync(PERSIST, { recursive: true, force: true })

/**
 * Migrations into this tier's own D1, which starts empty on a fresh machine.
 *
 * The seed is not applied here: `tests/e2e/seed.setup.ts` does it through
 * `/api/seed` once the Worker is up, which is also how a deployment is seeded —
 * so the tier exercises the same path rather than a second one that could
 * disagree with it.
 */
must("migrate", [
  "bun", "x", "wrangler", "d1", "migrations", "apply", "remy-sport-db",
  "--local", "--persist-to", PERSIST,
])

if (!existsSync(`${ASSETS}/index.html`)) {
  console.error(`e2e-server: ${ASSETS} has no index.html after a successful build`)
  process.exit(1)
}

// `--host localhost` for the same reason the dev tasks pass it: with a
// [[routes]] block, plain `wrangler dev` simulates that route and every request
// arrives as the production hostname. check/conventions.ts asserts it is here.
const wrangler = Bun.spawn(
  [
    "bun", "x", "wrangler", "dev",
    "--host", "localhost",
    "--port", String(PORT),
    "--persist-to", PERSIST,
    "--assets", ASSETS,
  ],
  { stdout: "inherit", stderr: "inherit" },
)
process.on("SIGTERM", () => wrangler.kill())
process.on("SIGINT", () => wrangler.kill())
await wrangler.exited
