/**
 * D1 operations that need to name which database they mean.
 *
 * The database name used to come from `CF_D1_NAME`, a mise `[env]` literal
 * pinned to `remy-sport-db`. That is production's, always, whatever `--env` a
 * caller passed — so `cf:d1:migrations:apply:remote` could only ever migrate
 * production and `seed:remote` could only ever seed it. Neither would error;
 * both would do the right thing to the wrong database.
 *
 * So the name is resolved from wrangler config for a named environment, exactly
 * as `cf-provision.ts` does, and there is one rule about defaults:
 *
 *   **A remote write requires --env. A local or read-only operation does not.**
 *
 * The asymmetry is the point. Defaulting a read to production costs a wrong
 * answer you can see; defaulting a *write* costs a migration applied to the
 * live database by somebody who thought they were on staging.
 */

import { resolvedConfig } from "./cf-ensure"
import { Refused, resolveTarget, type Target } from "./cf-provision"

type Op = "migrate-remote" | "migrate-local" | "reset-local" | "seed-remote" | "tables-remote" | "tables-local"

/** Remote writes. These refuse without an explicit target. */
const REMOTE_WRITES: Op[] = ["migrate-remote", "seed-remote"]

function target(op: Op, argv: string[]): Target {
  if (REMOTE_WRITES.includes(op)) return resolveTarget(argv)
  // Local and read-only: the top-level config, which is what `wrangler dev` and
  // the local D1 state already use.
  const named = argv.includes("--env") || argv.some((a) => a.startsWith("--env="))
  return named ? resolveTarget(argv) : { environment: "production" }
}

function databaseName(t: Target): string {
  const config = resolvedConfig(t.flag)
  const binding = config.d1_databases[0] as { database_name?: string } | undefined
  if (!binding?.database_name) {
    throw new Refused(`no d1_databases binding resolves for ${t.environment}`)
  }
  return binding.database_name
}

function wrangler(args: string[], t: Target): void {
  const proc = Bun.spawnSync(
    ["bun", "x", "wrangler", ...args, ...(t.flag ? ["--env", t.flag] : [])],
    { stdout: "inherit", stderr: "inherit" },
  )
  if (proc.exitCode !== 0) process.exit(proc.exitCode)
}

const op = process.argv[2] as Op
const argv = process.argv.slice(3)

try {
  const t = target(op, argv)
  const name = databaseName(t)

  switch (op) {
    case "migrate-remote":
      console.log(`cf-d1: applying migrations to "${name}" [${t.environment}, remote]`)
      wrangler(["d1", "migrations", "apply", name, "--remote"], t)
      break
    case "migrate-local":
      wrangler(["d1", "migrations", "apply", name, "--local"], t)
      break
    case "reset-local":
      // Local state only. Named for the database so the message cannot claim to
      // have reset something it did not.
      Bun.spawnSync(["rm", "-rf", ".wrangler/state/v3/d1"])
      wrangler(["d1", "migrations", "apply", name, "--local"], t)
      console.log(`cf-d1: local D1 for "${name}" rebuilt — run 'mise run dev' for test data`)
      break
    case "seed-remote":
      console.log(`cf-d1: seeding "${name}" [${t.environment}, remote]`)
      /**
       * Applied through wrangler, not through the app. `POST /api/seed` was once
       * an open unauthenticated write on a public domain — 330 statements to
       * anyone who found it. Seeding is an operator action and the operator
       * already holds Cloudflare credentials.
       *
       * Not piped and not parsed: wrangler writes progress to the same stdout as
       * its result, so a pipeline killed the deploy with EPIPE. The exit code is
       * the signal that matters.
       */
      wrangler(["d1", "execute", name, "--remote", "--file=src/db/seed.sql"], t)
      break
    case "tables-remote":
      wrangler(
        ["d1", "execute", name, "--remote", "--command", "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"],
        t,
      )
      break
    case "tables-local":
      wrangler(
        ["d1", "execute", name, "--local", "--command", "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"],
        t,
      )
      break
    default:
      console.error(`cf-d1: unknown operation "${op ?? ""}"`)
      process.exit(1)
  }
} catch (err) {
  if (err instanceof Refused) {
    console.error(`\ncf-d1: ${err.message}\n`)
    process.exit(1)
  }
  throw err
}
