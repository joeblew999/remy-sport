import { describe, expect, it } from "bun:test"
import {
  PER_ROW_ACTIONS,
  PLATFORM_ACTIONS,
  allowedBy,
  isPairAction,
  platformRelations,
} from "../../src/domain/grants"
import { ACTION, GRANTS, OBJECT_TYPE, RELATION } from "../../src/domain/vocabularies"

/**
 * The grant table applied — the pure half of authorisation, with no database.
 *
 * What is asserted here is the *rule*, not today's answer: which actions a row
 * can answer, who a stranger is, how a subtype narrows. The answers for every
 * seeded person on every seeded object are `authz-equivalence.test.ts`'s.
 */
type Grant = { relation: string; eventTypes: readonly string[] }
const grantsOf = (code: string) => (GRANTS as Record<string, readonly Grant[]>)[code] ?? []
const platform = new Set<string>(
  RELATION.filter((r) => r.objectTypeCode === "PLATFORM").map((r) => r.code),
)

describe("the grant table, applied", () => {
  it("a pair action is narrowed by an event its object is not in, and no row answers it", () => {
    const pairs = ACTION.filter(isPairAction)
    expect(pairs.length, "the model has some").toBeGreaterThan(0)
    for (const a of pairs) {
      expect(["EVENT", "GAME", "PLATFORM"]).not.toContain(a.objectTypeCode)
      expect(grantsOf(a.code).some((g) => g.eventTypes.length > 0)).toBe(true)
      for (const t of OBJECT_TYPE) {
        expect(PER_ROW_ACTIONS[t.code] as readonly string[]).not.toContain(a.code)
      }
    }
    // And every other action is on the rows of its type.
    for (const a of ACTION) {
      if (!isPairAction(a)) {
        expect(PER_ROW_ACTIONS[a.objectTypeCode] as readonly string[]).toContain(a.code)
      }
    }
  })

  it("a stranger holds PUBLIC and nothing else; an account adds ANY_SIGNED_IN; a role adds its own", () => {
    expect([...platformRelations(null)]).toEqual(["PUBLIC"])
    expect([...platformRelations({ id: "u", role: null })].sort()).toEqual(["ANY_SIGNED_IN", "PUBLIC"])
    expect([...platformRelations({ id: "u", role: "coach" })].sort()).toEqual([
      "ANY_COACH",
      "ANY_SIGNED_IN",
      "PUBLIC",
    ])
  })

  it("answers every action of the type, from the relations held and nothing else", () => {
    const stranger = allowedBy("TEAM", platformRelations(null), null)
    expect(Object.keys(stranger).sort()).toEqual([...PER_ROW_ACTIONS.TEAM].sort())
    expect(stranger.VIEW_TEAM).toBe(true)
    expect(stranger.FOLLOW_TEAM, "FOLLOW_TEAM is ANY_SIGNED_IN, not PUBLIC").toBe(false)

    const headCoach = allowedBy(
      "TEAM",
      new Set([...platformRelations({ id: "u", role: "coach" }), "HEAD_COACH"]),
      null,
    )
    expect(headCoach.EDIT_TEAM_PROFILE).toBe(true)
    expect(headCoach.MANAGE_ROSTER).toBe(true)
    expect(headCoach.DELETE_TEAM, "PLATFORM_ADMIN only").toBe(false)
  })

  it("narrows by event subtype", () => {
    const owner = new Set([...platformRelations({ id: "u", role: "organizer" }), "OWNER"])
    expect(allowedBy("EVENT", owner, "CAMP").DEFINE_SESSION_SCHEDULE).toBe(true)
    expect(allowedBy("EVENT", owner, "LEAGUE").DEFINE_SESSION_SCHEDULE).toBe(false)
    expect(allowedBy("EVENT", owner, "CAMP").MANAGE_DIVISIONS).toBe(false)
    expect(allowedBy("EVENT", owner, "LEAGUE").MANAGE_DIVISIONS).toBe(true)
  })

  it("a platform-answerable action has only platform grants, and a granted one at that", () => {
    expect(PLATFORM_ACTIONS.length).toBeGreaterThan(0)
    for (const code of PLATFORM_ACTIONS) {
      const grants = grantsOf(code)
      expect(grants.length, code).toBeGreaterThan(0)
      expect(grants.every((g) => platform.has(g.relation)), code).toBe(true)
    }
    // DELETE_PLAYER names PLAYER and is answerable with no player in hand.
    expect(PLATFORM_ACTIONS as readonly string[]).toContain("DELETE_PLAYER")
  })
})
