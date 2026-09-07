/**
 * The deploy pipeline, in one place, in order.
 *
 *   bun run deploy -- --env staging | production
 *
 * Eight steps. Everything before the publish is the gate; everything after it
 * verifies it. Three constraints bind the order, and each has already cost a
 * deploy:
 *
 *   gate before account      nothing touches Cloudflare until check and the
 *                            e2e tier pass.
 *   migrate before publish   migration 0007 taught this: better-auth matches
 *                            sign-in on account.issuer, so a Worker published
 *                            ahead of its migration queries a column that does
 *                            not exist and every sign-in fails until it lands.
 *   nothing else per deploy  the database, the bucket, the queues and the
 *                            secrets are `bun run ops provision`: once per
 *                            environment, and again after a secret group is
 *                            added. A `secret put` after a publish is a further
 *                            version, and for seconds the edge answers from the
 *                            one before — so it is never done here.
 *
 * The origin comes from the resolved config for the environment being deployed,
 * so staging waits on staging — the same reader tests/repo/envs.test.ts uses,
 * which is what proves the two hostnames are disjoint in the first place.
 */

import { spawnSync } from "node:child_process"
import { setTimeout as sleep } from "node:timers/promises"
import { prepare } from "./lib/prepare.ts"
import { Refused, accountId, originOf, resolveTarget, workerName, wrangler, type Target } from "./lib/cloudflare.ts"
import { buildConfig } from "./deploy/build-config.ts"

/**
 * This build's identity, minted here and baked into the Worker by
 * vite.config.ts (`define`), so `wait` can ask the origin whether it is serving
 * THIS build yet. `wrangler deploy` returns before the edge does, and
 * /api/health cannot tell — the old Worker answers it happily. Not the commit:
 * two deploys of one commit are two builds.
 */
const BUILD_ID = new Date().toISOString()

/**
 * How the Vite plugin and wrangler are told which environment: the variable,
 * not the flag. Production is the top-level configuration and has no name.
 */
const envFor = (target: Target): Record<string, string> => (target.flag ? { CLOUDFLARE_ENV: target.flag } : {})

interface Phase {
  name: string
  why: string
  go: (target: Target, origin: string) => void | Promise<void>
}

const PIPELINE: Phase[] = [
  {
    name: "check",
    why: "the gate — nothing reaches the account until it is green",
    go: () => step("check", ["bun", "run", "check"]),
  },
  {
    name: "test",
    why: "end to end, against a local server, before a remote one exists",
    go: () => step("test", ["bun", "scripts/e2e.ts"]),
  },
  {
    name: "build",
    why: "vite builds the Worker and the assets for this environment, with this build's id baked in, and writes the wrangler.json the publish uses",
    go: (target) =>
      step("build", ["bun", "x", "vite", "build", "--config", "src/web/vite.config.ts"], { ...envFor(target), BUILD_ID }),
  },
  {
    name: "migrate",
    why: "the schema before the code that needs it; wrangler applies only what is missing",
    go: (target) => step("migrate", ["bun", "scripts/db.ts", "migrate-remote", "--env", target.environment]),
  },
  {
    name: "publish",
    why: "the only irreversible step, and everything it depends on is already in place",
    go: (target) => publish(target),
  },
  {
    name: "wait",
    why: "until the origin reports this build — the old Worker answers /api/health happily",
    go: (_target, origin) => waitFor(origin),
  },
  {
    name: "seed",
    why: "after the schema is live, so the rows have tables to land in",
    go: (target) => step("seed", ["bun", "scripts/db.ts", "seed-remote", "--env", target.environment]),
  },
  {
    name: "smoke",
    why: "last, because it is the only step that asks the deployment what it is actually serving",
    go: (_target, origin) => step("smoke", ["bun", "scripts/deploy/smoke.ts"], { CF_DEPLOY_URL: origin }),
  },
]

function step(label: string, argv: string[], env: Record<string, string> = {}): void {
  console.log(`\n── ${label}`)
  const proc = spawnSync(argv[0]!, argv.slice(1), {
    stdio: "inherit",
    env: { ...process.env, ...env },
  })
  if (proc.status !== 0) throw new Refused(`${label} failed`)
}

/**
 * The generated config, not wrangler.toml, and NO environment — not the flag,
 * not the variable. The build wrote dist/<worker>/wrangler.json already
 * resolved for the environment CLOUDFLARE_ENV named, with `main` and
 * `assets.directory` pointing at what it built. Naming the environment again
 * is not idempotent: a config with no `env` section plus a named environment
 * makes wrangler fall back to its legacy behaviour and publish a Worker called
 * `remy-sport-staging-staging` — which it did, once, taking the custom domain
 * with it.
 */
function publish(target: Target): void {
  console.log(`\n── publish`)
  const generated = buildConfig("dist", workerName(target), accountId())
  delete process.env.CLOUDFLARE_ENV
  const published = wrangler(["deploy", "--config", generated], undefined, { inherit: true })
  if (published.code !== 0) throw new Refused("publish failed")
}

async function waitFor(origin: string): Promise<void> {
  console.log(`\n── wait for ${origin}`)
  for (let i = 0; i < 60; i++) {
    const got = await fetch(`${origin}/api/versions`, { signal: AbortSignal.timeout(10_000) })
      .then((r) => (r.ok ? (r.json() as Promise<{ current?: { _generated?: string } }>) : null))
      .then((d) => d?.current?._generated ?? "")
      .catch(() => "")
    if (got === BUILD_ID) {
      console.log(`   ${origin} is serving ${BUILD_ID}`)
      return
    }
    if (got) console.log(`   origin still serving ${got}, want ${BUILD_ID}`)
    await sleep(5_000)
  }
  throw new Refused(`${origin} never reported ${BUILD_ID} within 5 minutes`)
}

if (process.argv.includes("--help")) {
  console.log(`
bun run deploy -- --env staging | production

  A remote write names its environment or refuses; there is deliberately no
  default. Everything before the publish is the gate, everything after verifies
  it. Resources and secrets are not here: bun run ops provision --env X --apply

What it runs:
`)
  PIPELINE.forEach((p, i) => console.log(`  ${String(i + 1).padStart(2)}. ${p.name.padEnd(8)} ${p.why}`))
  console.log("")
  process.exit(0)
}

try {
  // Inside the boundary, so a missing --env prints the refusal rather than a
  // stack trace.
  prepare()
  const target = resolveTarget(process.argv.slice(2), "explicit")
  const origin = originOf(target)
  console.log(`deploy: ${target.environment} → ${origin}  (build ${BUILD_ID})`)

  for (const phase of PIPELINE) await phase.go(target, origin)

  console.log(
    `\ndeploy: ${target.environment} is live at ${origin}\n\n` +
      (target.environment === "staging"
        ? "  Then production, when it looks right:\n    bun run deploy -- --env production\n"
        : ""),
  )
} catch (err) {
  if (err instanceof Refused) {
    console.error(`\ndeploy: ${err.message}\n`)
    process.exit(1)
  }
  throw err
}
