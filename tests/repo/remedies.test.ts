import { readFileSync } from "node:fs"
import { rule } from "./helpers"
import { ROOT, sources } from "./lib/ast"

/**
 * Every command this repo tells you to run must exist.
 *
 * A remedy is part of the CLI surface, not prose beside it. It is the *only*
 * part most people meet: nobody reads `bun run ops` for pleasure, they hit a
 * failure and type what it tells them. So a remedy naming a command that was
 * deleted is worse than a bare error — it spends somebody's afternoon proving
 * that a command which cannot work does not work.
 *
 * That is not hypothetical. On 2026-09-10 the only guidance for a missing Web
 * Push key told the reader to run a `dev:vars` script, or a `push:secret:set`
 * mise task, depending on the surface. Neither existed: `dev:vars` was not among
 * the nineteen scripts and `push:secret:set` was not a task — both went when
 * ninety mise tasks were consolidated, the change recorded in scripts/db.ts. The
 * dead `dev:vars` was named twice more, including in the refusal a developer
 * sees for `--env dev`.
 *
 * Twenty-six such references were found across twenty files the day this was
 * written, which is what a map maintained by hand looks like after a rename.
 *
 * (Written without the literal `bun run …` form on purpose — this file is
 * scanned by the very rule it defines.)
 *
 * The comment above that remedy already said "a remedy that names the wrong
 * file is worse than none". It had been fixed once, for naming the wrong
 * surface, and rotted again in the other direction — which is the argument for
 * checking it rather than writing it down.
 *
 * Read from source text rather than the AST, because a remedy is usually inside
 * a template literal or split across concatenated lines, where the command is
 * text and not a node worth naming.
 */

const scripts = Object.keys(
  (JSON.parse(readFileSync(`${ROOT}/package.json`, "utf8")) as { scripts?: Record<string, string> })
    .scripts ?? {},
)

/**
 * `mise.toml` tasks, by heading. Parsed as text: this is one regex over section
 * headers, against a file that would need a TOML reader for anything more, and
 * the alternative is a dependency for six lines.
 */
const miseTasks = [
  ...readFileSync(`${ROOT}/mise.toml`, "utf8").matchAll(/^\[tasks\.["']?([\w:.-]+)["']?\]/gm),
].map((m) => m[1]!)

/** `bun run ops <name>` — the dispatcher's own table, read from its source. */
const opsCommands = [
  ...readFileSync(`${ROOT}/scripts/ops.ts`, "utf8").matchAll(/^ {2}["']?([a-z][a-z-]*)["']?: \{$/gm),
].map((m) => m[1]!)

const problems: string[] = []

for (const path of [...sources("scripts"), ...sources("tests"), ...sources("src")]) {
  /**
   * `src/domain/model/` is not ours to edit.
   *
   * `bun run ops domain` copies it verbatim from ../remy-sport-biz, so a fix
   * made here is reverted by the next sync — and `bun run check:model` fails in
   * the meantime, which is how this exclusion was found rather than reasoned
   * about. One dead reference lives there today, in vocabularies.ts, and
   * belongs in the Product Owner's repo.
   */
  if (path.startsWith("src/domain/model/")) continue

  const text = readFileSync(`${ROOT}/${path}`, "utf8")

  // `bun run ops <name>` before plain `bun run <name>`, so the dispatcher's
  // subcommand is checked against its table rather than against package.json,
  // where only `ops` itself appears.
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
}

rule(
  "every command named in an error, a remedy or a comment exists",
  problems,
  `remedies: ${problems.length} dead command reference(s):\n` +
    problems.map((p) => `  ✗ ${p}`).join("\n\n"),
  `remedies: every \`bun run\` and \`mise run\` reference in src/, scripts/ and tests/ ` +
    `names one of ${scripts.length} scripts, ${opsCommands.length} ops commands or ` +
    `${miseTasks.length} mise tasks`,
)
