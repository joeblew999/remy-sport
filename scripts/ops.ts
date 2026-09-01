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

import { install } from "./prepare"

import { Refused } from "./cloudflare"

interface Op {
  /** Argv to spawn. `rest` is whatever the caller typed after the subcommand. */
  cmd: (rest: string[]) => string[]
  help: string
}

const OPS: Record<string, Op> = {
  demo: {
    cmd: ([action = "status", ...rest]) =>
      action === "status"
        ? ["bun", "scripts/demo-status.ts", ...rest]
        : ["bun", "scripts/demo.ts", action, ...rest],
    help: "demo <on|off|status> [--env X]   seeded sign-in on a deployment",
  },
  analytics: {
    cmd: (rest) => ["bun", "scripts/analytics.ts", ...rest],
    help: "analytics [hours]                what the deployed worker has been doing",
  },
  audit: {
    cmd: (rest) => ["bun", "scripts/audit.ts", ...rest],
    help: "audit                            the account's delete actions",
  },
  tunnel: {
    cmd: (rest) => ["bun", "scripts/tunnel.ts", ...rest],
    help: "tunnel                           create the dev tunnel and its hostname",
  },
  versions: {
    cmd: (rest) => ["bun", "scripts/versions.ts", ...rest],
    help: "versions                         stamp versions.json",
  },
  seed: {
    cmd: (rest) => ["bun", "scripts/db.ts", "seed-remote", ...rest],
    help: "seed --env X                     seed a remote database",
  },
  biz: {
    cmd: (rest) => ["mise", "run", "biz:sync", ...rest],
    help: "biz                              fast-forward the PO's checkout",
  },
  coverage: {
    cmd: ([what = "gui", ...rest]) => ["bun", `scripts/${what}-coverage.ts`, ...rest],
    help: "coverage <gui|data|model>        how much of each surface is exercised",
  },
  keys: {
    cmd: (rest) => ["bun", "scripts/vapid.ts", ...rest],
    help: "keys                             generate a VAPID keypair for Web Push",
  },
  deps: {
    cmd: ([what = "outdated"]) =>
      what === "update" ? ["bun", "update"] : ["bun", "outdated"],
    help: "deps <outdated|update>           npm packages against their releases",
  },
  icons: {
    cmd: (rest) => ["mise", "run", "brand:icons", ...rest],
    help: "icons                            regenerate every app icon from brand.svg",
  },
  domain: {
    cmd: (rest) => ["bun", "scripts/domain.ts", ...rest],
    help: "domain [--check]                 copy the PO's model in",
  },
}

install()

const [name, ...rest] = process.argv.slice(2)

if (!name || name === "--help" || !OPS[name]) {
  const unknown = name && !OPS[name] ? `\nops: no such operation "${name}"\n` : ""
  console.log(`${unknown}\nmise run ops <operation>\n`)
  for (const op of Object.values(OPS)) console.log(`  ${op.help}`)
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
