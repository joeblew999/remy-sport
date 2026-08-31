import { env } from "cloudflare:test"
import { describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import { canAll, database, type Db } from "../../src/api/base"
import { eventIdFor, holds } from "../../src/api/relations"
import * as schema from "../../src/db/schema"
import { ACTION, GRANTS, OBJECT_TYPE } from "../../src/domain/vocabularies"
import { SEED_ENTITIES } from "../../src/domain/model/entities"

/**
 * The set-wise authorisation answers exactly what the per-row one did.
 *
 * `/api/games` took 246ms for 28 rows because `can` was asked once per row and
 * each ask cost a hop to the parent event, a join, and a subtype lookup —
 * roughly 700 reads to render a schedule. `canAll` answers a whole list per
 * *relation* instead of per object, in about six.
 *
 * A rewrite of the authorisation hot path is exactly where "the tests we
 * happened to have still pass" is not good enough. Those tests assert the cases
 * somebody thought to write; this asserts the two implementations cannot
 * disagree anywhere the fixtures can reach — **every action in the model,
 * against every seeded object of that action's type, for every seeded actor**.
 *
 * ## The oracle is the old code
 *
 * `can` is now `canAll` with one id, so comparing them would compare a function
 * with itself and prove nothing. `perRow` below is the pre-refactor algorithm,
 * copied verbatim and kept here on purpose: an equivalence test needs an
 * independent implementation, and the only one that is definitionally correct is
 * the one that shipped.
 *
 * It is allowed to rot. If the model grows a shape this does not handle, this
 * test fails and that is the right outcome — it means the two implementations
 * have genuinely diverged and somebody has to say which is right.
 */

const db = (): Db => database(env)

/** The pre-refactor `can`, verbatim. See the note above on why it lives here. */
async function perRow(
  d: Db,
  action: keyof typeof GRANTS,
  user: { id: string; role?: string | null } | null,
  objectId: string | null,
): Promise<boolean> {
  const grants = GRANTS[action] as ReadonlyArray<{
    relation: string
    eventTypes: readonly string[]
  }>
  if (!grants?.length) return false

  const viewer = user ?? { id: "", role: null }

  for (const g of grants) {
    if (!g.eventTypes.length && (await holds(d, g.relation, viewer, null))) return true
  }
  if (!objectId) return false

  let subtype: string | null | undefined
  if (grants.some((g) => g.eventTypes.length)) {
    const eventId = await eventIdFor(d, action, objectId)
    const row = eventId
      ? await d
          .select({ typeCode: schema.event.typeCode })
          .from(schema.event)
          .where(eq(schema.event.id, eventId))
          .get()
      : undefined
    subtype = row?.typeCode ?? null
  }

  for (const g of grants) {
    if (g.eventTypes.length && !(subtype && g.eventTypes.includes(subtype))) continue
    if (await holds(d, g.relation, viewer, objectId)) return true
  }
  return false
}

/**
 * Seeded ids per object type, from the fixtures rather than a list here.
 *
 * A list typed into this file would be a second copy of the seed, and it would
 * be the copy that stayed still when the fixtures grew — leaving the test
 * passing over objects that no longer exist.
 */
const OBJECTS: Record<string, string[]> = {
  EVENT: SEED_ENTITIES.events.map((e) => e.id),
  GAME: SEED_ENTITIES.games.map((g) => g.id),
  TEAM: SEED_ENTITIES.teams.map((t) => t.id),
  ORG: SEED_ENTITIES.orgs.map((o) => o.id),
  PLAYER: SEED_ENTITIES.players.map((p) => p.id),
}

/** Every seeded person, plus the reader who is nobody. */
const ACTORS: ({ id: string; role: string | null } | null)[] = [
  null,
  ...SEED_ENTITIES.users.map((u) => ({ id: u.id, role: u.roleCode })),
]

describe("canAll agrees with the per-row implementation it replaced", () => {
  for (const action of ACTION) {
    const type = OBJECT_TYPE.find((t) => t.code === action.objectTypeCode)
    const objects = OBJECTS[type?.code ?? ""] ?? []
    if (objects.length === 0) continue

    it(`${action.code} over ${objects.length} ${type!.code} rows`, async () => {
      const d = db()
      for (const actor of ACTORS) {
        const setwise = await canAll(d, action.code as keyof typeof GRANTS, actor, objects)
        for (const id of objects) {
          const expected = await perRow(d, action.code as keyof typeof GRANTS, actor, id)
          expect(
            setwise.has(id),
            `${action.code} on ${id} for ${actor?.id ?? "nobody"}`,
          ).toBe(expected)
        }
      }
    })
  }
})

describe("The platform actions, which have no object to be in a relation to", () => {
  /**
   * `canAll` cannot express "no object" — an empty list is an empty answer — so
   * `can` keeps that branch. These are the actions it decides on its own, and
   * they are the ones a list endpoint asks once rather than per row.
   */
  it("answer the same with no object as the implementation they replaced", async () => {
    const d = db()
    const platform = ACTION.filter((a) => a.objectTypeCode === "PLATFORM")
    expect(platform.length, "the model has PLATFORM actions").toBeGreaterThan(0)

    for (const action of platform) {
      for (const actor of ACTORS) {
        const { can } = await import("../../src/api/base")
        const mine = await can(d, action.code as keyof typeof GRANTS, actor, null)
        const theirs = await perRow(d, action.code as keyof typeof GRANTS, actor, null)
        expect(mine, `${action.code} for ${actor?.id ?? "nobody"}`).toBe(theirs)
      }
    }
  })
})
