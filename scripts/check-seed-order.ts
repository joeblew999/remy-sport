/**
 * Fail if seed.sql inserts a row before the row it points at.
 *
 * The gap this closes is not the ordering — that is fixed in seed.ts — it is
 * that nothing could tell. `check:seed` compares seed.sql against the model, so
 * a correctly-generated file in an unusable order passes it. The worker tests
 * seed from the same bytes but through the D1 binding, where miniflare does not
 * enforce foreign keys the way remote D1 does. And production had been seeded
 * incrementally for months, so every parent row was already there.
 *
 * The result was that `team` was written 36 lines before the `org` its NOT NULL
 * `org_id` references, and nothing in the repo could say so. Staging became the
 * first remote database built from nothing on 2026-09-01, and it failed at
 * `seed:remote` with FOREIGN KEY constraint failed — after the worker had
 * already been published.
 *
 * Static rather than executed: reading the order out of the file and the edges
 * out of the migrations costs milliseconds and needs no database, so it can sit
 * in `check` next to the other things that rot quietly. It cannot catch a row
 * whose parent is simply absent from the fixtures — that is `check:tables`' and
 * the FK's job at insert time — only one written in the wrong order.
 */

import { readFileSync, readdirSync } from "fs"
import { join, resolve } from "path"

const ROOT = resolve(import.meta.dir, "..")
const MIGRATIONS = join(ROOT, "src/db/migrations")

/** child -> parents, from every migration: a table can gain a foreign key later. */
function foreignKeys(): Map<string, Set<string>> {
  const edges = new Map<string, Set<string>>()
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(MIGRATIONS, file), "utf-8")
    for (const table of sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?`?(\w+)`?\s*\(([\s\S]*?)\n\);/g)) {
      const [, child, body] = table
      for (const fk of body!.matchAll(/REFERENCES `?(\w+)`?/g)) {
        const parent = fk[1]!
        // Self-references are satisfied within a table's own block or not at
        // all, and ordering cannot help either way.
        if (parent === child) continue
        if (!edges.has(child!)) edges.set(child!, new Set())
        edges.get(child!)!.add(parent)
      }
    }
  }
  return edges
}

/** The line each table is first inserted into. */
function firstInsert(): Map<string, number> {
  const seen = new Map<string, number>()
  const sql = readFileSync(join(ROOT, "src/db/seed.sql"), "utf-8").split("\n")
  sql.forEach((line, i) => {
    // `INSERT OR IGNORE INTO` is the common form here — insertOf() emits it for
    // any row without an upsert key. Matching only `INSERT INTO` sees a third of
    // the file and reports a tidy, wrong answer.
    const m = /^INSERT (?:OR IGNORE )?INTO `?(\w+)`?/.exec(line)
    if (m && !seen.has(m[1]!)) seen.set(m[1]!, i + 1)
  })
  return seen
}

const edges = foreignKeys()
const first = firstInsert()

const inversions: string[] = []
for (const [child, line] of first) {
  for (const parent of edges.get(child) ?? []) {
    const parentLine = first.get(parent)
    if (parentLine !== undefined && parentLine > line) {
      inversions.push(
        `  ${child} (line ${line}) references ${parent}, which is not inserted until line ${parentLine}`,
      )
    }
  }
}

if (inversions.length) {
  console.error(
    `check-seed-order: ${inversions.length} row(s) inserted before what they reference\n\n` +
      inversions.sort().join("\n") +
      `\n\n  A fresh database refuses these with FOREIGN KEY constraint failed. An\n` +
      `  existing one accepts them, because the parent is already there — which is\n` +
      `  why this can pass everywhere and fail on the next environment created.\n` +
      `  Fix the emit order in scripts/seed.ts, then re-run 'mise run seed:sql'.`,
  )
  process.exit(1)
}

console.log(
  `check-seed-order: ${first.size} tables seeded, none before what it references ` +
    `(${[...edges.values()].reduce((n, s) => n + s.size, 0)} foreign keys checked)`,
)
