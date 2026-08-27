/**
 * Which of the Product Owner's actions the product actually implements.
 *
 * Written because a gap this size stayed invisible: the model declared what an
 * organiser may do with a schedule, the API had no way to create a game at all,
 * and nothing connected the two. An organiser could create an event, register
 * teams, and then schedule nothing. It was found by reading the router by hand.
 *
 * Nothing here fails the build, and that is deliberate — most of these are
 * unbuilt on purpose and the roadmap says so. What was missing was a way to
 * *see* it. `mise run model:coverage`.
 *
 * Three honest buckets:
 *
 *   enforced   a procedure calls requireAction() for it
 *   public     every grant is PUBLIC, so there is nothing to enforce — a
 *              spectator reading a score needs no check, and counting these as
 *              "missing" would be a lie in the other direction
 *   missing    neither
 *
 * "Missing" is not the same as "wrong". It means the model promises something
 * the product cannot do yet, which is exactly the list worth looking at before
 * deciding what to build.
 */

import { readdirSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { ACTION, GRANTS } from "../src/domain/vocabularies"

const API = resolve(import.meta.dir, "../src/api")

/** Every `requireAction("X")` in the API, whatever formatting it is written in. */
const enforced = new Set<string>()
for (const file of readdirSync(API).filter((f) => f.endsWith(".ts"))) {
  const src = readFileSync(join(API, file), "utf8")
  for (const m of src.matchAll(/requireAction\(\s*"([A-Z_]+)"/g)) enforced.add(m[1]!)
}

const publicOnly = (code: string) => {
  const grants = (GRANTS as Record<string, ReadonlyArray<{ relation: string }>>)[code] ?? []
  return grants.length > 0 && grants.every((g) => g.relation === "PUBLIC")
}

const byCategory = new Map<string, { code: string; state: string }[]>()
for (const a of ACTION) {
  const state = enforced.has(a.code) ? "enforced" : publicOnly(a.code) ? "public" : "missing"
  const list = byCategory.get(a.category) ?? []
  list.push({ code: a.code, state })
  byCategory.set(a.category, list)
}

const MARK: Record<string, string> = { enforced: "✓", public: "·", missing: " " }
let enforcedN = 0
let publicN = 0
let missingN = 0

for (const [category, actions] of [...byCategory].sort()) {
  const done = actions.filter((a) => a.state !== "missing").length
  console.log(`\n  ${category}  ${done}/${actions.length}`)
  for (const a of actions.sort((x, y) => x.code.localeCompare(y.code))) {
    console.log(`    ${MARK[a.state]} ${a.code}`)
    if (a.state === "enforced") enforcedN++
    else if (a.state === "public") publicN++
    else missingN++
  }
}

console.log(
  `\n  ${enforcedN} enforced · ${publicN} public (nothing to enforce) · ${missingN} not built` +
    `\n  ${ACTION.length} actions in the Product Owner's model.\n` +
    `\n  "not built" is not "wrong" — most are on the roadmap. It is the list to\n` +
    `  read before choosing what to build, and the one nothing used to show.\n`,
)
