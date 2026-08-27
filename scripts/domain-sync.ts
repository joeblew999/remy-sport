/**
 * Copy the Product Owner's model in. Verbatim — nothing is transformed.
 *
 * This replaced a 900-line generator that read JSONL and emitted TypeScript.
 * Every silent bug in that pipeline was a transform failing quietly: a
 * `full_names` key drizzle spells `fullNames`, a NOT NULL `*_en` pivot left out
 * of an INSERT, a column type inferred from a sample value, one naming rule
 * implemented three times and matching nothing twice. A copy has none of that
 * surface, because there is nothing between the two files.
 *
 * The model is authored as TypeScript upstream now, so what proves it agrees
 * with this database is the seed: `db.insert(city).values(CITY)` does not
 * compile if a field and a column disagree. That is a stronger guarantee than
 * any script comparing two representations, and it needs no script.
 *
 * The copies are committed, so a build never needs the companion repo — it is
 * private, and requiring it would put a credential in every deploy. `--check`
 * fails when a committed copy has drifted from upstream.
 */
import { existsSync, readFileSync, writeFileSync } from "fs"
import { resolve } from "path"

const BIZ = resolve(import.meta.dir, "../../remy-sport-biz/domain/model")
const HERE = resolve(import.meta.dir, "../src/domain/model")
const FILES = ["names.ts", "vocabularies.ts", "entities.ts"]
const check = process.argv.includes("--check")

if (!existsSync(BIZ)) {
  console.error(
    `domain:sync: ${BIZ} not found.\n` +
      `  The model lives in remy-sport-biz, which AGENTS.md expects cloned at\n` +
      `  ../remy-sport-biz/. Clone it, or skip this — the copies are committed,\n` +
      `  so building does not need it.`,
  )
  process.exit(check ? 0 : 2)
}

const stale: string[] = []
for (const file of FILES) {
  const from = readFileSync(resolve(BIZ, file), "utf8")
  const to = resolve(HERE, file)
  if (check) {
    if (!existsSync(to) || readFileSync(to, "utf8") !== from) stale.push(file)
  } else {
    writeFileSync(to, from)
  }
}

if (check && stale.length) {
  console.error(
    `domain:sync: ${stale.length} file(s) differ from remy-sport-biz — run 'mise run domain:sync':\n` +
      stale.map((f) => `  ${f}`).join("\n"),
  )
  process.exit(1)
}
console.log(
  check
    ? `domain-sync: ${FILES.length} files match remy-sport-biz`
    : `domain-sync: copied ${FILES.length} files from remy-sport-biz`,
)
