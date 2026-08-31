/**
 * Fail when the documentation names a file that does not exist.
 *
 * Same shape as auth:schema:check and check:domain — an artifact is compared
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

/**
 * Where the Product Owner's repo is cloned, per AGENTS.md.
 *
 * Absent on a fresh clone, and that is fine: the companion is optional, the
 * model copies are committed here, and nothing about building needs it. When it
 * *is* there, every path we cite into it is checked like any other.
 */
const COMPANION = resolve(ROOT, "../remy-sport-biz")
const hasCompanion = existsSync(COMPANION)

/**
 * A reference into the companion repo, as a path inside it — or null.
 *
 * Three spellings reach the same file, and all three have been used here: the
 * relative path a source comment writes, the bare repo-prefixed one, and the
 * GitHub blob URL a markdown link uses. The last is the one that rots most
 * quietly, because it looks like an external link and every checker skips it —
 * which is exactly what happened when `data/access/matrix.md` moved to
 * `domain/`.
 */
function companionPath(ref: string): string | null {
  const patterns = [
    /^\.\.\/remy-sport-biz\/(.+)$/,
    /^remy-sport-biz\/(.+)$/,
    /^https:\/\/github\.com\/[^/]+\/remy-sport-biz\/blob\/[^/]+\/(.+)$/,
  ]
  for (const re of patterns) {
    const m = re.exec(ref)
    if (m) return m[1]!.replace(/[.,)]+$/, "")
  }
  return null
}

const IGNORE = [
  /^https?:/,
  /^mailto:/,
  /^#/, // in-page anchor
  /^\//, // a URL route like /openapi.json, not a file
  // The companion repo is NOT ignored — see `companionPath` below. It used to
  // be, "cited on purpose", and three source comments spent weeks pointing at
  // `remy-sport-biz/domain/model/schema.md`, a file that had ceased to exist.
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

function refsIn(markdown: string): Ref[] {
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

    // Backticked strings that look like repo paths. Deliberately narrow, so
    // `c.get("user")` and `bun x tsc` cannot match.
    for (const m of rest.matchAll(/`([^`\s]+)`/g)) {
      const p = m[1]!
      const isFile = /^[\w.@/-]+\.(ts|tsx|js|jsx|css|sql|json|toml|md|html|rs)$/.test(p)
      const isDir = /^(src|docs|tests|scripts|messages)\/[\w./-]*\/$/.test(p)
      // A slash was required here until 2026-08-29, so a file named at the repo
      // root was never checked at all — which is how AGENTS.md went on citing
      // `eslint-suppressions.json` for weeks after the ratchet was paid off and
      // the file deleted. The extension test is what keeps this narrow enough
      // that `bun x tsc` and `c.get("user")` cannot match.
      if (isFile || isDir) found.push({ path: p, line })
    }
  })

  return found
}

/**
 * Every filename in the tree, so a doc can name a file without its full path.
 *
 * Prose says "a fetch in `api.ts`" and means it; requiring `src/web/lib/api.ts`
 * in every sentence would make the docs unreadable to enforce a check. So a
 * slash-less reference resolves if *any* file has that basename — which still
 * catches the case this is for: `eslint-suppressions.json` matched nothing,
 * because the file had been deleted.
 */
const basenames = new Set<string>()
{
  const skip = new Set(["node_modules", "dist", ".git", ".wrangler", ".playwright"])
  const walk = (dir: string) => {
    for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      if (skip.has(e.name)) continue
      if (e.isDirectory()) walk(join(dir, e.name))
      else basenames.add(e.name)
    }
  }
  walk(".")
}

let missing = 0
let checked = 0

for (const doc of docFiles()) {
  for (const { path: raw, line } of refsIn(readFileSync(join(ROOT, doc), "utf-8"))) {
    const p = raw.split("#")[0]!.trim()
    if (!p) continue

    // The companion repo, in any of its three spellings. Checked when it is
    // cloned and skipped when it is not, so a fresh clone still passes.
    const companion = companionPath(p)
    if (companion !== null) {
      if (!hasCompanion) continue
      checked++
      if (existsSync(join(COMPANION, companion))) continue
      missing++
      console.error(`${doc}:${line}  missing in remy-sport-biz: ${companion}`)
      continue
    }

    if (IGNORE.some((re) => re.test(p))) continue

    checked++
    // A bare filename is prose shorthand and is judged on the basename alone.
    if (!p.includes("/")) {
      if (basenames.has(p)) continue
      missing++
      console.error(`${doc}:${line}  missing: ${p} (no file anywhere has that name)`)
      continue
    }

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
