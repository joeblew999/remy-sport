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

import { existsSync, readdirSync } from "node:fs"
import { run as provision } from "./deploy/provision"
import { prepare } from "./lib/prepare"
import { Refused, originOf, resolveTarget, wrangler, type Target } from "./lib/cloudflare"

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
    name: "auth-schema",
    why: "the generated schema must match auth.config before anything ships it",
    go: () => step("auth-schema", ["bun", "scripts/deploy/auth-schema.ts"]),
  },
  {
    name: "test",
    why: "end to end, against a local server, before a remote one exists",
    go: () => step("test", ["bun", "scripts/e2e.ts"]),
  },
  {
    name: "stamp",
    why: "versions.json is what the origin is later compared against, so it is written before the build that bundles it — and it is stamped for THIS environment, since the artifact carries it",
    go: (target) => step("stamp", ["bun", "scripts/deploy/versions.ts", "--env", target.environment]),
  },
  {
    name: "build",
    why: "vite builds the Worker and the assets for this environment (CLOUDFLARE_ENV selects it) and writes the wrangler.json the publish uses",
    go: (target) =>
      step("build", ["bun", "x", "vite", "build", "--config", "src/web/vite.config.ts"], envFor(target)),
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
      // The generated config, not wrangler.toml, and no `--env`: the build
      // above wrote dist/<worker>/wrangler.json already resolved for the
      // environment CLOUDFLARE_ENV named, with `main` and `assets.directory`
      // pointing at what it built. (The plugin also writes a redirect for
      // `wrangler deploy` to find it — under the Vite root, which is not where
      // this runs from, so it is named here instead.)
      const generated = readdirSync("dist")
        .map((d) => `dist/${d}/wrangler.json`)
        .find((p) => existsSync(p))
      if (!generated) throw new Refused("no dist/*/wrangler.json — the build step did not run")
      Object.assign(process.env, envFor(target))
      const published = wrangler(["deploy", "--config", generated], undefined, { inherit: true })
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
    go: (_t, origin) => step("smoke", ["bun", "scripts/deploy/smoke.ts"], { CF_DEPLOY_URL: origin }),
  },
]

/**
 * How the Vite plugin and wrangler are told which environment: the variable,
 * not the flag. Production is the top-level configuration and has no name.
 */
const envFor = (target: Target): Record<string, string> => (target.flag ? { CLOUDFLARE_ENV: target.flag } : {})

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
  if (!want) throw new Refused("no _generated stamp in versions.json — run `bun run ops versions` first")

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
if (process.argv.includes("--help")) {
  console.log(`
bun run deploy -- --env staging | production

  A remote write names its environment or refuses; there is deliberately no
  default. Everything before the publish is the gate, everything after verifies
  it.

What it runs:
`)
  PIPELINE.forEach((p, i) => console.log(`  ${String(i + 1).padStart(2)}. ${p.name.padEnd(12)} ${p.why}`))
  console.log("")
  process.exit(0)
}

try {
  // Inside the boundary, so a missing --env prints the refusal rather than a
  // stack trace. It was at module top level, where nothing could catch it.
  prepare()
  const target = resolveTarget(process.argv.slice(2), "explicit")
  const origin = originOf(target)
  console.log(`deploy: ${target.environment} → ${origin}`)

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
