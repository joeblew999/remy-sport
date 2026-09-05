/**
 * A test may only name a row that exists.
 *
 * The render tier has no backend, so every spec hands the query cache a payload.
 * That freedom is what the tier is for — and it meant a spec needing a camp's
 * timetable could invent one instead of noticing the seed had none. It did:
 * `event-sessions.spec.ts` asserted against a session called `ses_1` at an event
 * it named "Bangkok Skills Camp", while the seed's camp is `evt_003`, "Chiang
 * Mai Summer Basketball Camp 2026", and had no sessions at all.
 *
 * So the tab shipped empty and every test covering it passed. **A page drawn
 * from data no database holds cannot tell you the database is empty**, and that
 * is the failure this closes: an invented id now fails the gate, so the seed has
 * to grow instead.
 *
 * Eight ids named nothing when this was written. Six were inventions standing in
 * for rows that should exist — a camp session, a venue, two games, a school's
 * teams — and every one has since been seeded, twice uncovering a real gap:
 * `team_002` played all three of its games at home, so "away, and won" had no
 * data, and no game was being broadcast.
 *
 * ## What it does not do
 *
 * It says nothing about *values*. A spec may still claim an event is called
 * whatever it likes — `tests/helpers/projections.ts` is what removes the place
 * to type that, and `tests/worker/projection-equivalence.test.ts` is what keeps
 * the projections honest. This is the cheaper half: the id has to be real.
 *
 * ## The exemption
 *
 * `// check-ignore` on the line, and there are two, both correct: a not-found
 * case needs an id that resolves to nothing, and `relations.test.ts` asserts
 * what somebody with no relations may do. Naming a real person there would make
 * the test depend on that person having no relations, which is not something the
 * fixtures promise.
 */

import { readFileSync, readdirSync } from "fs"
import { join, resolve } from "path"
import { SEED_ENTITIES, SEED_RELATIONSHIPS } from "../../src/domain/model/entities"
import { rule } from "./helpers"

const ROOT = resolve(import.meta.dirname, "../..")

/**
 * Every string any fixture row holds.
 *
 * Values rather than ids, deliberately: an id is only ever interesting because
 * something points at it, and reading the values is how a join-table row's
 * target counts as existing without this file knowing which column is which.
 */
const exists = new Set<string>()
for (const table of [...Object.values(SEED_ENTITIES), ...Object.values(SEED_RELATIONSHIPS)]) {
  for (const row of table as readonly Record<string, unknown>[]) {
    for (const value of Object.values(row)) {
      if (typeof value === "string") exists.add(value)
    }
  }
}

/**
 * The shape the Product Owner's ids have: a three-or-so letter kind, then
 * digits, sometimes with a role in between (`usr_coach_001`).
 *
 * Narrow on purpose. It matches what the model actually mints and nothing else,
 * so a test's own local identifier — `u1`, `child-2` — is not this check's
 * business. Those are worth removing too, and the projections are what does it.
 */
const ID = /"((?:team|evt|ply|org|usr|gam|div|ven|ses)_[a-z]*_?\d+)"/g

const files: string[] = []
const walk = (dir: string) => {
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) walk(path)
    else if (/\.tsx?$/.test(entry.name)) files.push(path)
  }
}
walk("tests")

const problems: string[] = []
let checked = 0

for (const file of files) {
  const lines = readFileSync(join(ROOT, file), "utf-8").split("\n")
  lines.forEach((line, i) => {
    if (line.includes("check-ignore")) return
    for (const match of line.matchAll(ID)) {
      checked += 1
      const id = match[1]!
      if (exists.has(id)) continue
      problems.push(
        `  ${file}:${i + 1}  ${id} — no fixture row holds this id\n` +
          `      Seed it in remy-sport-biz's domain/model/entities.ts and run\n` +
          `      'bun run ops domain', or add // check-ignore with the reason it\n` +
          `      must not exist.`,
      )
    }
  })
}

rule(
  "a test only names a row that exists",
  problems,
  `check-fixture-ids: ${problems.length} id(s) that no fixture defines\n\n` +
    problems.join("\n") +
    "\n\n  An invented id is a hole in the seed that got papered over instead of\n" +
    "  reported. The camp's Sessions tab shipped empty for three days behind one.\n",
  `check-fixture-ids: ${checked} fixture id(s) named in tests, all of them real`,
)
