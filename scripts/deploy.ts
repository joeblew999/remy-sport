/**
 * The deploy pipeline, in one place, in order.
 *
 * It was ten `mise run` lines inside a TOML string. That worked, and hid two
 * things. Ordering was expressed by line position in a shell block nothing could
 * check — and the ordering matters: migrations must land before the code that
 * needs them (migration 0007 taught that), and secrets before the version that
 * carries them. And `cf:wait` polled `{{env.CF_DEPLOY_URL}}`, which is
 * production's hostname, so a staging deploy would have waited on the wrong
 * origin until it timed out.
 *
 * Here the origin comes from the resolved config for the environment being
 * deployed, so staging waits on staging. Same reader `check-envs` uses, which is
 * what proves the two hostnames are disjoint in the first place.
 *
 * Every step is still its own script. This owns the order, not the work.
 */

import { run as provision } from "./cf-provision"
import { Refused, resolveTarget, resolvedConfig, wrangler, type Target } from "./cloudflare"

/** Where this environment actually serves, from the config it deploys with. */
function originOf(t: Target): string {
  const config = resolvedConfig(t.flag)
  const routes = (config.routes ?? []) as Array<{ pattern?: string }>
  const pattern = routes[0]?.pattern
  if (!pattern) {
    throw new Refused(
      `no [[routes]] pattern resolves for ${t.environment}, so there is no origin to verify.\n` +
        "  A deploy that cannot be checked afterwards is not one worth performing.",
    )
  }
  return `https://${pattern.replace(/\/\*$/, "")}`
}

function step(label: string, argv: string[], env: Record<string, string> = {}): void {
  console.log(`\n── ${label}`)
  const proc = Bun.spawnSync(argv, {
    stdout: "inherit",
    stderr: "inherit",
    env: { ...process.env, ...env } as Record<string, string>,
  })
  if (proc.exitCode !== 0) throw new Refused(`${label} failed`)
}

/**
 * Wait for the origin to serve the build just published.
 *
 * Two distinct problems, both of which broke a deploy. A freshly bound custom
 * domain is not immediately usable — DNS and certificate issuance take minutes,
 * and the first deploy died with getaddrinfo ENOTFOUND. And `wrangler deploy`
 * returns before the version has propagated, which polling /api/health cannot
 * detect, because the OLD worker answers that happily.
 *
 * So this compares the build stamp the origin reports against the one in the
 * local versions.json. `_generated` rather than the commit: the commit only
 * changes when you commit, so deploying uncommitted work would match stale code.
 */
async function waitForOrigin(origin: string): Promise<void> {
  const local = (await Bun.file("versions.json").json()) as { current?: { _generated?: string } }
  const want = local.current?._generated
  if (!want) throw new Refused("no _generated stamp in versions.json — run `mise run versions` first")

  for (let i = 0; i < 60; i++) {
    const got = await fetch(`${origin}/api/versions`, { signal: AbortSignal.timeout(10_000) })
      .then((r) => (r.ok ? (r.json() as Promise<{ current?: { _generated?: string } }>) : null))
      .then((d) => d?.current?._generated ?? "")
      .catch(() => "")
    if (got === want) {
      console.log(`   ${origin} is serving ${want}`)
      return
    }
    if (got) console.log(`   origin still serving ${got}, want ${want}`)
    await Bun.sleep(5_000)
  }
  throw new Refused(`${origin} never reported ${want} within 5 minutes`)
}

try {
  // Inside the boundary, so a missing --env prints the refusal rather than a
  // stack trace. It was at module top level, where nothing could catch it.
  const target = resolveTarget(process.argv.slice(2), "explicit")
  const ORIGIN = originOf(target)
  console.log(`deploy: ${target.environment} → ${ORIGIN}`)

  // The gate. Nothing reaches the account until these pass.
  step("check", ["mise", "run", "check"])
  step("auth schema is current", ["mise", "run", "auth:schema:check"])
  step("test", ["mise", "run", "test"])
  step("stamp the build", ["mise", "run", "versions"])

  /**
   * Bootstrap before deploy, and it is one call rather than four.
   *
   * It does D1, its migrations, R2, both queues and every secret, and it is
   * idempotent — so the pre-deploy run creates what is missing and a second run
   * fills in whatever needed the Worker to exist first.
   *
   * Migrations run BEFORE the publish. They used to run after, which survived
   * only while every migration was additive: old code ignored new columns.
   * Migration 0007 broke that — better-auth 1.7 matches sign-in on
   * account.issuer, so a Worker published ahead of it queries a column that does
   * not exist and every sign-in fails until the migration lands.
   *
   * Secrets before the code, so the version the publish creates is the last one
   * and is already complete. A `secret put` after the deploy publishes a further
   * version, and for a few seconds the edge still answers from the one before —
   * which failed a push smoke check on a deploy whose keys were in fact correct.
   */
  console.log(`\n── provision`)
  // Imported, not spawned: cf-provision exports run() behind an import.meta.main
  // guard precisely so a caller can use it as a function, and a thrown Refused
  // carries more than an exit code.
  await provision(["--env", target.environment], "apply")

  console.log(`\n── publish`)
  const published = wrangler(["deploy"], target, { inherit: true })
  if (published.code !== 0) throw new Refused("publish failed")

  console.log(`\n── wait for ${ORIGIN}`)
  await waitForOrigin(ORIGIN)

  step("seed", ["bun", "scripts/cf-d1.ts", "seed-remote", "--env", target.environment])
  step("smoke", ["bun", "scripts/smoke.ts"], { CF_DEPLOY_URL: ORIGIN })

  console.log(`\ndeploy: ${target.environment} is live at ${ORIGIN}\n`)
} catch (err) {
  if (err instanceof Refused) {
    console.error(`\ndeploy: ${err.message}\n`)
    process.exit(1)
  }
  throw err
}
