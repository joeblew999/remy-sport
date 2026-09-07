import { writeFileSync } from "node:fs"
import { COVERAGE_REPORT, coverageDrift, domainCoverage } from "../../tests/repo/lib/domain-coverage"

const { report, problems } = domainCoverage()
if (problems.length) throw new Error(problems.join("\n"))
if (process.argv.includes("--write")) writeFileSync(COVERAGE_REPORT, report)
else if (process.argv.includes("--check")) {
  if (coverageDrift(report)) throw new Error("Domain coverage changed. Review and run bun run ops coverage domain --write.")
} else console.log(report)
