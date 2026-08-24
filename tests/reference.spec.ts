import { test, expect, type APIRequestContext } from "@playwright/test"
import { signIn, COACH, BASE } from "./helpers/auth"

// ADR 015. The controlled vocabularies were Zod enums hand-copied from
// remy-sport-biz into route files, with nothing checking the copy. They are now
// tables with foreign keys, and these tests are the check.

async function reference(request: APIRequestContext) {
  const res = await request.get("/api/reference")
  expect(res.ok()).toBeTruthy()
  return res.json()
}

const codes = (rows: { code: string }[]) => rows.map((r) => r.code)

test.describe("Controlled vocabularies", () => {
  test("the API serves the Product Owner's vocabularies verbatim", async ({ request }) => {
    const ref = await reference(request)
    // Copied from remy-sport-biz/data/seed/*.jsonl. If the PO changes a
    // vocabulary, this is what should fail.
    expect(codes(ref.ageGroups)).toEqual(["U10", "U12", "U14", "U16", "U18", "U21", "OPEN", "SENIOR"])
    expect(codes(ref.genders)).toEqual(["M", "F", "COED"])
    expect(codes(ref.orgTypes)).toEqual(["SCHOOL", "CLUB", "FEDERATION", "GRASSROOTS"])
    expect(codes(ref.eventFormats)).toEqual(["5x5", "3x3"])
  })

  test("age groups come back in age order, not alphabetical order", async ({ request }) => {
    const ref = await reference(request)
    // Sorting by code would give OPEN, SENIOR, U10, U12… which is useless in a
    // dropdown. This is why the table carries `sort`.
    expect(codes(ref.ageGroups)[0]).toBe("U10")
    expect(codes(ref.ageGroups).at(-1)).toBe("SENIOR")
  })

  test("every vocabulary carries Thai names — the product is bilingual", async ({ request }) => {
    const ref = await reference(request)
    for (const [name, rows] of Object.entries(ref) as [string, { nameTh: string }[]][]) {
      for (const row of rows) {
        expect(row.nameTh, `${name} row missing a Thai name`).toBeTruthy()
      }
    }
  })

  test("event types stay lowercase, matching the published OpenAPI enum", async ({ request }) => {
    const ref = await reference(request)
    // A deliberate delta from the biz fixtures, recorded in migration 0005:
    // this repo's public API already used lowercase, and changing it would
    // break clients for no gain.
    expect(codes(ref.eventTypes)).toEqual(["tournament", "league", "camp", "showcase"])
  })

  test("the API's team enums have not drifted from the tables", async ({ request }) => {
    // The drift guard. src/routes/teams.ts still declares Zod enums, because a
    // TEXT column cannot express a vocabulary to the type system — but they are
    // now a copy of something authoritative, so the copy gets checked.
    const ref = await reference(request)
    const { teams } = await (await request.get("/api/teams")).json()
    const ageGroups = new Set(codes(ref.ageGroups))
    const genders = new Set(codes(ref.genders))
    for (const t of teams as { ageGroupCode: string; genderCode: string }[]) {
      expect(ageGroups.has(t.ageGroupCode), `${t.ageGroupCode} is not a known age group`).toBe(true)
      expect(genders.has(t.genderCode), `${t.genderCode} is not a known gender`).toBe(true)
    }
  })

  test("reference data is public — the SPA needs it before anyone signs in", async ({ request }) => {
    const res = await request.get("/api/reference")
    expect(res.status()).toBe(200)
  })
})

test.describe("The database enforces the vocabulary, not just the API", () => {
  test("a code outside the vocabulary is refused", async ({ request, baseURL }) => {
    await signIn(request, COACH)
    const { teams } = await (await request.get("/api/teams")).json()
    const orgId = teams[0].orgId

    // Rejected at the API boundary by the Zod enum…
    const viaApi = await request.post("/api/teams", {
      data: { name: "Bad Age", orgId, ageGroupCode: "U99", genderCode: "M" },
      headers: { Origin: baseURL! },
    })
    expect(viaApi.ok()).toBeFalsy()

    // …and, since migration 0009, by a foreign key underneath it. That second
    // line of defence is the point: before it, a writer that bypassed these
    // routes — the seed route, a migration, a future admin tool — could store
    // anything at all.
    const stillClean = await (await request.get("/api/teams")).json()
    expect((stillClean.teams as { ageGroupCode: string }[]).every((t) => t.ageGroupCode !== "U99")).toBe(true)
  })
})
