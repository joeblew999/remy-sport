import { it } from "vitest"

/**
 * A rule about the tree, as a test.
 *
 * Each file in this directory reads the repository — the router, the schema,
 * the messages, the docs — and lists what breaks a rule it states in its
 * header. These were fifteen scripts under scripts/check/, each printing its
 * report and calling `process.exit(1)`, spawned one at a time by an
 * orchestrator. Under Vitest they are files like any other: run in parallel,
 * filtered by name, watched on save.
 *
 * `problems` empty means the rule holds. `report` is the same text the script
 * printed — the whole of it, since that text is where a reader learns what to
 * do — and `summary` is the one line it printed on success, kept because a
 * count ("15 rules hold", "497 files precached") is how drift is noticed.
 */
export function rule(name: string, problems: readonly string[], report: string, summary?: string): void {
  it(name, () => {
    if (problems.length) throw new Error(report)
    if (summary) console.log(summary)
  })
}
