import { env } from "cloudflare:test"
import { describe, expect, it } from "vitest"
import { database, type Db } from "../../src/api/base"
import { grant, holds, relationWith, revoke } from "../../src/api/relations"
import { RELATION } from "../../src/domain/vocabularies"
import { SEED_ENTITIES } from "../../src/domain/model/entities"

/**
 * The write half derives from the same columns as the read half, so the read
 * half is the oracle: for every table-backed relation, grant it to somebody
 * who does not hold it and `holds` says yes; revoke it and `holds` says no.
 *
 * Every membership relation the model declares, not a chosen few — a relation
 * added upstream is covered the day it exists, and a shape this file cannot
 * handle (a new `via`, a table with no unique key) fails here first.
 */
const db = (): Db => database(env)

/** The seeded objects of each type, from the fixtures rather than typed here. */
const OBJECTS: Record<string, string[]> = {
  EVENT: SEED_ENTITIES.events.map((e) => e.id),
  GAME: SEED_ENTITIES.games.map((g) => g.id),
  TEAM: SEED_ENTITIES.teams.map((t) => t.id),
  ORG: SEED_ENTITIES.orgs.map((o) => o.id),
  PLAYER: SEED_ENTITIES.players.map((p) => p.id),
}

/**
 * What a row needs that the relation does not describe. These are the columns
 * `grant` takes as `extra`, and they are the whole of what a handler still has
 * to know about a membership table.
 */
const EXTRA: Record<string, Record<string, string>> = {
  player_teams: { from_date: "2026-09-04" },
  guardians: { guardian_type_code: "PARENT" },
  subscriptions: { subscribed_at: "2026-09-04" },
  event_co_organizers: { added_at: "2026-09-04" },
}

const memberships = RELATION.filter((r) => r.via === "table" && r.objectColumn !== "id")

describe("a relation granted is a relation held, and revoked is not", () => {
  for (const r of memberships) {
    it(r.code, async () => {
      const d = db()
      const objectId = OBJECTS[r.objectTypeCode]![0]!

      // Somebody who does not hold it yet. Through a linking entity, the
      // subject is that entity and the reader is the user behind it.
      let subject: string | undefined
      let viewer: { id: string; role: string | null } | undefined
      if (r.throughTable) {
        for (const p of SEED_ENTITIES.players) {
          const u = SEED_ENTITIES.users.find((x) => x.id === p.userId)
          if (!u || (await holds(d, r.code, { id: u.id, role: u.roleCode }, objectId))) continue
          subject = p.id
          viewer = { id: u.id, role: u.roleCode }
          break
        }
      } else {
        for (const u of SEED_ENTITIES.users) {
          if (await holds(d, r.code, { id: u.id, role: u.roleCode }, objectId)) continue
          subject = u.id
          viewer = { id: u.id, role: u.roleCode }
          break
        }
      }
      expect(subject, `somebody in the seed does not hold ${r.code} on ${objectId}`).toBeTruthy()

      await grant(d, r.code, objectId, subject!, EXTRA[r.sourceTable!] ?? {})
      expect(await holds(d, r.code, viewer!, objectId), "granted").toBe(true)

      // Idempotent: granting again is not a second row and not an error.
      await grant(d, r.code, objectId, subject!, EXTRA[r.sourceTable!] ?? {})

      expect(await revoke(d, r.code, objectId, subject!), "one row").toBe(1)
      // A relation that ends keeps its row with today as its last day, and the
      // read half treats today as still current — the same rule as `holds`, so
      // the spell reads as ended tomorrow. Everything else is gone now.
      if (!r.activeToColumn) {
        expect(await holds(d, r.code, viewer!, objectId), "revoked").toBe(false)
      }
      expect(await revoke(d, r.code, objectId, subject!), "nothing left to revoke").toBe(0)
    })
  }

  it("refuses a relation that is a column on the object itself", async () => {
    await expect(grant(db(), "OWNER", "evt_001", "usr_org_002")).rejects.toThrow(/column on the object/)
    await expect(grant(db(), "SELF", "ply_001", "usr_player_001")).rejects.toThrow(/column on the object/)
  })

  it("a role is one write, not a remove and an add", async () => {
    const d = db()
    const team = OBJECTS.TEAM![1]!
    const coach = SEED_ENTITIES.users.find((u) => u.roleCode === "COACH" && u.id === "usr_coach_009")!
    const viewer = { id: coach.id, role: coach.roleCode }
    await grant(d, "ASSISTANT_COACH", team, coach.id)
    expect(await holds(d, "ASSISTANT_COACH", viewer, team)).toBe(true)
    await grant(d, "HEAD_COACH", team, coach.id)
    expect(await holds(d, "HEAD_COACH", viewer, team), "promoted").toBe(true)
    expect(await holds(d, "ASSISTANT_COACH", viewer, team), "and no longer assistant").toBe(false)
    // Removing them removes the row whatever role it holds.
    expect(await revoke(d, "ASSISTANT_COACH", team, coach.id)).toBe(1)
    expect(await holds(d, "HEAD_COACH", viewer, team)).toBe(false)
  })

  it("picks the relation a role code means, off the model's own filter column", () => {
    expect(relationWith("org_members", "ADMIN")).toBe("ORG_ADMIN")
    expect(relationWith("team_coaches", "HEAD")).toBe("HEAD_COACH")
    expect(relationWith("subscriptions", "TEAM")).toBe("FOLLOWER_TEAM")
    expect(() => relationWith("org_members", "JANITOR")).toThrow()
  })
})
