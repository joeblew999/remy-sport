/**
 * Fail when the documentation names a file that does not exist.
 *
 * Same shape as auth:schema:check and domain:check — an artifact is compared
 * against the source of truth and the task fails on drift. The artifact here is
 * prose; the source of truth is the tree.
 *
 * This exists because of a specific failure, not a hypothetical one. AGENTS.md
 * described a `translation` table and pointed at a `localized` module; neither
 * was ever built. The design changed during implementation (migration 0010
 * records why) and the prose was written from the plan rather than from the
 * result. It then propagated — a task brief written from AGENTS.md asked for
 * code to be preserved that had never existed.
 *
 * What this CAN catch: a path that no longer resolves.
 * What this CANNOT catch: prose whose every path resolves and whose meaning is
 * wrong. Only a human re-reading the section after changing the code finds
 * that. See the convention in AGENTS.md.
 */

import { readdirSync, readFileSync, existsSync } from "fs"
import { join, resolve, dirname } from "path"

const ROOT = resolve(import.meta.dir, "..")

/**
 * ADRs are checked differently, and the distinction is the whole design.
 *
 * AGENTS.md and friends describe what IS, so every path they name must exist.
 * An ADR is a dated decision record: it legitimately names files that do not
 * exist yet (the ones it proposes) and files that no longer do (the ones it
 * replaced). ADR 004 describes a UI that was never built, and that is the ADR
 * being correct, not stale. So for ADRs only the markdown LINKS are checked —
 * navigation has to work — and paths mentioned in prose are left alone.
 */
const isAdr = (doc: string) => doc.includes("/adr/")

function docFiles(): string[] {
  const out = ["AGENTS.md", "CLAUDE.md", "GEMINI.md", "README.md"]
  const walk = (dir: string) => {
    for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(dir, e.name))
      else if (e.name.endsWith(".md")) out.push(join(dir, e.name))
    }
  }
  walk("docs")
  return out.filter((f) => existsSync(join(ROOT, f)))
}

const IGNORE = [
  /^https?:/,
  /^mailto:/,
  /^#/, // in-page anchor
  /^\//, // a URL route like /openapi.json, not a file
  /^\.\.\/remy-sport-biz/, // the companion repo, cited on purpose
  /^remy-sport-biz\//,
  /^(dist|node_modules)\//,
  /^\.wrangler\//,
  /\$\{/, // shell interpolation inside a fenced example
  /^src\/web\/paraglide\//, // generated, gitignored
]

/**
 * Docs name files by shorthand — "a fetch in `lib/api.ts`" means
 * `src/web/lib/api.ts`. Resolving against these prefixes keeps the check
 * honest without forcing every sentence to carry a full path. A path that
 * resolves under none of them has genuinely drifted.
 */
const PREFIXES = ["", "src", "src/web", "src/db", "tests", "scripts", "docs/dev"]

interface Ref {
  path: string
  line: number
}

function refsIn(markdown: string, adr: boolean): Ref[] {
  const found: Ref[] = []

  markdown.split("\n").forEach((text, i) => {
    const line = i + 1
    if (text.includes("<!-- docs-check-ignore -->")) return

    // Links first, and remove them, so a backticked path used as link TEXT
    // (`[`domain/actors.md`](https://…)`) is judged by its target, not its label.
    let rest = text
    for (const m of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      found.push({ path: m[1]!, line })
      rest = rest.replace(m[0]!, "")
    }

    if (adr) return // ADRs: links only. See isAdr above.

    // Backticked strings that look like repo paths. Deliberately narrow, so
    // `c.get("user")` and `bun x tsc` cannot match.
    for (const m of rest.matchAll(/`([^`\s]+)`/g)) {
      const p = m[1]!
      const isFile = /^[\w.@/-]+\.(ts|tsx|js|jsx|css|sql|json|toml|md|html|rs)$/.test(p)
      const isDir = /^(src|docs|tests|scripts|messages)\/[\w./-]*\/$/.test(p)
      if ((isFile && p.includes("/")) || isDir) found.push({ path: p, line })
    }
  })

  return found
}

let missing = 0
let checked = 0

for (const doc of docFiles()) {
  const adr = isAdr(doc)
  for (const { path: raw, line } of refsIn(readFileSync(join(ROOT, doc), "utf-8"), adr)) {
    const p = raw.split("#")[0]!.trim()
    if (!p || IGNORE.some((re) => re.test(p))) continue

    checked++
    const candidates = [
      resolve(ROOT, dirname(doc), p), // doc-relative, how links are written
      ...PREFIXES.map((prefix) => resolve(ROOT, prefix, p)),
    ]
    if (candidates.some(existsSync)) continue

    missing++
    console.error(`${doc}:${line}  missing: ${p}`)
  }
}

if (missing > 0) {
  console.error(
    `\ndocs-check: ${missing} documented path(s) do not exist (${checked} checked).\n\n` +
      `Either the file moved and the doc needs updating, or the doc describes something\n` +
      `that was never built. The second case is the dangerous one — AGENTS.md is read at\n` +
      `the start of every session, so a wrong note there becomes wrong work.\n\n` +
      `A line that names a path on purpose (to say it is absent, or as an example) can\n` +
      `carry <!-- docs-check-ignore -->.`,
  )
  process.exit(1)
}

console.log(`docs-check: ${checked} documented paths all resolve`)
