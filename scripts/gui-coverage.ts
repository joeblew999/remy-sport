/**
 * How much of the backend the GUI actually reaches.
 *
 * `model-coverage.ts` answers "which of the Product Owner's actions are built"
 * and it answers it about the *server*. Both of those numbers can be perfect
 * while a procedure returns a field no screen renders — the work is done, paid
 * for on every request, and invisible. On 2026-08-31 that was true of a lot:
 * every event, org, team and venue carried a `provinceCode` that appeared on no
 * screen in the app, and the model ships all 77 Thai provinces to support it.
 *
 * So this walks the same router and asks a different question: for each
 * procedure, is it called from `src/web` at all, and is each field it returns
 * named anywhere there?
 *
 * ## What it can and cannot tell you
 *
 * It is a *reachability* check, not a rendering check: a field counts as used
 * if its name appears in the SPA sources. That over-counts — a name can appear
 * in a comment, and two different shapes can share a field name — so it is a
 * floor on what is wasted, not a ceiling. It earns its place by being a floor
 * that was 56 fields deep and nobody knew.
 *
 * It deliberately does not fail on a number. A field can be returned for a
 * good reason and rendered by nothing: `health.get.timestamp` is for an uptime
 * probe, not a screen. Those go in `OFFSCREEN` with a reason, and the list is
 * asserted — an entry that stops being unused fails, so the exemptions cannot
 * quietly become wrong. Everything else is printed as a report to act on.
 */

import { readdirSync, readFileSync, statSync } from "fs"
import { join, resolve } from "path"
import { router } from "../src/api/index"

const WEB = resolve(import.meta.dir, "../src/web")

/**
 * Returned on purpose, rendered by nothing — with the reason.
 *
 * Keyed `procedure.field`. Anything here that IS reachable fails the run, so a
 * field that gets a screen has to be removed rather than left to rot into a lie.
 *
 * ## Only fields whose names are their own
 *
 * The first version of this list also excused the write endpoints that echo the
 * row they wrote — `teams.addPlayer.fromDate` and five siblings — on the
 * grounds that the screen refetches instead of reading the response. Every one
 * of them had to come back out, and the staleness check above is what said so:
 * rendering `fromDate` on the roster marked `addPlayer`'s identically-named
 * field as reached, because the search is over names and cannot attribute a
 * name to a procedure.
 *
 * That is the tool's real limit, and an exemption list that pretends otherwise
 * is worse than no list — it reads as a per-field judgement the check cannot
 * actually make. So only names distinct enough to attribute belong here.
 */
const OFFSCREEN: Record<string, string> = {
  "health.get.timestamp": "an uptime probe's response, not a screen's data",
  /**
   * The Product Owner composes the tier into the division's name.
   *
   * div_002 is "U18 Boys" and div_005 is "U18 Boys Premier" — same age group,
   * same gender, and the name is what tells them apart in every language. A
   * "Premier" badge beside a label that already ends in "Premier" would be the
   * same fact twice, so this is unrendered on purpose.
   *
   * If the model ever stops composing it, these two stop being redundant and
   * the divisions become indistinguishable on screen. Worth knowing then.
   */
  "divisions.list.skillTierCode": "the model composes the tier into the division's name",
  "reference.list.skillTiers": "the model composes the tier into the division's name",

  /**
   * The relation definitions — how the server resolves who holds what.
   *
   * `RELATION` rows say which table to read, which column holds the object,
   * which holds the user, and how to follow a join. That is the authorisation
   * resolver's own configuration, and `src/api/relations.ts` is its only
   * reader. There is no screen for it and there should not be: a page that
   * rendered `throughColumn` would be showing a person the query plan.
   *
   * They ride along because `/api/reference` serves every vocabulary the model
   * defines rather than a list maintained here — which is the property that
   * makes a vocabulary added upstream appear with nothing edited, and is worth
   * more than trimming nine fields off one cached response.
   */
  "reference.list.sourceTable": "relation resolver configuration — src/api/relations.ts reads these, no screen does",
  "reference.list.objectColumn": "relation resolver configuration",
  "reference.list.userColumn": "relation resolver configuration",
  "reference.list.filterColumn": "relation resolver configuration",
  "reference.list.filterValue": "relation resolver configuration",
  "reference.list.throughTable": "relation resolver configuration",
  "reference.list.throughColumn": "relation resolver configuration",
  "reference.list.activeToColumn": "relation resolver configuration",
  "reference.list.roleCode": "relation resolver configuration",
  "reference.list.tableName": "which table a vocabulary lives in — plumbing, not a label",
}

type Node = Record<string, unknown>
type Proc = { path: string; output: unknown }

const procs: Proc[] = []
function walk(node: Node, path: string[]) {
  for (const [key, value] of Object.entries(node)) {
    const internals = (value as Record<string, Node> | null)?.["~orpc"]
    if (internals?.handler) procs.push({ path: [...path, key].join("."), output: internals.outputSchema })
    else if (value && typeof value === "object") walk(value as Node, [...path, key])
  }
}
walk(router as unknown as Node, [])

/** Every source file the SPA is built from. */
function sources(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    statSync(path).isDirectory() ? sources(path, acc) : acc.push(path)
  }
  return acc
}
const web = sources(WEB)
  .filter((f) => /\.(ts|tsx)$/.test(f))
  .map((f) => readFileSync(f, "utf8"))
  .join("\n")

/**
 * The field names a zod output schema can produce, at any depth.
 *
 * Walked structurally rather than through `.shape`, because the schemas here
 * are arrays of objects, optionals, unions and nullables in every combination,
 * and reading only the top level would have reported `events.list` as one field
 * called `events`.
 */
function fieldsOf(schema: unknown, depth = 0, acc = new Set<string>()): Set<string> {
  if (!schema || depth > 6) return acc
  const def = (schema as { _def?: Record<string, unknown>; def?: Record<string, unknown> })._def
    ?? (schema as { def?: Record<string, unknown> }).def
  if (!def) return acc

  const shape = typeof def.shape === "function" ? (def.shape as () => Node)() : (def.shape as Node | undefined)
  if (shape) {
    for (const [key, value] of Object.entries(shape)) {
      acc.add(key)
      fieldsOf(value, depth + 1, acc)
    }
  }
  for (const key of ["innerType", "element", "type", "valueType"]) {
    const inner = def[key]
    if (inner && typeof inner === "object") fieldsOf(inner, depth + 1, acc)
  }
  if (Array.isArray(def.options)) for (const option of def.options) fieldsOf(option, depth + 1, acc)
  return acc
}

const uncalled: string[] = []
const unrendered: { path: string; fields: string[]; total: number }[] = []
let totalFields = 0
let unusedFields = 0

for (const proc of procs) {
  if (!web.includes(proc.path)) uncalled.push(proc.path)

  const fields = [...fieldsOf(proc.output)]
  if (!fields.length) continue
  totalFields += fields.length

  const missing = fields.filter((name) => {
    if (`${proc.path}.${name}` in OFFSCREEN) return false
    return !new RegExp(`\\b${name}\\b`).test(web)
  })
  unusedFields += missing.length
  if (missing.length) unrendered.push({ path: proc.path, fields: missing, total: fields.length })
}

// An exemption that came true. The field reached a screen and the note saying
// it never would is now false — which is exactly how a list of excuses rots
// into documentation nobody trusts.
const stale = Object.keys(OFFSCREEN).filter((key) => {
  const field = key.split(".").pop()!
  return new RegExp(`\\b${field}\\b`).test(web)
})
if (stale.length) {
  console.error("gui-coverage: these are listed as never rendered, but the SPA names them now:\n")
  for (const key of stale) console.error(`  ${key}  — "${OFFSCREEN[key]}"`)
  console.error("\nRemove them from OFFSCREEN in scripts/gui-coverage.ts.")
  process.exit(1)
}

const called = procs.length - uncalled.length
const pct = (n: number, of: number) => `${Math.round((n / of) * 100)}%`

console.log(
  `gui-coverage: ${called}/${procs.length} procedures called from the SPA (${pct(called, procs.length)}), ` +
    `${totalFields - unusedFields}/${totalFields} output fields named (${pct(totalFields - unusedFields, totalFields)})`,
)

if (uncalled.length) {
  console.log("\n  built, and no screen calls it:")
  for (const path of uncalled) console.log(`    ${path}`)
}
if (unrendered.length) {
  console.log("\n  returned on every request, named by no screen:")
  for (const row of unrendered.sort((a, b) => b.fields.length - a.fields.length)) {
    console.log(`    ${row.path.padEnd(28)} ${row.fields.length}/${row.total}  ${row.fields.join(" ")}`)
  }
}
