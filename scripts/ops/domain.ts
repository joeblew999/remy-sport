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
 *
 * ## It says what moved, not just that something did
 *
 * This used to print "copied 3 files". A sync could bring in sixty-two provinces
 * and a reshaped set of division names and read identically to a sync that
 * changed nothing — so the only way to know was to diff by hand, and on
 * 2026-08-31 nobody did: 196 lines of model change landed in an uncommitted tree
 * and were swept into a commit whose message says the model did not change.
 *
 * So it names the collections that grew or shrank, and the codes that came and
 * went. `--check` says the same thing before you sync, which is the moment it is
 * most useful.
 */
import { existsSync, readFileSync, writeFileSync } from "fs"
import { resolve } from "path"

const BIZ = resolve(import.meta.dir, "../../../remy-sport-biz/domain/model")
const HERE = resolve(import.meta.dir, "../../src/domain/model")
const SETTINGS = resolve(import.meta.dir, "../../project.inlang/settings.json")
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

/**
 * One derived file, and it is not a copy.
 *
 * Paraglide reads its locale list from project.inlang/settings.json, and that
 * list is the model's `ALL_LOCALES`. The deleted generator wrote it; nothing did
 * afterwards, so adding a language upstream would have compiled no messages for
 * it and nobody would have been told. Written here because this is the one place
 * that already knows when the model changed.
 */
function inlangSettings(): string {
  const model = readFileSync(resolve(BIZ, "vocabularies.ts"), "utf8")
  const locales = [...(model.match(/export const ALL_LOCALES = \[(.*?)\]/s)?.[1] ?? "").matchAll(/"(\w+)"/g)].map(
    (m) => m[1],
  )
  if (!locales.length) {
    console.error("domain:sync: could not read ALL_LOCALES from the model")
    process.exit(2)
  }
  const settings = JSON.parse(readFileSync(SETTINGS, "utf8")) as { locales: string[] }
  settings.locales = locales
  return JSON.stringify(settings, null, 2) + "\n"
}

/**
 * The named collections in one model file, as sets of their entry keys.
 *
 * Read out of the text rather than imported. These files are the *upstream*
 * version — not yet copied, possibly not even valid against this repo's
 * types — so evaluating them is not an option, and a summary is not worth
 * making the sync depend on the model compiling.
 *
 * `code` for the vocabularies, `id` for the entities. A join table has neither —
 * `eventTeams` rows are keyed by the triple they carry — so those fall back to
 * the row text itself, which still diffs correctly and is reported as a count
 * rather than itemised. Reading them as "no keys" would have said `0 -> 0` and
 * hidden every change to a registration.
 */
function collections(source: string): Map<string, string[]> {
  const out = new Map<string, string[]>()
  const keysIn = (block: string, pattern: RegExp): string[] => {
    const keys = [...block.matchAll(pattern)].map((k) => k[1]!)
    if (keys.length) return keys
    // No identity column: the row is its own key.
    return block
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("{"))
  }
  for (const m of source.matchAll(/export const ([A-Z_][A-Z0-9_]*)[^=\n]*=\s*\[(.*?)\n\]/gs)) {
    out.set(m[1]!, keysIn(m[2]!, /\b(?:code|id):\s*"([^"]+)"/g))
  }
  // SEED_ENTITIES / SEED_RELATIONSHIPS are one object of many named lists, and
  // the lists are what a reader cares about — "users" and "eventTeams", not
  // "SEED_ENTITIES".
  for (const outer of source.matchAll(/export const SEED_\w+ = \{(.*?)\n\} as const/gs)) {
    for (const inner of outer[1]!.matchAll(/\n  (\w+): \[(.*?)\n  \]/gs)) {
      out.set(inner[1]!, keysIn(inner[2]!, /"(?:code|id)":"([^"]+)"/g))
    }
  }
  return out
}

/** What changed between two versions of one file, in the model's own terms. */
function describe(file: string, before: string, after: string): string[] {
  if (before === after) return []
  const old = collections(before)
  const now = collections(after)
  const lines: string[] = []

  for (const [name, keys] of now) {
    const was = old.get(name)
    if (!was) {
      lines.push(`    ${name.padEnd(22)} new, ${keys.length} entries`)
      continue
    }
    if (was.length === keys.length && was.every((k, i) => k === keys[i])) continue

    const added = keys.filter((k) => !was.includes(k))
    const removed = was.filter((k) => !keys.includes(k))
    const delta = [
      added.length ? `+${added.length}` : "",
      removed.length ? `-${removed.length}` : "",
    ]
      .filter(Boolean)
      .join(" ")
    lines.push(
      `    ${name.padEnd(22)} ${was.length} -> ${keys.length}${delta ? `  ${delta}` : "  (reordered or edited)"}`,
    )
    // A handful by name; a long list is a count, because sixty-two province
    // codes down the terminal is not a summary.
    for (const [label, list] of [["added", added], ["removed", removed]] as const) {
      if (!list.length) continue
      // Row-keyed collections have no name worth printing — the count is the
      // information, and six lines of JSON is not a summary.
      if (list.some((k) => k.startsWith("{"))) continue
      const shown = list.slice(0, 6).join(", ")
      lines.push(`      ${label}: ${shown}${list.length > 6 ? `, and ${list.length - 6} more` : ""}`)
    }
  }

  for (const name of old.keys()) {
    if (!now.has(name)) lines.push(`    ${name.padEnd(22)} gone`)
  }

  // A file can change without any collection changing: the 2026-08-31 sync
  // reshaped how division names are composed, which edits field values and adds
  // or removes nothing. Worth saying precisely rather than "something changed".
  return lines.length
    ? [`  ${file}`, ...lines]
    : [`  ${file.padEnd(24)} no entries added or removed — field values or prose changed`]
}

const stale: string[] = []
const summary: string[] = []
for (const file of FILES) {
  const from = readFileSync(resolve(BIZ, file), "utf8")
  const to = resolve(HERE, file)
  const current = existsSync(to) ? readFileSync(to, "utf8") : ""
  summary.push(...describe(file, current, from))
  if (check) {
    if (current !== from) stale.push(file)
  } else {
    writeFileSync(to, from)
  }
}

const settings = inlangSettings()
if (check) {
  if (readFileSync(SETTINGS, "utf8") !== settings) stale.push("project.inlang/settings.json")
} else {
  writeFileSync(SETTINGS, settings)
}

if (check && stale.length) {
  console.error(
    `domain:sync: ${stale.length} file(s) differ from remy-sport-biz — run 'mise run domain:sync':\n` +
      stale.map((f) => `  ${f}`).join("\n") +
      (summary.length ? `\n\nWhat would change:\n${summary.join("\n")}` : ""),
  )
  process.exit(1)
}
console.log(
  check
    ? `domain-sync: ${FILES.length} files and the locale list match remy-sport-biz`
    : `domain-sync: copied ${FILES.length} files and ${JSON.parse(settings).locales.length} locales` +
        (summary.length ? `\n\nWhat changed:\n${summary.join("\n")}` : "\n  the model was already current"),
)
