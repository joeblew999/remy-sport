import { describe, expect, it } from "vitest"
import { sources } from "./lib/ast"
import { IMPORT_RULES, importViolations } from "./lib/import-rules"
import { rule } from "./helpers"

/**
 * No layer imports a layer above it, and nothing imports in a circle.
 *
 * The rules are in tests/repo/lib/import-rules.ts, with the reason each one
 * exists on it. This runs them over `src` and over fixtures that break exactly
 * one rule each — a layering rule that reports nothing is indistinguishable
 * from a layering rule that is looking at the wrong graph, and this repo's
 * graph is 485 edges across 115 files.
 */

const files = sources("src")
const violations = importViolations(files)

rule(
  "no layer imports a layer above it",
  violations.map((v) => `${v.rule}: ${v.from} -> ${v.to}`),
  `check-imports: ${violations.length} violation(s)\n\n` +
    violations
      .map((v) => `  ${v.rule}\n      ${v.from}${v.line ? `:${v.line}` : ""} -> ${v.to}\n      ${v.why}`)
      .join("\n\n"),
  `check-imports: ${files.length} modules, no forbidden import and no cycle`,
)

/**
 * One file per rule, each breaking exactly it.
 *
 * Overlay fixture modules onto the real graph in memory. Writing temporary
 * modules into src raced other repository checks scanning that directory,
 * making a valid deploy fail when a fixture disappeared between list and read.
 */
const BREAKS: Array<[rule: string, files: Record<string, string>]> = [
  [
    "worker-must-not-import-spa",
    { "src/api/.fx-worker.ts": `import { x } from "../web/lib/api"\nexport const y = x` },
  ],
  [
    "spa-reaches-only-the-shared-roots",
    { "src/web/.fx-spa.ts": `import { database } from "../api/db"\nexport const y = database` },
  ],
  [
    "screens-never-decide",
    { "src/web/.fx-grants.ts": `import { grantAllows } from "../domain/grants"\nexport const y = grantAllows` },
  ],
  [
    "domain-is-the-root",
    { "src/domain/.fx-root.ts": `import { database } from "../api/db"\nexport const y = database` },
  ],
  [
    "no-circular",
    {
      "src/api/.fx-a.ts": `import { b } from "./.fx-b"\nexport const a = b`,
      "src/api/.fx-b.ts": `import { a } from "./.fx-a"\nexport const b = a`,
    },
  ],
]

/** A type import erases, so it cannot pull an implementation into a bundle. */
const ALLOWED: Array<[name: string, files: Record<string, string>]> = [
  [
    "the shared relay protocol helper from the SPA",
    { "src/web/.fx-relay.ts": `import { isCloudflareMoq } from "../moq-relay"\nexport const check = isCloudflareMoq` },
  ],
  [
    "a type-only import from the SPA into the API — how the client is typed",
    { "src/web/.fx-typeonly.ts": `import type { Router } from "../api/index"\nexport type R = Router` },
  ],
  [
    "the drizzle schema files referencing each other's tables",
    // Not a fixture: the real pair. Asserted by the sweep above passing, and
    // named here so deleting the exemption fails a test that says why.
    {},
  ],
]

describe("the rules themselves, on a graph whose answer is known", () => {
  it("keeps the shared relay helper free of server runtime dependencies", () => {
    const guard = IMPORT_RULES.find(rule => rule.name === "relay-protocol-helper-is-independent")!
    const edge = { from: "src/moq-relay.ts", to: "src/api/db.ts", line: 1, typeOnly: false }
    expect(guard.broken(edge)).toBe(true)
    expect(guard.broken({ ...edge, typeOnly: true })).toBe(false)
  })
  for (const [name, fixture] of BREAKS) {
    it(`catches ${name}`, () => {
      const broken = importViolations(files, fixture)
      expect(broken.map((v) => v.rule)).toContain(name)
    })
  }

  for (const [name, fixture] of ALLOWED) {
    it(`allows ${name}`, () => {
      const found = importViolations(files, fixture)
      expect(found).toEqual([])
    })
  }
})
