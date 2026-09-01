/**
 * Idempotent Cloudflare resource provisioning (ADR 006).
 *
 * Resolves the project's D1 database and R2 bucket, creating either only if
 * absent, and writes the resolved D1 uuid back into wrangler.toml so no human
 * ever copies a database_id by hand — the drift that emptied the environment
 * on 2026-08-20.
 *
 * Usage: bun scripts/cf-ensure.ts <d1|r2>
 *
 * Env vars (from mise.toml [env]):
 *   CF_D1_NAME — D1 database name
 *   CF_R2_NAME — R2 bucket name
 */

import { execFileSync } from "child_process"
import { readFileSync, writeFileSync } from "fs"
import { experimental_readRawConfig, unstable_readConfig } from "wrangler"

const WRANGLER_TOML = "wrangler.toml"

/** The label for the unnamed top-level environment, which is production. */
export const TOP_LEVEL = "(top-level)"

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) {
    console.error(`cf-ensure: missing required env var ${name} (expected from mise.toml [env])`)
    process.exit(1)
  }
  return v
}

/**
 * Every Cloudflare call goes through a mise task, per the AGENTS.md convention
 * that agents and humans drive the same tooling — never raw `bun x wrangler`.
 *
 * `-q` is required, not cosmetic: a plain `mise run` prints the resolved
 * `depends` output (e.g. `bun install`) on stdout, which corrupts JSON capture.
 * Run via argv (no shell) so nothing in the task name can inject.
 */
function mise(task: string): string {
  // stderr is piped rather than inherited so a tolerated failure (the expected
  // "bucket already exists") does not print an alarming wrangler ERROR block on
  // a successful run. Genuine failures are re-printed by the callers below.
  return execFileSync("mise", ["run", "-q", task], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  })
}

// ── D1 ───────────────────────────────────────────────────────────────────────

/**
 * `wrangler d1 list --json` is verified to emit objects keyed uuid/name on
 * wrangler 4.124.0. Unlike R2 below, this is structured output we can trust.
 */
function ensureD1(name: string): void {
  let db = findD1(name)

  if (!db) {
    console.log(`cf-ensure: D1 "${name}" not found — creating`)
    try {
      mise("cf:d1:create")
    } catch (err) {
      // If the create is rejected because the name is taken, the listing we
      // just read was incomplete — the same truncation that bites R2 above.
      // We cannot recover, because the uuid we need only comes from the list.
      const e = err as { stdout?: string; stderr?: string }
      const output = `${e.stdout ?? ""}${e.stderr ?? ""}`
      if (/already exists/.test(output)) {
        console.error(
          `cf-ensure: D1 "${name}" exists but was absent from the listing — 'wrangler d1 list --json' is truncating. Resolve the uuid manually and set database_id in ${WRANGLER_TOML}.`,
        )
      } else {
        console.error(`cf-ensure: creating D1 "${name}" failed:\n${output}`)
      }
      process.exit(1)
    }
    db = findD1(name)
    if (!db) {
      console.error(`cf-ensure: created D1 "${name}" but it did not appear in the list`)
      process.exit(1)
    }
  }

  // Production only, for now: the entry point still resolves its name from the
  // CF_D1_NAME literal, which cannot express three environments. Threading a
  // target through is the consolidation refactor. `patchDatabaseId` is already
  // environment-aware so that refactor cannot reintroduce the wrong-block bug.
  patchDatabaseId({ configPath: WRANGLER_TOML, databaseName: name, uuid: db.uuid })
}

function findD1(name: string): { uuid: string; name: string } | undefined {
  const raw = mise("cf:d1:list:json")
  // wrangler prepends a banner before the JSON array; slice from the first "[".
  const start = raw.indexOf("[")
  if (start === -1) {
    console.error(`cf-ensure: could not find JSON in 'mise run cf:d1:list:json' output:\n${raw}`)
    process.exit(1)
  }
  const list = JSON.parse(raw.slice(start)) as Array<{ uuid: string; name: string }>
  return list.find((d) => d.name === name)
}

// ── Writing a database_id, and proving we wrote the right one ────────────────

/**
 * Every environment's D1 bindings, read from **resolved** config.
 *
 * The snapshot the write is checked against. Resolved rather than parsed,
 * because that is the only view that accounts for inheritance: a named
 * environment with no `d1_databases` of its own does not silently show up empty
 * here, it shows whatever it would actually deploy with.
 */
export function d1Snapshot(configPath: string): Map<string, string> {
  const raw = experimental_readRawConfig({ config: configPath })
  const envs = Object.keys((raw.rawConfig as { env?: Record<string, unknown> }).env ?? {})
  const snapshot = new Map<string, string>()
  for (const env of [undefined, ...envs]) {
    const config = unstable_readConfig({ config: configPath, env })
    // Annotated rather than inferred: the tests' tsconfig resolves wrangler's
    // types differently from the worker's and infers `any` here, which would
    // silently stop checking the two field names this whole comparison rests on.
    const bindings = config.d1_databases as Array<{ database_name?: string; database_id?: string }>
    snapshot.set(
      env ?? TOP_LEVEL,
      JSON.stringify(bindings.map((d) => ({ name: d.database_name, id: d.database_id }))),
    )
  }
  return snapshot
}

/**
 * The lines of the block that declares `databaseName`, located by content.
 *
 * Located by the `database_name` it contains rather than by position, then
 * bounded by the enclosing section headers. Position is what the previous
 * version used — a bare `/^database_id/m`, which takes the FIRST match in the
 * file — and with two environments declared that is production's block no
 * matter which environment you asked for.
 */
function blockOf(lines: string[], databaseName: string): { from: number; to: number } | null {
  const declares = new RegExp(`^\\s*database_name\\s*=\\s*"${databaseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\s*$`)
  const at = lines.findIndex((l) => declares.test(l))
  if (at === -1) return null
  const header = /^\s*\[/
  let from = at
  while (from > 0 && !header.test(lines[from]!)) from--
  let to = at + 1
  while (to < lines.length && !header.test(lines[to]!)) to++
  return { from, to }
}

/**
 * Point one environment's D1 binding at `uuid`, and prove nothing else moved.
 *
 * ## Why this is verified rather than merely careful
 *
 * The job is writing a uuid into a config file, and the failure mode is writing
 * it into the wrong block. That happened: `/^database_id\s*=\s*"([^"]*)"/m`
 * matches the first occurrence in the file, which was unambiguous while one
 * environment existed and became production's block the day staging arrived.
 * Patching staging would have pointed **production** at staging's database, and
 * the next deploy would have served production from an empty one — precisely
 * the 2026-08-20 loss this script was written to prevent.
 *
 * A tighter regex is not the fix. Any regex over TOML is a guess about a format
 * with sections, arrays-of-tables, inheritance and comments, and when it guesses
 * wrong it does so **silently** — it writes something, exits 0, and the damage
 * is found later. The property that actually matters is not "the pattern was
 * precise" but "the file now says what I intended and nothing else changed",
 * and that can be checked directly.
 *
 * So: snapshot every environment's resolved D1 bindings, write, re-read, and
 * assert both halves — the target moved to `uuid`, and every other environment
 * is byte-identical. If either fails the original file is restored and the run
 * refuses. A wrong write becomes a loud no-op.
 */
export function patchDatabaseId(opts: {
  configPath: string
  /** The environment being provisioned; undefined is the top-level one. */
  env?: string
  databaseName: string
  uuid: string
}): "unchanged" | "patched" {
  const { configPath, env, databaseName, uuid } = opts
  const label = env ?? TOP_LEVEL
  const original = readFileSync(configPath, "utf-8")

  const before = d1Snapshot(configPath)
  if (!before.has(label)) {
    fail(`environment "${label}" is not declared in ${configPath}`)
  }

  const lines = original.split("\n")
  const block = blockOf(lines, databaseName)
  if (!block) {
    fail(`no [[d1_databases]] block declaring database_name = "${databaseName}" in ${configPath}`)
  }

  const idLine = /^(\s*)database_id\s*=\s*"([^"]*)"/
  const at = lines.slice(block.from, block.to).findIndex((l) => idLine.test(l))
  if (at === -1) {
    fail(`the block for "${databaseName}" has no database_id line to set`)
  }
  const index = block.from + at
  const [, indent = "", current = ""] = lines[index]!.match(idLine)!

  if (current === uuid) {
    console.log(`cf-ensure: D1 "${databaseName}" (${uuid}) — database_id already correct, no change`)
    return "unchanged"
  }

  lines[index] = `${indent}database_id = "${uuid}"`
  writeFileSync(configPath, lines.join("\n"))

  // ── The verification. Restoring on failure is the whole point. ─────────────
  const after = d1Snapshot(configPath)
  const problems: string[] = []

  const target = JSON.parse(after.get(label) ?? "[]") as Array<{ name: string; id: string }>
  const wrote = target.find((d) => d.name === databaseName)
  if (wrote?.id !== uuid) {
    problems.push(
      `${label}: database "${databaseName}" should now be ${uuid} but resolves to ${wrote?.id ?? "nothing"}`,
    )
  }
  for (const [other, value] of before) {
    if (other === label) continue
    if (after.get(other) !== value) {
      problems.push(`${other} changed, and must not have:\n      was ${value}\n      now ${after.get(other)}`)
    }
  }

  if (problems.length) {
    writeFileSync(configPath, original)
    fail(
      `refusing to edit ${configPath} — the write did not do what it claimed:\n` +
        problems.map((p) => `    ${p}`).join("\n") +
        `\n\n  ${configPath} has been restored to what it was. Nothing was changed.`,
    )
  }

  console.log(
    `cf-ensure: D1 "${databaseName}" [${label}] — database_id ${current || "(empty)"} → ${uuid}` +
      ` (${configPath} updated; ${before.size - 1} other environment(s) verified unchanged)`,
  )
  return "patched"
}

/**
 * Throws rather than exiting, and the CLI boundary below turns it into an exit
 * code.
 *
 * `process.exit` here made the refusal untestable in the way that mattered: a
 * test proving the guard fires would kill the test runner mid-file instead of
 * reporting a named failure, so the regression test for the wrong-block write
 * could not actually assert anything. A refusal a test cannot observe is most of
 * the way back to a silent one.
 */
export class RefusedError extends Error {}

function fail(message: string): never {
  throw new RefusedError(message)
}

// ── R2 ───────────────────────────────────────────────────────────────────────

/**
 * R2 is checked by attempting the create, NOT by scraping the listing.
 *
 * `wrangler r2 bucket list` has no --json flag (verified: "Unknown argument:
 * json") and — the reason this matters — it silently paginates at 20 buckets
 * with no flag to page further. This account has 26, and remy-sport-storage
 * fell off page 1, so a listing-based check reported it absent when it in fact
 * existed. That is worse than the unparseable output ADR 006 anticipated: the
 * output parses perfectly and is simply incomplete, so there is nothing to
 * detect. Creating and tolerating "already exists" is idempotent regardless of
 * how the listing is formatted or truncated.
 */
function ensureR2(name: string): void {
  try {
    mise("cf:r2:create")
    console.log(`cf-ensure: R2 "${name}" created`)
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string }
    const output = `${e.stdout ?? ""}${e.stderr ?? ""}`
    if (/already exists, and you own it|code: 10004/.test(output)) {
      console.log(`cf-ensure: R2 "${name}" already exists, no change`)
      return
    }
    console.error(`cf-ensure: creating R2 "${name}" failed:\n${output}`)
    process.exit(1)
  }
}

// ── Entry ────────────────────────────────────────────────────────────────────

// Guarded, so the tests can import `patchDatabaseId` without provisioning
// anything. Without this, importing the module runs the switch — and `mise run
// cf:d1:create` from inside a unit test is exactly the kind of surprise this
// file exists to prevent.
if (import.meta.main) {
  const target = process.argv[2]

  try {
    switch (target) {
      case "d1":
        ensureD1(requireEnv("CF_D1_NAME"))
        break
      case "r2":
        ensureR2(requireEnv("CF_R2_NAME"))
        break
      default:
        console.error(`cf-ensure: usage: bun scripts/cf-ensure.ts <d1|r2> (got "${target ?? ""}")`)
        process.exit(1)
    }
  } catch (err) {
    // A refusal is still an exit code out here — nothing about the CLI contract
    // changes, only whether a test can observe it.
    if (err instanceof RefusedError) {
      console.error(`cf-ensure: ${err.message}`)
      process.exit(1)
    }
    throw err
  }
}
