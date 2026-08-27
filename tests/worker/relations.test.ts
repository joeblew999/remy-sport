import { env } from "cloudflare:test"
import { drizzle } from "drizzle-orm/d1"
import { describe, expect, it } from "vitest"
import * as schema from "../../src/db/schema"
import { SEED_ENTITIES, SEED_RELATIONSHIPS } from "../../src/domain/model/entities"
import { RELATION, STORED_ROLE } from "../../src/domain/vocabularies"
import { holds } from "../../src/api/relations"
import { can } from "../../src/api/base"
import type { Db } from "../../src/api/base"
import "./apply-migrations"

/**
 * Every relation the PO defines, resolved against the seeded database.
 *
 * decision-002 names tuple derivation as the thing most likely to be wrong —
 * "bugs in the relation-resolver will silently grant or deny access" — and it is
 * right, because a resolver that finds nothing fails closed. The symptom is an
 * unexplained 403, not an error, so nothing surfaces it except a test that knows
 * what the answer should be.
 *
 * These are not written per relation. The expected tuple is read out of the same
 * fixtures the seed is built from, so a relation added upstream is covered here
 * the moment it exists — and one whose derivation names the wrong column fails
 * without anyone thinking to check it.
 */

const db = drizzle(env.DB, { schema }) as unknown as Db

/**
 * A (user, object) pair the seed says holds this relation.
 *
 * The fixtures are keyed by their own file names and columns; the derivation
 * names the tables the rows actually land in, and `FIXTURE_TABLE` maps between
 * them. Organisation membership used to be the exception, because it landed in
 * a table Better Auth owned; it is `org_member` now, with the PO's own column
 * names, so there is no longer a special case here.
 */
function seededTuple(code: string): { userId: string; objectId: string } | null {
  const r = RELATION.find((x) => x.code === code)!
  if (r.via !== "table") return null


  const key = r.sourceTable!.replace(/_(\w)/g, (_, c: string) => c.toUpperCase())
  const rows = ((SEED_RELATIONSHIPS as Record<string, unknown>)[key] ??
    (SEED_ENTITIES as Record<string, unknown>)[key]) as Record<string, unknown>[] | undefined
  if (!rows) return null

  const col = (c: string) => c.replace(/_(\w)/g, (_, x: string) => x.toUpperCase())

  /**
   * The user this row names — through a second table where the link does not
   * carry one. `player_teams` holds a player, and only `players` knows whether
   * that player has an account at all: minors usually do not.
   */
  const userOf = (row: Record<string, unknown>): string | null => {
    if (!r.throughTable) return (row[col(r.userColumn!)] as string) ?? null
    const throughKey = r.throughTable.replace(/_(\w)/g, (_, c: string) => c.toUpperCase())
    const via = (SEED_ENTITIES as Record<string, unknown>)[throughKey] as
      | Record<string, unknown>[]
      | undefined
    const parent = via?.find((p) => p.id === row[col(r.throughColumn!)])
    return (parent?.[col(r.userColumn!)] as string) ?? null
  }

  const match = rows.find((row) => {
    if (r.filterColumn && row[col(r.filterColumn)] !== r.filterValue) return false
    if (r.activeToColumn && row[col(r.activeToColumn)]) return false
    return userOf(row) != null && row[col(r.objectColumn!)] != null
  })
  if (!match) return null
  return { userId: userOf(match)!, objectId: String(match[col(r.objectColumn!)]) }
}

describe("every relation resolves against the seeded data", () => {
  const tableShaped = RELATION.filter((r) => r.via === "table")

  it.each(tableShaped.map((r) => [r.code] as const))(
    "%s holds for the pair the fixtures define",
    async (code) => {
      const tuple = seededTuple(code)
      expect(tuple, `no seeded tuple for ${code} — the fixtures should carry one`).toBeTruthy()
      const user = { id: tuple!.userId, role: null }
      expect(await holds(db, code, user, tuple!.objectId)).toBe(true)
    },
  )

  it.each(tableShaped.map((r) => [r.code] as const))(
    "%s does not hold for someone unrelated",
    async (code) => {
      const tuple = seededTuple(code)!
      // Fails closed, so a resolver that matches nothing would pass a
      // "should be false" assertion for the wrong reason — the positive case
      // above is what proves this one means something.
      expect(await holds(db, code, { id: "usr_nobody_000", role: null }, tuple.objectId)).toBe(false)
    },
  )
})

describe("platform relations read the role Better Auth assigns", () => {
  const roleShaped = RELATION.filter((r) => r.via === "role")

  it.each(roleShaped.map((r) => [r.code, r.roleCode!] as const))(
    "%s holds for a user whose role is %s",
    async (code, roleCode) => {
      // The fixtures say COACH and the user table holds coach: this asserts the
      // casing seam, which fails closed and would otherwise surface as 403s.
      expect(await holds(db, code, { id: "u", role: STORED_ROLE[roleCode as keyof typeof STORED_ROLE] }, null)).toBe(true)
      expect(await holds(db, code, { id: "u", role: "definitely-not-a-role" }, null)).toBe(false)
    },
  )

  it("every seeded user matches exactly one ANY_* relation", async () => {
    for (const u of SEED_ENTITIES.users) {
      const matched = []
      for (const r of roleShaped) {
        if (await holds(db, r.code, { id: u.id, role: STORED_ROLE[u.roleCode] }, null)) {
          matched.push(r.code)
        }
      }
      expect(matched, `${u.id} (${u.roleCode})`).toHaveLength(1)
    }
  })
})

/**
 * Games: inherited authority, and the over-permission that made GAME exist.
 *
 * These are written out rather than generated because the loop above only
 * covers `via: "table"` relations — a parent relation has no tuple of its own to
 * read, which is the whole point of it.
 */
describe("A game inherits authority from its event", () => {
  // gam_001 is in evt_001: organiser usr_org_001, co-organizer usr_org_002
  // (ACCEPTED). gam_002 and gam_003 are in evt_002, which usr_org_002 owns.
  const orgOwner = { id: "usr_org_001", role: "organizer" }
  const coOrganizer = { id: "usr_org_002", role: "organizer" }
  const stranger = { id: "usr_org_003", role: "organizer" }

  it("the event's owner holds GAME_EVENT_OWNER on its games", async () => {
    expect(await holds(db, "GAME_EVENT_OWNER", orgOwner, "gam_001")).toBe(true)
    expect(await holds(db, "GAME_EVENT_OWNER", stranger, "gam_001")).toBe(false)
  })

  it("an accepted co-organizer holds it too, filter and all", async () => {
    // Resolved by recursing into CO_ORGANIZER, so the `status_code = ACCEPTED`
    // filter applies without being restated on the game relation.
    expect(await holds(db, "GAME_EVENT_CO_ORGANIZER", coOrganizer, "gam_001")).toBe(true)
    expect(await holds(db, "GAME_EVENT_CO_ORGANIZER", orgOwner, "gam_001")).toBe(false)
  })

  it("a game that does not exist grants nobody anything", async () => {
    expect(await holds(db, "GAME_EVENT_OWNER", orgOwner, "gam_nope")).toBe(false)
  })
})

describe("ENTER_SCORES is scoped to the game, not the platform", () => {
  // The regression this whole change exists for: ENTER_SCORES was granted to
  // ANY_REFEREE — the platform role — so every referee could score every game.
  const adisorn = { id: "usr_referee_001", role: "referee" }
  const waraporn = { id: "usr_referee_002", role: "referee" }

  it("a referee may score the game they are assigned to", async () => {
    expect(await can(db, "ENTER_SCORES", adisorn, "gam_001")).toBe(true)
    expect(await can(db, "ENTER_SCORES", waraporn, "gam_003")).toBe(true)
  })

  it("and may not score one they are not", async () => {
    expect(await can(db, "ENTER_SCORES", adisorn, "gam_003")).toBe(false)
    expect(await can(db, "ENTER_SCORES", waraporn, "gam_001")).toBe(false)
  })

  it("the organiser of the event may score any game in it", async () => {
    expect(await can(db, "ENTER_SCORES", { id: "usr_org_001", role: "organizer" }, "gam_001")).toBe(true)
    expect(await can(db, "ENTER_SCORES", { id: "usr_org_002", role: "organizer" }, "gam_001")).toBe(true)
    expect(await can(db, "ENTER_SCORES", { id: "usr_org_003", role: "organizer" }, "gam_001")).toBe(false)
  })
})
