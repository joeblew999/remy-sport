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

import { run as provision } from "./provision"
import { prepare } from "./prepare"
import { Refused, originOf, resolveTarget, wrangler, type Target } from "./cloudflare"

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

/**
 * The pipeline, in order, with each step saying why it is where it is.
 *
 * Order is the whole content of this file, so it is a list rather than a run of
 * statements — a sequence you can read, and whose reasons sit beside the steps
 * they constrain rather than in a comment above the block.
 *
 * Three constraints bind it, and each has already cost a deploy:
 *
 *   gate before account   nothing touches Cloudflare until check and test pass.
 *   migrate before publish  migration 0007 taught this: better-auth matches
 *                         sign-in on account.issuer, so a Worker published ahead
 *                         of its migration queries a column that does not exist
 *                         and every sign-in fails until it lands.
 *   secrets before publish  a `secret put` after the deploy publishes a further
 *                         version, and for seconds the edge answers from the one
 *                         before — which failed a push smoke check on a deploy
 *                         whose keys were in fact correct.
 *
 * Everything after the publish verifies it. A deploy that cannot be checked
 * afterwards is not one worth performing.
 */
interface Phase {
  name: string
  why: string
  go: (target: Target, origin: string) => void | Promise<void>
}

const PIPELINE: Phase[] = [
  {
    name: "check",
    why: "the gate — nothing reaches the account until it is green",
    go: () => step("check", ["mise", "run", "check"]),
  },
  {
    name: "auth schema",
    why: "the generated schema must match auth.config before anything ships it",
    go: () => step("auth schema", ["mise", "run", "auth:schema:check"]),
  },
  {
    name: "test",
    why: "end to end, against a local server, before a remote one exists",
    go: () => step("test", ["bun", "scripts/check.ts", "--e2e"]),
  },
  {
    name: "stamp",
    why: "versions.json is what the origin is later compared against, so it is written before the publish, not after",
    go: () => step("stamp", ["bun", "scripts/versions.ts"]),
  },
  {
    name: "provision",
    why: "D1, its migrations, R2, queues and every secret — idempotent, and BEFORE the publish so the code never runs ahead of its schema",
    go: async (target) => {
      console.log(`\n── provision`)
      // Imported, not spawned: provision.ts exports run() behind an
      // import.meta.main guard precisely so a caller can use it as a function,
      // and a thrown Refused carries more than an exit code.
      await provision(["--env", target.environment], "apply")
    },
  },
  {
    name: "publish",
    why: "the only irreversible step, and everything it depends on is already in place",
    go: (target) => {
      console.log(`\n── publish`)
      const published = wrangler(["deploy"], target, { inherit: true })
      if (published.code !== 0) throw new Refused("publish failed")
    },
  },
  {
    name: "wait",
    why: "wrangler returns before the edge serves the new version, and /api/health cannot tell — the OLD worker answers it happily",
    go: async (_t, origin) => {
      console.log(`\n── wait for ${origin}`)
      await waitForOrigin(origin)
    },
  },
  {
    name: "seed",
    why: "after the schema is live, so the rows have tables to land in",
    go: (target) => step("seed", ["bun", "scripts/db.ts", "seed-remote", "--env", target.environment]),
  },
  {
    name: "smoke",
    why: "last, because it is the only step that asks the deployment what it is actually serving",
    go: (_t, origin) => step("smoke", ["bun", "scripts/smoke.ts"], { CF_DEPLOY_URL: origin }),
  },
]

try {
  // Inside the boundary, so a missing --env prints the refusal rather than a
  // stack trace. It was at module top level, where nothing could catch it.
  prepare()
  const target = resolveTarget(process.argv.slice(2), "explicit")
  const origin = originOf(target)
  console.log(`deploy: ${target.environment} → ${origin}`)

  for (const phase of PIPELINE) await phase.go(target, origin)

  console.log(`\ndeploy: ${target.environment} is live at ${origin}\n`)
} catch (err) {
  if (err instanceof Refused) {
    console.error(`\ndeploy: ${err.message}\n`)
    process.exit(1)
  }
  throw err
}
