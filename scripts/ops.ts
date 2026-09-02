/**
 * Everything you do TO a deployment, behind one command.
 *
 * These were eight separate mise tasks — analytics, demo:on, demo:off,
 * demo:status, versions, biz:sync, domain:sync, seed — each a name a person had
 * to know existed. They are one concern: operating an environment, as opposed to
 * developing against one (`dev`, `check`, `test`) or shipping to one (`deploy`,
 * `db`).
 *
 * A dispatcher rather than a merge. Each of these scripts does one job and does
 * it well; what was wrong was that invoking one required its own task, so the
 * task list grew a name per verb until nothing could be found. The files stay
 * where they are and keep their own reasons.
 *
 *   mise run ops                    what can be done
 *   mise run ops demo status
 *   mise run ops analytics 24
 */

import { install } from "./lib/prepare"

import { Refused } from "./lib/cloudflare"

type Group = "deployment" | "report" | "setup" | "model" | "maintenance"

interface Op {
  /** Which heading it appears under. A flat list of fifteen is not a menu. */
  group: Group
  /** Argv to spawn. `rest` is whatever the caller typed after the subcommand. */
  cmd: (rest: string[]) => string[]
  help: string
}

const OPS: Record<string, Op> = {
  demo: {
    group: "deployment",
    cmd: ([action = "status", ...rest]) =>
      action === "status"
        ? ["bun", "scripts/ops/demo-status.ts", ...rest]
        : ["bun", "scripts/ops/demo.ts", action, ...rest],
    help: "demo <on|off|status> [--env X]   seeded sign-in on a deployment",
  },
  smoke: {
    group: "deployment",
    /**
     * The same checks `deploy` ends with, runnable on their own.
     *
     * They were step 9 of the pipeline and nothing else, so the only way to ask
     * a live deployment whether it was still serving correctly was to deploy it
     * again. That is a bad trade when something looks wrong.
     */
    cmd: (rest) => ["bun", "scripts/deploy/smoke.ts", ...rest],
    help: "smoke --env X                    is a deployment still serving what it should",
  },
  analytics: {
    group: "deployment",
    cmd: (rest) => ["bun", "scripts/ops/analytics.ts", ...rest],
    help: "analytics [hours]                what the deployed worker has been doing",
  },
  audit: {
    group: "deployment",
    cmd: (rest) => ["bun", "scripts/ops/audit.ts", ...rest],
    help: "audit                            the account's delete actions",
  },
  tunnel: {
    group: "setup",
    cmd: (rest) => ["bun", "scripts/ops/tunnel.ts", ...rest],
    help: "tunnel                           create the dev tunnel and its hostname",
  },
  versions: {
    group: "report",
    /**
     * Reads, where it used to write.
     *
     * This pointed at scripts/deploy/versions.ts, the stamp WRITER — so a person
     * typing the obvious command to find out what was deployed instead silently
     * restamped versions.json, and with no --env it stamped production's
     * hostname. That is one of the ways the file came to claim production was
     * 07420e2 while production served b63532f.
     *
     * Writing the stamp is a step inside a deploy, not something a person does;
     * it stays in the pipeline where the environment is known.
     */
    cmd: (rest) => ["bun", "scripts/ops/versions.ts", ...rest],
    help: "versions                         what each environment is actually running",
  },
  seed: {
    group: "deployment",
    cmd: (rest) => ["bun", "scripts/db.ts", "seed-remote", ...rest],
    help: "seed --env X                     seed a remote database",
  },
  biz: {
    group: "model",
    cmd: (rest) => ["bun", "scripts/ops/biz.ts", ...rest],
    help: "biz                              fast-forward the PO's checkout",
  },
  coverage: {
    group: "report",
    cmd: ([what = "gui", ...rest]) => ["bun", `scripts/ops/coverage-${what}.ts`, ...rest],
    help: "coverage <gui|data|model>        how much of each surface is exercised",
  },
  keys: {
    group: "setup",
    cmd: (rest) => ["bun", "scripts/ops/keys.ts", ...rest],
    help: "keys                             generate a VAPID keypair for Web Push",
  },
  deps: {
    group: "maintenance",
    cmd: ([what = "outdated"]) =>
      what === "update" ? ["bun", "update"] : ["bun", "outdated"],
    help: "deps <outdated|update>           npm packages against their releases",
  },
  icons: {
    group: "setup",
    // Two generators, not one: pwa-assets covers the web manifest, tauri icon
    // the desktop and mobile bundles, and both read src/web/public/brand.svg.
    cmd: () => ["sh", "-c", "bun x pwa-assets-generator && bun x tauri icon src/web/public/brand.svg"],
    help: "icons                            regenerate every app icon from brand.svg",
  },
  tauri: {
    group: "maintenance",
    /**
     * The desktop and mobile targets.
     *
     * iOS needs cocoapods, which needs the project-local Ruby on PATH —
     * GEM_HOME and RUBY_BIN come from mise's [env], and mise appends its own
     * paths AFTER /usr/bin, so the system Ruby 2.6 wins unless RUBY_BIN is
     * prepended. cocoapods cannot run on 2.6.
     */
    cmd: ([what = "dev", ...rest]) => {
      const ios = what.startsWith("ios")
      const argv = ios
        ? ["tauri", "ios", what === "ios" ? "dev" : what.replace("ios-", ""), ...rest]
        : ["tauri", what, ...rest]
      const prefix = ios ? `export PATH="$RUBY_BIN:$PATH"; ` : ""
      return ["sh", "-c", prefix + "bun x " + argv.join(" ")]
    },
    help: "tauri <dev|build|info|ios-init|ios-dev>   desktop and mobile targets",
  },
  tiers: {
    group: "report",
    cmd: (rest) => ["bun", "scripts/ops/tiers.ts", ...rest],
    help: "tiers                            how many tests sit in each tier",
  },
  time: {
    group: "report",
    cmd: (rest) => ["bun", "scripts/ops/time.ts", ...rest],
    help: "time <path>                      how long an endpoint takes, measured",
  },
  domain: {
    group: "model",
    cmd: (rest) => ["bun", "scripts/ops/domain.ts", ...rest],
    help: "domain [--check]                 copy the PO's model in",
  },
}

install()

const [name, ...rest] = process.argv.slice(2)

if (!name || name === "--help" || !OPS[name]) {
  const unknown = name && !OPS[name] ? `\nops: no such operation "${name}"\n` : ""
  console.log(`${unknown}
mise run ops <operation>

  Not the daily loop — that is dev, check, deploy. These are the things you
  reach for when the day is not ordinary, and each heading says when that is.`)
  const HEADINGS: Array<[Group, string]> = [
    ["deployment", "showing it to someone, or asking a live deployment what it is doing"],
    ["report", "when you want a number instead of an opinion"],
    ["setup", "once, on a new machine"],
    ["model", "when the Product Owner changes the model"],
    ["maintenance", "the desktop and mobile builds, and dependency upkeep"],
  ]
  for (const [group, heading] of HEADINGS) {
    const ops = Object.values(OPS).filter((o) => o.group === group)
    if (!ops.length) continue
    console.log(`\n  ${heading}`)
    for (const op of ops) console.log(`    ${op.help}`)
  }
  console.log("")
  process.exit(name && !OPS[name] ? 1 : 0)
}

const argv = OPS[name]!.cmd(rest)
const proc = Bun.spawnSync(argv, { stdout: "inherit", stderr: "inherit" })
if (proc.exitCode !== 0) {
  // The operation printed its own reason; this only carries the code out.
  if (proc.exitCode === null) throw new Refused(`${name} did not run`)
  process.exit(proc.exitCode)
}
