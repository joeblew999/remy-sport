import { env } from "cloudflare:test"
import { drizzle } from "drizzle-orm/d1"
import { describe, expect, it } from "vitest"
import * as schema from "../../src/db/schema"
import { SEED_ENTITIES, SEED_RELATIONSHIPS } from "../../src/db/seed-data"
import { RELATION } from "../../src/domain/vocabularies"
import { holds } from "../../src/api/relations"
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
 * names the tables the rows actually land in. Those agree everywhere except
 * organisation membership, which lands in a table Better Auth owns — so that one
 * pair is read from the fixture's own column names.
 */
function seededTuple(code: string): { userId: string; objectId: string } | null {
  const r = RELATION.find((x) => x.code === code)!
  if (r.via !== "table") return null

  if (r.sourceTable === "members") {
    const row = SEED_RELATIONSHIPS.orgMembers.find(
      (m) => m.orgRoleCode.toLowerCase() === r.filterValue,
    )
    return row ? { userId: row.userId, objectId: row.orgId } : null
  }

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
      expect(await holds(db, code, { id: "u", role: roleCode.toLowerCase() }, null)).toBe(true)
      expect(await holds(db, code, { id: "u", role: "definitely-not-a-role" }, null)).toBe(false)
    },
  )

  it("every seeded user matches exactly one ANY_* relation", async () => {
    for (const u of SEED_ENTITIES.users) {
      const matched = []
      for (const r of roleShaped) {
        if (await holds(db, r.code, { id: u.id, role: u.roleCode.toLowerCase() }, null)) {
          matched.push(r.code)
        }
      }
      expect(matched, `${u.id} (${u.roleCode})`).toHaveLength(1)
    }
  })
})
