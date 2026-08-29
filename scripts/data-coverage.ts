/**
 * Which of the model's vocabulary does the seed actually exercise?
 *
 * The model describes a product; the fixtures are the only instance of it that
 * anybody — a test, a page, a person clicking around a demo — ever sees. A code
 * the data never uses is a code no screen has ever rendered and no test has ever
 * covered, and the first time it appears will be in production.
 *
 * That is a different question from `model:coverage`, which asks which *actions*
 * the API implements. This asks which *values* exist to act on.
 *
 * Reported, not enforced. Some gaps are correct: the model offers six divisions
 * because Thai school basketball has six, and a demo does not need to run all of
 * them. The point is that the gaps are chosen rather than discovered.
 */

import * as vocab from "../src/domain/vocabularies"
import { PILOT_SCOPE } from "../src/domain/vocabularies"
import { SEED_ENTITIES, SEED_RELATIONSHIPS } from "../src/domain/model/entities"
import * as schema from "../src/db/schema"

const rows = { ...SEED_ENTITIES, ...SEED_RELATIONSHIPS } as Record<
  string,
  readonly Record<string, unknown>[]
>

/** Every value any fixture row holds, as strings, for membership testing. */
const used = new Set<string>()
for (const table of Object.values(rows)) {
  for (const row of table) {
    for (const value of Object.values(row)) {
      if (typeof value === "string") used.add(value)
    }
  }
}

type Term = { code: string }
const isVocabulary = (v: unknown): v is readonly Term[] =>
  Array.isArray(v) && v.length > 0 && typeof (v[0] as Term)?.code === "string"

/**
 * A vocabulary term can reference another vocabulary, and that counts as use.
 *
 * `NOTIFICATION_TYPE` rows carry a `categoryCode`, and `CITY` rows a
 * `provinceCode` — so every category is exercised the moment its types exist,
 * without any fixture naming a category directly. Reading only the fixture
 * tables reported five categories as holes that were nothing of the kind.
 *
 * `code` is excluded, or every term would mark itself used and the whole report
 * would read 100%.
 */
for (const value of Object.values(vocab)) {
  if (!isVocabulary(value)) continue
  for (const term of value) {
    for (const [field, v] of Object.entries(term)) {
      if (field !== "code" && typeof v === "string") used.add(v)
    }
  }
}

/**
 * Vocabularies whose codes are never stored in a row, so "unused" means nothing.
 *
 * ACTION and RELATION describe the authorisation model — they are the names of
 * rules, not values a fixture can hold. Counting them made the first run of this
 * report claim 149 missing codes, which buried the dozen that were real.
 */
const NOT_STORED = new Set(["ACTION", "RELATION"])

/**
 * Codes the model defines that this product deliberately never stores.
 *
 * `subscription.object_type_code` can hold any OBJECT_TYPE, but the model only
 * defines FOLLOW_ actions for PLAYER, TEAM and EVENT — so a row naming ORG,
 * GAME or PLATFORM would be one the API refuses to create. Expected, not a hole.
 */
const EXPECTED: Record<string, string[]> = {
  OBJECT_TYPE: ["ORG", "GAME", "PLATFORM"],
  // A push endpoint is minted by a browser at `subscribe()` time and belongs to
  // that browser. A fixture one would be a URL at a host that does not exist,
  // and `notify` would POST to it on every score — so this channel is real,
  // fully implemented, and correctly has no seeded row.
  NOTIFICATION_CHANNEL: ["PUSH"],
}

/**
 * Which vocabulary each `PILOT_SCOPE` list constrains.
 *
 * The scope itself lives in the Product Owner's model, not here — which of the
 * sport the platform runs is a business decision, and holding it in this repo
 * meant a script had an opinion about market coverage. This is only the mapping
 * from a scope list to the vocabulary it narrows.
 */
const SCOPED_BY: Record<string, keyof typeof PILOT_SCOPE> = {
  AGE_GROUP: "ageGroups",
  PROVINCE: "provinces",
  CITY: "cities",
  EVENT_FORMAT: "eventFormats",
  GENDER: "genders",
  ORG_TYPE: "orgTypes",
}

console.log("\n  ── Vocabulary exercised by the fixtures ──\n")

let totalCodes = 0
let totalUsed = 0
const gaps: string[] = []
const scopeNotes: string[] = []

for (const [name, value] of Object.entries(vocab)) {
  // Skip the derived `_CODES` arrays and the maps; only the term lists matter.
  if (!isVocabulary(value) || name.endsWith("_CODES") || NOT_STORED.has(name)) continue
  const expected = new Set(EXPECTED[name] ?? [])
  const codes = value.map((t) => t.code).filter((c) => !expected.has(c))

  // Anything the pilot does not run is not expected to have fixtures. What it
  // *does* run must, or a feature is built against data that does not exist.
  const scopeKey = SCOPED_BY[name]
  const live = scopeKey ? new Set<string>(PILOT_SCOPE[scopeKey]) : null
  const inScope = codes.filter((c) => !live || live.has(c))
  const outOfScope = codes.filter((c) => live && !live.has(c))

  const hit = inScope.filter((c) => used.has(c))
  const missing = inScope.filter((c) => !used.has(c))
  totalCodes += inScope.length
  totalUsed += hit.length
  const mark = missing.length === 0 ? "✓" : "!"
  const note = expected.size ? `  (${expected.size} never stored, by design)` : ""
  console.log(`  ${mark} ${name.padEnd(22)} ${hit.length}/${inScope.length} in scope${note}`)
  if (missing.length) gaps.push(`      ${name}: ${missing.join(", ")}`)
  if (outOfScope.length) {
    scopeNotes.push(`      ${name}: ${outOfScope.join(", ")} — outside PILOT_SCOPE`)
  }
}

if (gaps.length) {
  console.log("\n  ! Holes — the model says these exist and no row does:\n")
  for (const g of gaps) console.log(g)
}
if (scopeNotes.length) {
  console.log("\n  · Outside the pilot — the model describes more sport than the product runs:\n")
  for (const n of scopeNotes) console.log(n)
}

/**
 * A relation nothing instantiates cannot be tested and no page can render.
 *
 * Read from the same structured columns the resolver executes, so this cannot
 * drift from what `holds` would answer.
 */
console.log("\n  ── Relations with at least one instance ──\n")

const camel = (s: string) =>
  s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()).replace(/s$/, "")

const relationRows = (sourceTable: string) => {
  // The fixtures name tables in plural snake_case; the seed exports them camel.
  const key = Object.keys(rows).find(
    (k) => k.toLowerCase() === sourceTable.replace(/_/g, "").toLowerCase(),
  )
  return key ? rows[key] : undefined
}

const empty: string[] = []
let instantiated = 0
for (const r of vocab.RELATION) {
  if (r.via !== "table") {
    instantiated += 1 // role and everyone relations need no row
    continue
  }
  const table = relationRows(r.sourceTable!)
  const any = table?.some((row) => {
    if (r.filterColumn && row[camel(r.filterColumn)] !== r.filterValue) return false
    return true
  })
  if (any) instantiated += 1
  else empty.push(`      ${r.code} (${r.sourceTable})`)
}

console.log(`  ${instantiated}/${vocab.RELATION.length} relations have somewhere to come from`)
if (empty.length) {
  console.log("\n  Relations nothing in the fixtures instantiates:\n")
  for (const e of empty) console.log(e)
}

/**
 * Fields the model carries that no column stores.
 *
 * The gap this report was missing, and the one that matters most: a fixture can
 * name a value the database has nowhere to put, and everything downstream looks
 * fine. `SEED_ENTITIES.users` carry `statusCode` — ACTIVE, PENDING_APPROVAL,
 * SUSPENDED, DEACTIVATED — and the `user` table has no such column, so the
 * model describes a user lifecycle the product does not implement. The coverage
 * numbers above read it as "used" because the fixture holds it; the database
 * never sees it.
 *
 * Reported rather than enforced. Some of these are correct — a fixture id that
 * exists only to wire other fixtures together — but each one is the model and
 * the schema disagreeing, and that should be a decision rather than a surprise.
 */
console.log("\n  ── Model fields with nowhere to be stored ──\n")

const TABLE_FOR: Record<string, string> = {
  users: "user",
  orgs: "org",
  teams: "team",
  events: "event",
  players: "player",
  venues: "venue",
  divisions: "division",
  games: "game",
  guardians: "guardian",
  orgMembers: "orgMember",
  playerTeams: "playerTeam",
  teamCoaches: "teamCoach",
  eventTeams: "eventTeam",
  eventVenues: "eventVenue",
  eventPlayers: "eventPlayer",
  eventCoOrganizers: "eventCoOrganizer",
  gameReferees: "gameReferee",
  subscriptions: "subscription",
  userNotificationChannels: "userNotificationChannel",
  userNotificationPreferences: "userNotificationPreference",
}

/**
 * Fields that are stored, just not under that name or in that table.
 *
 * Not every mismatch is a gap. `roleCode` becomes Better Auth's `role` column
 * through STORED_ROLE, and a person's phone and LINE id are
 * `userNotificationChannel` rows — which is the better shape, because a person
 * has several of each and a column has room for one.
 */
const REPRESENTED: Record<string, Record<string, string>> = {
  users: {
    roleCode: "stored as Better Auth's `role`, translated through STORED_ROLE",
    phone: "a userNotificationChannel row on the SMS channel",
    lineId: "a userNotificationChannel row on the LINE channel",
  },
}

const dropped: string[] = []
const elsewhere: string[] = []
for (const [fixture, table] of Object.entries(TABLE_FOR)) {
  const rowsOf = rows[fixture]
  const drizzleTable = (schema as Record<string, unknown>)[table] as
    | Record<string, { name?: string }>
    | undefined
  if (!rowsOf?.length || !drizzleTable) continue

  // Drizzle exposes each column under its property name, carrying the SQL name.
  const columns = new Set(
    Object.values(drizzleTable)
      .map((c) => (c && typeof c === "object" ? c.name : undefined))
      .filter((n): n is string => typeof n === "string"),
  )
  const snake = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
  const fields = Object.keys(rowsOf[0]!)
  const known = REPRESENTED[fixture] ?? {}
  const missing = fields.filter((f) => !columns.has(snake(f)) && !columns.has(f))
  const real = missing.filter((f) => !(f in known))
  if (real.length) dropped.push(`      ${fixture}: ${real.join(", ")}`)
  for (const f of missing.filter((x) => x in known)) {
    elsewhere.push(`      ${fixture}.${f} — ${known[f]}`)
  }
}

if (dropped.length) {
  for (const d of dropped) console.log(d)
} else {
  console.log("      none — every field the fixtures carry has a column")
}
if (elsewhere.length) {
  console.log("\n      Stored elsewhere, deliberately:\n")
  for (const e of elsewhere) console.log(e)
}

console.log(
  `\n  ${totalUsed}/${totalCodes} vocabulary codes used, ` +
    `${vocab.RELATION.length - empty.length}/${vocab.RELATION.length} relations instantiated, ` +
    `${dropped.length} fixture table(s) carrying fields with no column\n`,
)
