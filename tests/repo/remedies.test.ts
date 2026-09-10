import { existsSync, readFileSync } from "node:fs"
import { rule } from "./helpers"
import { ROOT, sources } from "./lib/ast"

/**
 * Every command and file path a comment names must exist.
 *
 * Nothing type-checks a comment, so pointers rot on any rename and no test
 * notices. Sixty-three had, before this ran.
 *
 * Source text, not the AST: a remedy is usually inside a template literal.
 */

const scripts = Object.keys(
  (JSON.parse(readFileSync(`${ROOT}/package.json`, "utf8")) as { scripts?: Record<string, string> })
    .scripts ?? {},
)

/** `mise.toml` tasks. Text, not a TOML reader: one regex over section headers. */
const miseTasks = [
  ...readFileSync(`${ROOT}/mise.toml`, "utf8").matchAll(/^\[tasks\.["']?([\w:.-]+)["']?\]/gm),
].map((m) => m[1]!)

/** `bun run ops <name>` — the dispatcher's own table, read from its source. */
const opsCommands = [
  ...readFileSync(`${ROOT}/scripts/ops.ts`, "utf8").matchAll(/^ {2}["']?([a-z][a-z-]*)["']?: \{$/gm),
].map((m) => m[1]!)

const problems: string[] = []

for (const path of [...sources("scripts"), ...sources("tests"), ...sources("src")]) {
  // Copied verbatim from ../remy-sport-biz by `bun run ops domain`, so a fix
  // here is reverted by the next sync and fails `bun run check:model` meanwhile.
  if (path.startsWith("src/domain/model/")) continue

  const text = readFileSync(`${ROOT}/${path}`, "utf8")

  // Before the plain form: only `ops` itself appears in package.json.
  for (const [, name] of text.matchAll(/bun run ops ([a-z][a-z-]*)/g)) {
    if (!opsCommands.includes(name!)) {
      problems.push(`${path} names \`bun run ops ${name}\` — not in the table in scripts/ops.ts.`)
    }
  }

  for (const [, name] of text.matchAll(/bun run (?!ops\b)([a-z][a-z0-9:-]*)/g)) {
    if (!scripts.includes(name!)) {
      problems.push(
        `${path} names \`bun run ${name}\` — not a script in package.json.\n` +
          `      Available: ${scripts.join(", ")}`,
      )
    }
  }

  for (const [, name] of text.matchAll(/mise run ([\w:.-]+)/g)) {
    if (!miseTasks.includes(name!)) {
      problems.push(`${path} names \`mise run ${name}\` — not a task in mise.toml.`)
    }
  }

  // Comments only: a path in code is usually a fixture written to a temp
  // directory, which is supposed not to exist.
  for (const line of text.split("\n")) {
    if (!/^\s*(\*|\/\/|\/\*)/.test(line)) continue
    for (const [, ref] of line.matchAll(
      /\b((?:docs|src|scripts|tests)\/[A-Za-z0-9._/-]+\.(?:tsx|ts|md|json|css|sql))/g,
    )) {
      if (!existsSync(`${ROOT}/${ref}`)) {
        problems.push(`${path} points at ${ref}, which does not exist.`)
      }
    }
  }
}

rule(
  "every command named in an error, a remedy or a comment exists",
  problems,
  `remedies: ${problems.length} dead reference(s) — a command or a file that does not exist:\n` +
    problems.map((p) => `  ✗ ${p}`).join("\n\n"),
  `remedies: every \`bun run\` and \`mise run\` reference in src/, scripts/ and tests/ ` +
    `names one of ${scripts.length} scripts, ${opsCommands.length} ops commands or ` +
    `${miseTasks.length} mise tasks`,
)
