import { env } from "cloudflare:test"
import { drizzle } from "drizzle-orm/d1"
import { describe, expect, it } from "vitest"
import * as schema from "../../src/db/schema"
import { SEED_ENTITIES } from "../../src/domain/model/entities"
import { RELATION } from "../../src/domain/vocabularies"
import { objectsHeldBy } from "../../src/api/relations"
import type { Db } from "../../src/api/base"
import { api, signIn } from "./helpers"
import "./apply-migrations"

/**
 * What a person is connected to, and — the half nobody writes — what they are
 * not.
 *
 * The bug class this guards is "shows the wrong person's data", and it is
 * dangerous because the positive assertion passes for the wrong reason: a page
 * showing *somebody's* team satisfies "shows a team". Both halves are asserted
 * here for every seeded person, so a resolver that returned everything would
 * fail rather than look correct.
 *
 * Worker tier deliberately, not e2e. `isolatedStorage` gives this file its own
 * database, so it starts from the seed every time; e2e shares one with whoever
 * is on the dev tunnel, and a test that counts rows there is the mistake that
 * cost a day.
 */

const db = drizzle(env.DB, { schema }) as unknown as Db

/** The relations the endpoint should answer for — read off the model, as it does. */
const HELD = RELATION.filter((r) => r.via === "table")

/** Everyone who can hold a session, so the fixture cannot drift from the seed. */
const PEOPLE = SEED_ENTITIES.users.filter(
  (u) => u.statusCode !== "SUSPENDED" && u.statusCode !== "DEACTIVATED",
)

describe("what I am connected to", () => {
  /**
   * The endpoint agrees with the resolver, for every seeded person.
   *
   * Not a hand-written expectation of who holds what — that would be a second
   * copy of the seed, and it would pass while both were wrong. The oracle is
   * `objectsHeldBy` itself, asked directly, which is the same shape
   * `authz-equivalence.test.ts` uses for the grant model.
   */
  it("returns exactly what the resolver says each person holds", async () => {
    for (const person of PEOPLE) {
      const cookie = await signIn(person.email)
      const res = await api("/api/me/mine", { cookie })
      expect(res.status, `holdings for ${person.email}`).toBe(200)
      const { holdings } = (await res.json()) as {
        holdings: { type: string; id: string; relation: string }[]
      }

      const expected: string[] = []
      for (const r of HELD) {
        for (const id of await objectsHeldBy(db, r.code, person.id)) {
          expected.push(`${r.objectTypeCode}:${id}:${r.code}`)
        }
      }
      const got = holdings.map((h) => `${h.type}:${h.id}:${h.relation}`)
      expect(got.sort()).toEqual(expected.sort())
    }
  })

  /**
   * The negative half. This is the assertion that would have caught "My team".
   *
   * A page that took row one satisfied "shows a team" perfectly. What it could
   * never satisfy is "shows nothing belonging to somebody else", so that is
   * what is asserted: every id a person holds is one the resolver agrees they
   * hold, and no id belonging to another person appears in their list.
   */
  it("never returns somebody else's things", async () => {
    /**
     * Every team the resolver says a person does NOT hold must be absent.
     *
     * The first draft of this asserted that two coaches share no team, which is
     * false: `team_001` has coach_001 as head and coach_002 as assistant, and
     * both legitimately hold it. Sharing is not the bug — over-returning is. So
     * the assertion is the complement: of every team in the seed, the ones the
     * resolver excludes must not appear.
     *
     * This is the shape that would have caught "My team". A page taking row one
     * shows a team the reader does not hold, and that is exactly what an id in
     * this set means.
     */
    const allTeams = SEED_ENTITIES.teams.map((t) => t.id)

    for (const person of PEOPLE) {
      const held = new Set<string>()
      for (const r of HELD.filter((r) => r.objectTypeCode === "TEAM")) {
        for (const id of await objectsHeldBy(db, r.code, person.id)) held.add(id)
      }
      const notTheirs = allTeams.filter((id) => !held.has(id))

      const cookie = await signIn(person.email)
      const res = await api("/api/me/mine", { cookie })
      const { holdings } = (await res.json()) as { holdings: { id: string }[] }
      const got = new Set(holdings.map((h) => h.id))

      const leaked = notTheirs.filter((id) => got.has(id))
      expect(leaked, `${person.email} was given teams they hold no relation to`).toEqual([])
    }
  })

  /**
   * Nobody holds nothing by accident.
   *
   * If the resolver broke and returned empty for everyone, the test above would
   * still pass — empty equals empty. This is the guard against that: the seed
   * has relationships, so at least one person must hold something.
   */
  it("finds something for at least one person", async () => {
    let total = 0
    for (const person of PEOPLE) {
      for (const r of HELD) total += (await objectsHeldBy(db, r.code, person.id)).length
    }
    expect(total, "the seed defines relationships; none resolved").toBeGreaterThan(0)
  })

  /**
   * A relation the PO adds is answered without anyone editing this file.
   *
   * `HELD` is derived here and in `src/api/me.ts` from the same model, so the
   * two cannot disagree. This asserts the derivation is not empty and not
   * accidentally including the kinds ListObjects cannot answer.
   */
  it("covers the table-backed relations and no others", () => {
    expect(HELD.length, "no table-backed relations found — the model moved").toBeGreaterThan(0)
    // No assertion that these are not `parent` relations: the filter narrows the
    // type, so the compiler rejects that comparison as unreachable. The type
    // system is making the guarantee, which is stronger than a test of it.
    expect(HELD.map((r) => r.objectTypeCode)).not.toContain("PLATFORM")
  })
})
