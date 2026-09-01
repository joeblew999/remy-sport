/**
 * Writing a resolved database_id into wrangler.toml, verifiably.
 *
 * What is left of the old `cf-ensure` after consolidation. The provisioning it
 * used to do — create D1, create R2, set one secret — moved into
 * `cf-provision.ts`, which does all of it for a *named environment*. This file
 * kept the one piece that is genuinely delicate and worth isolating: the write
 * that pointed production at the wrong database on 2026-08-20.
 *
 * `resolvedConfig` lives here too, so every caller that needs to know what an
 * environment actually deploys with reads it the same way.
 */

import { readFileSync, writeFileSync } from "fs"
import { experimental_readRawConfig, unstable_readConfig } from "wrangler"

const WRANGLER_TOML = "wrangler.toml"

/** The label for the unnamed top-level environment, which is production. */
export const TOP_LEVEL = "(top-level)"

/**
 * Resolved config for one environment — the only view worth provisioning from.
 *
 * Resolved rather than parsed, because inheritance is invisible in the file:
 * a named environment with no `routes` block of its own still deploys onto the
 * top-level hostname. `check-envs.ts` uses this same reader for the same
 * reason. Provisioning from `CF_D1_NAME`-style literals is what this replaces,
 * and the failure there was not an error — every task quietly did the right
 * thing to the wrong account resource.
 */
export function resolvedConfig(env?: string) {
  return unstable_readConfig({ config: WRANGLER_TOML, env })
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
