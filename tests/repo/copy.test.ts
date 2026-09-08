import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"
import { ROOT, sources } from "./lib/ast"
import { copyProblems, type Finding } from "./lib/copy-rules"
import { rule } from "./helpers"

/**
 * No user-visible string may be written directly into the UI.
 *
 * The rules are in tests/repo/lib/copy-rules.ts, with the reason each one
 * exists on it. This runs them over the SPA and over text whose answers are
 * known — a rule with no failing case is a rule that might be reporting
 * nothing because it walks the wrong node.
 */

// Every .ts and .tsx in the SPA, not a list of files. The list was the first
// version and it is the wrong shape: a NEW module manufacturing UI strings
// would not be on it, which is exactly the case a check exists for.
//
// Except `components/ui/`: those files are registry copies, hash-locked by
// scripts/lib/registry-lock.ts, so the `// check-ignore` marker this rule
// offers cannot be written into one without breaking that lock. Their strings
// are upstream's, taken or left whole on upgrade, and the reader-facing
// guarantee is held elsewhere: this check over everything WE author; the plan
// rule (B2) that the app renders its own labelled control rather than a
// registry one that carries English, which is why the topbar trigger is ours;
// and the render-tier i18n checks. Two sr-only strings still mount from
// `ui/sidebar.tsx` (the mobile Sheet's "Sidebar" title and description) —
// hardcoded upstream, not parameterisable; accepted and recorded in
// docs/2026-09-08-01-typography-and-design-system.md, B2 step 8.
const files = sources("src/web").filter((f) => !f.startsWith("src/web/components/ui/"))
const problems = copyProblems(files)

rule(
  "no user-visible string is written directly into the UI",
  problems.map((p) => `${p.path}:${p.line}  ${p.why}: ${JSON.stringify(p.text)}`),
  `check-copy: ${problems.length} hardcoded string(s) — wrap each in a paraglide message\n\n` +
    problems.map((p) => `  ${p.path}:${p.line}  ${p.why}\n      ${JSON.stringify(p.text)}`).join("\n") +
    "\n\n  A string that was never a message cannot be translated, and nothing else\n" +
    "  reports it: the locale files are complete either way. A line that is not\n" +
    "  language can carry `// check-ignore` with the reason.",
  `check-copy: ${files.length} SPA files, no hardcoded user-visible strings`,
)

/** Shapes that shipped to a reader in the wrong language. */
const CAUGHT: Array<[name: string, file: string, source: string]> = [
  ["text between tags", "bad.tsx", `export const A = () => <div>Venue TBC</div>`],
  ["a string in a rendered expression", "bad.tsx", `export const A = () => <div>{"Live now"}</div>`],
  ["a template in a rendered expression", "bad.tsx", "export const A = () => <div>{`Live ${n}`}</div>"],
  ["a string inside a JSX expression", "bad.tsx", `export const A = () => <div>{{ all: "All" }[k]}</div>`],
  ["a placeholder", "bad.tsx", `export const A = () => <input placeholder="Event name" />`],
  ["a title", "bad.tsx", `export const A = () => <div title="Not started" />`],
  ["an aria-label", "bad.tsx", `export const A = () => <button aria-label="Close" />`],
  ["a label returned by the view model", "bad.ts", `export const f = () => { return "Live now" }`],
]

/** Shapes that are not language, and must stay quiet or the rule is noise. */
const ALLOWED: Array<[name: string, file: string, source: string]> = [
  ["an em dash", "ok.tsx", `export const A = () => <span>—</span>`],
  ["an escaped nbsp", "ok.tsx", `export const A = () => <span>&nbsp;</span>`],
  ["the brand", "ok.tsx", `export const A = () => <span>Remy Sport</span>`],
  ["a decorative image", "ok.tsx", `export const A = () => <img alt="" src={s} />`],
  ["a className", "ok.tsx", `export const A = () => <div className="page-inner" />`],
  ["a testid", "ok.tsx", `export const A = () => <div data-testid="home-teams" />`],
  ["a font stack", "ok.tsx", `export const A = () => <div style={{ fontFamily: "Space Grotesk" }} />`],
  ["a code comparison", "ok.tsx", `export const A = () => <div>{s === "LIVE" ? a : b}</div>`],
  ["a message call", "ok.tsx", `export const A = () => <div>{m.home_sub()}</div>`],
  ["a returned code", "ok.ts", `export const f = () => { return "NOT_FOUND" }`],
  ["a returned single word", "ok.ts", `export const f = () => { return "tournament" }`],
  ["a marked line", "ok.ts", `export const f = () => { return "Live now" } // check-ignore: a test`],
]

describe("the rules themselves, on text whose answer is known", () => {
  const run = (file: string, source: string): Finding[] => {
    // Inside the repo, because parsing is repo-relative — and removed
    // immediately, so a failed run cannot leave a file behind that the sweep
    // above would then read.
    const dir = mkdtempSync(join(ROOT, ".copy-fixture-"))
    try {
      const path = join(dir, file)
      writeFileSync(path, source)
      return copyProblems([relative(ROOT, path)])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  for (const [name, file, source] of CAUGHT) {
    it(`catches ${name}`, () => expect(run(file, source).length).toBeGreaterThan(0))
  }
  for (const [name, file, source] of ALLOWED) {
    it(`allows ${name}`, () => expect(run(file, source)).toEqual([]))
  }
})
