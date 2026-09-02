/**
 * What version each environment is actually running — asked, never remembered.
 *
 * This replaces a committed `history` array in versions.json that claimed to be
 * a record of deployments and could not be one. There is a single `current` in
 * that file and three environments, so whichever deployed last overwrote it.
 * Measured 2026-09-02: the file said production was 07420e2 while production
 * was really serving b63532f, 22 commits behind main, because a staging deploy
 * had written its own commit into production's row. It had drifted without ever
 * failing, which is the worst way for a record to be wrong.
 *
 * So nothing is stored. Each deployment bundles its own stamp and serves it at
 * /api/versions (scripts/deploy/versions.ts writes it, `src/index.ts` serves
 * it), and this asks every environment in turn. The answer cannot go stale
 * because there is nowhere for it to go stale.
 *
 *   mise run ops versions
 *
 * `dev` is included when it is reachable and skipped when it is not — it is a
 * laptop, and a laptop being off is not a failure to report.
 */

import { ENVIRONMENTS } from "../../src/environment"
import { originOf, resolveTarget } from "../lib/cloudflare"

interface Stamp {
  _generated?: string
  app?: string
  environment?: string
  url?: string
  git?: { commit?: string; branch?: string }
}

const run = (cmd: string): string => {
  try {
    return Bun.spawnSync(cmd.split(" "), { stdout: "pipe", stderr: "ignore" })
      .stdout.toString()
      .trim()
  } catch {
    return ""
  }
}

/**
 * How far behind main a deployed commit is.
 *
 * The whole point of the table: "staging is d411075" means nothing on its own,
 * and "22 behind" is the sentence someone actually needs. Empty when the commit
 * is not in this clone — a deployment can be older than the branch you hold.
 */
function distance(commit: string): string {
  if (!commit || !run(`git cat-file -t ${commit}`)) return "unknown to this clone"
  const behind = run(`git rev-list --count ${commit}..HEAD`)
  const ahead = run(`git rev-list --count HEAD..${commit}`)
  if (behind === "0" && ahead === "0") return "= HEAD"
  if (ahead !== "0") return `${ahead} ahead of HEAD`
  return `${behind} behind HEAD`
}

async function ask(origin: string): Promise<Stamp | { error: string }> {
  try {
    const res = await fetch(`${origin}/api/versions`, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) return { error: `HTTP ${res.status}` }
    const body = (await res.json()) as { current?: Stamp }
    return body.current ?? { error: "no `current` in /api/versions" }
  } catch (e) {
    return { error: e instanceof Error ? e.message.slice(0, 40) : "unreachable" }
  }
}

const rows: string[][] = []
let mismatch = false

for (const env of ENVIRONMENTS) {
  let origin: string
  try {
    origin = originOf(resolveTarget(["--env", env]))
  } catch {
    // dev has no [[routes]] of its own; it is whatever is serving locally.
    origin = process.env.DEV_URL ?? "http://localhost:8787"
  }

  const stamp = await ask(origin)
  if ("error" in stamp) {
    if (env === "dev") continue // a laptop being off is not news
    rows.push([env, "—", "—", stamp.error])
    continue
  }

  const commit = stamp.git?.commit ?? "—"
  const when = (stamp._generated ?? "").slice(0, 16).replace("T", " ")

  /**
   * Three states, and only one of them is a bug.
   *
   * An environment reporting someone ELSE'S name is the failure that was
   * invisible before: staging served its own bundle while its stamp said
   * production. A missing name is different — it means the deployment predates
   * the stamp carrying one, which every environment does until its next deploy,
   * and reporting that as broken would cry wolf on day one.
   */
  if (stamp.environment === undefined) {
    rows.push([env, commit, distance(commit), `${when}  (predates env stamping)`])
  } else if (stamp.environment !== env) {
    mismatch = true
    rows.push([env, commit, distance(commit), `CLAIMS "${stamp.environment}"`])
  } else {
    rows.push([env, commit, distance(commit), when])
  }
}

const w = [0, 1, 2, 3].map((i) => Math.max(...rows.map((r) => r[i]!.length)))
console.log()
for (const r of rows) {
  console.log(`  ${r[0]!.padEnd(w[0])}  ${r[1]!.padEnd(w[1])}  ${r[2]!.padEnd(w[2])}  ${r[3]}`)
}
console.log()

if (mismatch) {
  console.error(
    "An environment is serving a stamp built for a different one. That is the\n" +
      "bug scripts/deploy/versions.ts documents: redeploy it so it stamps itself.\n",
  )
  process.exit(1)
}
