import { expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { COVERAGE_REPORT, domainCoverage } from "./lib/domain-coverage"

it("every domain structure is accounted for and the reviewed inventory matches the tree", () => {
  const { report, problems } = domainCoverage()
  expect(problems).toEqual([])
  expect(report, "Review changes, then bun run ops coverage domain --write").toBe(readFileSync(COVERAGE_REPORT, "utf8"))
})
