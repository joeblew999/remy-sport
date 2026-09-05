/**
 * Nothing in the database is empty by accident.
 *
 * The project's notes named this mechanism on 2026-08-30 and said nothing
 * enforced it: "The mechanism would be a gate over the schema — 48 tables, 282
 * columns are enumerable — and a rule that must be remembered is the same class
 * of thing that already failed." It was 51 tables and 293 columns four days
 * later, which is the argument in one sentence.
 *
 * What went wrong while nothing checked: `event.description` was named in that
 * same paragraph as a column no row filled, whose section had only ever shown
 * its empty state. It was still empty four days later. Two whole tables the
 * model describes — a camp's timetable and its register — had never held a row,
 * so the Sessions tab shipped empty and the test covering it passed by inventing
 * a session at an event it called by a name no row holds. **Noticing was not
 * enough.**
 *
 * ## Three questions, because one of them was never asked
 *
 * `bun run ops coverage data` asks which *vocabulary codes* a fixture uses, and
 * answers 80/80. That is a real question and not this one — a code can be used
 * by one row while the column it sits in is null everywhere else.
 *
 *   1. Does every table hold a row?
 *   2. Does every column hold a value?
 *   3. Does every parent row have the thing that hangs off it?
 *
 * And a fourth that is the mirror of (2) and is the one that hid
 * `event.description` for four days: **does every column have a fixture field at
 * all?** The old report asked whether every fixture field has a column and said
 * "none missing", which was true and useless — the gap was the other way round,
 * and closing it needed a field added to the Product Owner's model rather than a
 * row added here. Somebody looking would have read a green line.
 *
 * ## Declared, not maximised
 *
 * **100% is the wrong target and chasing it makes the data worse.** Only some
 * users are players. Most schools do not run events. 119 children do not all
 * attend one camp in Chiang Mai.
 *
 * The seed already carries the scar from optimising a coverage number: all four
 * guardian rows used to be one person who was at once a PARENT, GRANDPARENT,
 * LEGAL_GUARDIAN and OTHER to four different children — written that way so the
 * vocabulary report would print GUARDIAN_TYPE 4/4. It did. It is not a family
 * anybody has.
 *
 * So every gap is *declared* rather than closed, and a declaration is a sentence
 * somebody can disagree with. What fails is a gap nobody has written a sentence
 * about — a new column, a new table, a new foreign key. Those arrive silently
 * today and are the entire reason this exists.
 *
 * The seed is read as SQL rather than as fixtures on purpose: these are the
 * bytes the database receives, so nothing here can be true of a model that the
 * generator then fails to write.
 */

import { readFileSync } from "fs"
import { resolve } from "path"
import { getTableColumns, getTableName } from "drizzle-orm"
import { rule } from "./helpers"
import type { SQLiteTable } from "drizzle-orm/sqlite-core"
import * as schema from "../../src/db/schema"

const ROOT = resolve(import.meta.dirname, "../..")

/**
 * Reference data. "How many age groups have a team" is not a question about
 * depth — these rows are the Product Owner's vocabulary, complete by
 * construction, and every one of them is already checked by
 * `bun run ops coverage data`.
 */
const VOCABULARY = new Set([
  "action", "age_group", "city", "coach_role", "event_format", "event_type",
  "game_status", "gender", "guardian_type", "invite_status", "locale",
  "notification_category", "notification_channel", "notification_type",
  "object_type", "org_role", "org_type", "position", "province", "relation",
  "role", "skill_tier", "user_status",
])

/** A table with no rows, and why that is correct. */
const EMPTY_TABLES: Record<string, string> = {
  session: "Better Auth writes a session at sign-in. A seeded row would be a login nobody performed.",
  verification: "Better Auth writes a verification when a code is issued, and consumes it on use.",
  notification_sent:
    "The scheduler's idempotency record — it inserts before it sends and treats a conflict as " +
    "'somebody else has this'. Seeding it would suppress the notifications it exists to make safe.",
}

/**
 * A column no seeded row gives a value, and why.
 *
 * Keyed `table.column`. Two kinds live here and the difference matters: a value
 * a live system mints (a session token, a verification secret), and a value
 * there is nowhere to put (an avatar with no bucket behind it). Neither is a
 * fixture somebody forgot.
 */
const EMPTY_COLUMNS: Record<string, string> = {
  "account.access_token": "No OAuth provider. These accounts sign in by emailed code.",
  "account.refresh_token": "No OAuth provider.",
  "account.id_token": "No OAuth provider.",
  "account.access_token_expires_at": "No OAuth provider.",
  "account.refresh_token_expires_at": "No OAuth provider.",
  "account.scope": "No OAuth provider.",
  "account.password": "`emailAndPassword` is off; `account.password` is nullable for exactly this reason.",
  "user.image":
    "There is nowhere to host one. A seeded URL renders a broken image on every screen showing " +
    "that person — strictly worse than the fallback it would replace. Revisit when there is a bucket.",
  "userNotificationChannel.secret": "Minted when a channel is verified. A fixture one would be a lie about a live value.",
}

type Expectation =
  | { every: true; why: string }
  | { some: number; why: string }
  | { none: true; why: string }

/**
 * For each way one table depends on another: how much of the parent must have it.
 *
 * Keyed `parent->child via <column>`, which is how a schema with two paths
 * between the same pair — a game's home team and its away team — stays two
 * questions rather than one.
 *
 * `every` is the interesting one and there are few of them. Most of this file is
 * `some`, and a `some` number is a floor rather than a target: it says "this case
 * must remain reachable", so it fails when the data thins out and never when it
 * grows. That is the shape that survives the Product Owner adding a school.
 */
const EXPECTED: Record<string, Expectation> = {
  // ── Every parent, no exceptions ───────────────────────────────────────────
  "user->account via user_id": { every: true, why: "A user who cannot sign in is not a user. The seed writes one credential account per person." },
  "player->playerTeam via player_id": { every: true, why: "A player belongs to a team; a player belonging to none has no screen to appear on." },
  "team->playerTeam via team_id": { every: true, why: "A team with no roster renders an empty page nobody would ship." },
  "team->eventTeam via team_id": { every: true, why: "A team that has entered nothing cannot appear in a schedule, a standings table or a result." },
  "org->org_member via org_id": { every: true, why: "Somebody must be able to act for a school. Eight of ten had nobody until 2026-09-03." },
  "game->gameReferee via game_id": { every: true, why: "A game with no official is not scheduled. This caught two games added without one." },
  "event->eventVenue via event_id": { every: true, why: "An event has to happen somewhere, even when a single session's court is still TBC." },
  "venue->eventVenue via venue_id": { every: true, why: "A venue nothing uses is a row no screen can reach. ven_004 was one until 2026-09-03." },
  "eventSession->sessionAttendance via session_id": { every: true, why: "A session nobody attended cannot exercise the register, which is the feature." },

  // ── A floor, because the model says not everyone ──────────────────────────
  "team->teamCoach via team_id": { some: 14, why: "Every team but one. team_015 stays unclaimed on purpose: a school that signs up before its staff do is a real state, and it is the only row covering it." },
  "user->teamCoach via user_id": { some: 9, why: "Coaches coach; nobody else does. Nine of the twenty-two people are coaching staff." },
  "user->org_member via user_id": { some: 11, why: "Half the seeded people hold a role at a school. The other half are players, parents and officials." },
  "org->team via org_id": { some: 9, why: "The federation (org_004) fields no teams and should not. Every school does." },
  "org->event via org_id": { some: 3, why: "Most schools play in events rather than running them. Three run one." },
  "user->event via organizer_user_id": { some: 3, why: "Organisers organise. Three of twenty-two." },
  "event->eventTeam via event_id": { some: 3, why: "The camp takes individual entries rather than teams — that is what makes it a camp." },
  "event->eventDivision via event_id": { some: 3, why: "Derived from eventTeam, so it is empty exactly where that is." },
  "event->game via event_id": { some: 2, why: "A camp runs sessions and a showcase displays players; neither plays fixtures. Its two entries are in different divisions and could not meet." },
  "event->eventPlayer via event_id": { some: 2, why: "Individual registration is how a camp and a showcase work. A league enters teams." },
  "event->eventCoOrganizer via event_id": { some: 2, why: "Running an event alone is the ordinary case; sharing it is the one with an invite flow behind it." },
  "event->eventSession via event_id": { some: 1, why: "Only a camp has a timetable. There is one camp." },
  "venue->eventSession via venue_id": { some: 1, why: "Same: the camp's court. Other venues host games instead." },
  "venue->game via venue_id": { some: 3, why: "The camp's Chiang Mai complex hosts sessions, not fixtures." },
  "team->game via home_team_id": { some: 11, why: "team_015 plays nothing — the registered-but-unplayed case a standings table must handle, which aTeamWithNoGamesIn asserts is still reachable." },
  "team->game via away_team_id": { some: 12, why: "As above, from the other end of the fixture." },
  "division->eventTeam via division_id": { some: 5, why: "Five of six divisions are entered. The sixth is reachable and simply has no entry yet." },
  "division->eventDivision via division_id": { some: 5, why: "Derived from eventTeam." },
  "player->eventPlayer via player_id": { some: 3, why: "Three children are registered to the camp. The other 116 play for their school team instead." },
  "player->sessionAttendance via player_id": { some: 3, why: "Only the camp's three registered players can attend its sessions." },
  "player->guardian via player_id": { some: 4, why: "Most rosters are children whose parents have not signed up. Four have a registered guardian, across three households." },
  "user->guardian via user_id": { some: 3, why: "Three of the seeded people are somebody's parent or guardian." },
  "user->player via user_id": { some: 2, why: "A player old enough to hold an account is the minority. Two do." },
  "user->subscription via user_id": { some: 4, why: "Following is opt-in. Four people follow something." },
  "user->gameReferee via user_id": { some: 2, why: "Two referees, and both officiate." },
  "user->eventCoOrganizer via user_id": { some: 2, why: "Two people have been invited to co-organise." },
  "user->userNotificationChannel via user_id": { some: 20, why: "Everyone who can hold a session is reachable. The two without are SUSPENDED and DEACTIVATED, who are refused before a notification is ever addressed to them." },
  "user->userNotificationPreference via user_id": { some: 20, why: "As above. A preference row is how a reader turns one type off." },
  "game->playerGameStat via game_id": { some: 1, why: "One seeded game has a box score. A volunteer at the scorer's table fills these in and most games would not have one — lines for all 33 would make the product look like it collects something it does not." },
  "player->playerGameStat via player_id": { some: 13, why: "The fourteen who played gam_001, minus ply_050, who is on Montfort's roster and did not get on the floor — the only row covering 'no line recorded' as distinct from 'scored nothing'." },
  "game->gameBroadcast via game_id": { some: 1, why: "One LIVE game is being broadcast, so the watch and broadcast pages have been seen against a real row." },
  "user->gameBroadcast via user_id": { some: 1, why: "The organiser running that broadcast." },

  // ── Zero, and it must stay zero ───────────────────────────────────────────
  "user->session via user_id": { none: true, why: "Better Auth writes a session at sign-in. A seeded one would be a login nobody performed." },
}

/** Columns the generator synthesises, so "no fixture field" says nothing. */
const SYNTHESISED = new Set([
  "user.name", "user.email_verified", "user.created_at", "user.updated_at", "user.role", "user.biz_id",
  "team.name", "team.created_at", "team.updated_at",
  "event.name", "event.created_at", "event.updated_at",
])

// ── Read the bytes the database actually receives ────────────────────────────

const QUOTE = String.fromCharCode(39)

interface Seen { rows: Record<string, string>[] }
const seen: Record<string, Seen> = {}

for (const line of readFileSync(resolve(ROOT, "src/db/seed.sql"), "utf8").split("\n")) {
  const m = line.match(
    /^INSERT (?:OR IGNORE )?INTO `?(\w+)`? \(([^)]*)\) VALUES \((.*?)\)(?: ON CONFLICT|;|$)/,
  )
  if (!m) continue
  const cols = m[2]!.split(",").map((c) => c.trim().replace(/`/g, ""))
  const values: string[] = []
  let cur = "", depth = 0, inString = false
  const raw = m[3]!
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]!
    if (inString) {
      if (ch === QUOTE && raw[i + 1] === QUOTE) { cur += QUOTE + QUOTE; i++; continue }
      if (ch === QUOTE) inString = false
      cur += ch
      continue
    }
    if (ch === QUOTE) { inString = true; cur += ch; continue }
    if (ch === "(") depth++
    if (ch === ")") depth--
    if (ch === "," && depth === 0) { values.push(cur.trim()); cur = ""; continue }
    cur += ch
  }
  values.push(cur.trim())
  const row: Record<string, string> = {}
  cols.forEach((c, i) => (row[c] = values[i] ?? "NULL"))
  ;(seen[m[1]!] ??= { rows: [] }).rows.push(row)
}

const tables = new Map<string, { table: SQLiteTable; columns: string[] }>()
for (const value of Object.values(schema)) {
  try {
    const name = getTableName(value as SQLiteTable)
    const columns = Object.values(getTableColumns(value as SQLiteTable)).map((c) => c.name)
    if (name && columns.length) tables.set(name, { table: value as SQLiteTable, columns })
  } catch {
    // A relations() definition or a zod schema, not a table.
  }
}

const problems: string[] = []
const declared: string[] = []

// ── 1. Every table holds a row, or says why not ──────────────────────────────

for (const [name] of tables) {
  if (VOCABULARY.has(name) || seen[name]?.rows.length) continue
  const why = EMPTY_TABLES[name]
  if (why) declared.push(`  ${name} — ${why}`)
  else {
    problems.push(
      `  ${name} has no seeded row.\n` +
        `      Seed it, or add it to EMPTY_TABLES with the reason it is correctly empty.`,
    )
  }
}

// ── 2. Every column holds a value, or says why not ───────────────────────────

let filled = 0
let total = 0
for (const [name, { columns }] of tables) {
  if (VOCABULARY.has(name)) continue
  const rows = seen[name]?.rows
  for (const column of columns) {
    total += 1
    const any = rows?.some((r) => (r[column] ?? "NULL").toUpperCase() !== "NULL")
    if (any) { filled += 1; continue }
    // A column in a table that is correctly empty is covered by that decision.
    if (!rows?.length && EMPTY_TABLES[name]) continue
    const key = `${name}.${column}`
    if (EMPTY_COLUMNS[key]) declared.push(`  ${key} — ${EMPTY_COLUMNS[key]}`)
    else {
      problems.push(
        `  ${key} is NULL in all ${rows?.length ?? 0} seeded rows.\n` +
          `      Nothing has rendered it. Give it a value, or add it to EMPTY_COLUMNS with the reason.`,
      )
    }
  }
}

// ── 3. Every column has a fixture field — the direction that hid description ─

for (const [name, { columns }] of tables) {
  if (VOCABULARY.has(name) || !seen[name]?.rows.length) continue
  const written = new Set(Object.keys(seen[name]!.rows[0]!))
  for (const column of columns) {
    if (written.has(column)) continue
    if (SYNTHESISED.has(`${name}.${column}`)) continue
    if (EMPTY_COLUMNS[`${name}.${column}`] || EMPTY_TABLES[name]) continue
    problems.push(
      `  ${name}.${column} has no fixture field — the generator never names it.\n` +
        `      This is a change to the Product Owner's model, not a row here: add the field\n` +
        `      in remy-sport-biz's domain/model/entities.ts, then 'bun run ops domain'.`,
    )
  }
}

// ── 4. Every parent row has what hangs off it, to the declared degree ────────

const edges: { key: string; have: number; of: number }[] = []
for (const [child, { table }] of tables) {
  const inline =
    (table as unknown as Record<symbol, unknown>)[
      Symbol.for("drizzle:SQLiteInlineForeignKeys")
    ] as { reference: () => { foreignTable: SQLiteTable; foreignColumns: { name: string }[]; columns: { name: string }[] } }[] | undefined
  for (const fk of inline ?? []) {
    const ref = fk.reference()
    const parent = getTableName(ref.foreignTable)
    if (VOCABULARY.has(parent)) continue
    const parentRows = seen[parent]?.rows ?? []
    if (!parentRows.length) continue
    const parentColumn = ref.foreignColumns[0]!.name
    const childColumn = ref.columns[0]!.name
    const held = new Set(
      (seen[child]?.rows ?? [])
        .map((r) => r[childColumn])
        .filter((v): v is string => !!v && v.toUpperCase() !== "NULL"),
    )
    const have = parentRows.filter((r) => held.has(r[parentColumn]!)).length
    edges.push({ key: `${parent}->${child} via ${childColumn}`, have, of: parentRows.length })
  }
}

for (const { key, have, of } of edges.sort((a, b) => a.key.localeCompare(b.key))) {
  const expectation = EXPECTED[key]
  if (!expectation) {
    problems.push(
      `  ${key} — ${have}/${of} parent rows have one, and nothing says what they should.\n` +
        `      A new foreign key arrives here. Add it to EXPECTED as every / some: n / none,\n` +
        `      with a sentence somebody can disagree with.`,
    )
    continue
  }
  if ("every" in expectation && have < of) {
    problems.push(
      `  ${key} — ${have}/${of}, and it is declared 'every'.\n` +
        `      ${expectation.why}\n` +
        `      Seed the missing ones, or change the expectation and say why it changed.`,
    )
  } else if ("some" in expectation && have < expectation.some) {
    problems.push(
      `  ${key} — ${have}/${of}, below the declared floor of ${expectation.some}.\n` +
        `      ${expectation.why}\n` +
        `      The data thinned out. That case is no longer covered.`,
    )
  } else if ("none" in expectation && have > 0) {
    problems.push(
      `  ${key} — ${have}/${of}, and it is declared 'none'.\n      ${expectation.why}`,
    )
  }
}

// ── Report ───────────────────────────────────────────────────────────────────

const everyCount = Object.values(EXPECTED).filter((e) => "every" in e).length

rule(
  "nothing in the database is empty by accident",
  problems,
  `check-seed-coverage: ${problems.length} thing(s) empty with nothing saying why\n\n` +
    problems.join("\n") +
    `\n\n  Every gap is allowed. An undeclared one is not — that is how event.description\n` +
    `  stayed empty for four days after being written up as a defect.\n`,
  `check-seed-coverage: ${filled}/${total} columns filled, ` +
    `${edges.length} dependencies declared (${everyCount} must be complete), ` +
    `${declared.length} documented gap(s)`,
)
