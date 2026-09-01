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
 * as `provision.ts` does, and there is one rule about defaults:
 *
 *   **A remote write requires --env. A local or read-only operation does not.**
 *
 * The asymmetry is the point. Defaulting a read to production costs a wrong
 * answer you can see; defaulting a *write* costs a migration applied to the
 * live database by somebody who thought they were on staging.
 */

import { Refused, resolveTarget, resolvedConfig, wrangler, type Target } from "./cloudflare"

type Op = "migrate-remote" | "migrate-local" | "reset-local" | "seed-remote" | "tables-remote" | "tables-local"

/** Remote writes. These refuse without an explicit target. */
const REMOTE_WRITES: Op[] = ["migrate-remote", "seed-remote"]

function target(op: Op, argv: string[]): Target {
  // The declaration Decision 1 is about. A remote write names its environment or
  // refuses; a local or read-only operation takes the top-level config, which is
  // what `wrangler dev` and the local D1 state already use. The module applies
  // whichever rule it is handed and infers neither — see
  // docs/dev/cloudflare-module.md for why one global policy breaks in both
  // directions.
  return resolveTarget(argv, REMOTE_WRITES.includes(op) ? "explicit" : "ambient")
}

function databaseName(t: Target): string {
  const config = resolvedConfig(t.flag)
  const binding = config.d1_databases[0] as { database_name?: string } | undefined
  if (!binding?.database_name) {
    throw new Refused(`no d1_databases binding resolves for ${t.environment}`)
  }
  return binding.database_name
}

/**
 * Streamed, not captured, and the exit code is the signal.
 *
 * `inherit` matters here beyond tidiness: wrangler writes progress to the same
 * stdout as its result, so piping a seed once killed the deploy with EPIPE.
 */
function run(args: string[], t: Target): void {
  const { code } = wrangler(args, t, { inherit: true })
  if (code !== 0) process.exit(code)
}

const op = process.argv[2] as Op
const argv = process.argv.slice(3)

try {
  const t = target(op, argv)
  const name = databaseName(t)

  switch (op) {
    case "migrate-remote":
      console.log(`cf-d1: applying migrations to "${name}" [${t.environment}, remote]`)
      run(["d1", "migrations", "apply", name, "--remote"], t)
      break
    case "migrate-local":
      run(["d1", "migrations", "apply", name, "--local"], t)
      break
    case "reset-local":
      // Local state only. Named for the database so the message cannot claim to
      // have reset something it did not.
      Bun.spawnSync(["rm", "-rf", ".wrangler/state/v3/d1"])
      run(["d1", "migrations", "apply", name, "--local"], t)
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
      run(["d1", "execute", name, "--remote", "--file=src/db/seed.sql"], t)
      break
    case "tables-remote":
      run(
        ["d1", "execute", name, "--remote", "--command", "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"],
        t,
      )
      break
    case "tables-local":
      run(
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
