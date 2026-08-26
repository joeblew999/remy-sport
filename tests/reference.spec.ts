import { test, expect, type APIRequestContext } from "@playwright/test"
import { signIn, COACH, BASE } from "./helpers/auth"
import {
  AGE_GROUP_CODES,
  GENDER_CODES,
  ORG_TYPE_CODES,
  EVENT_TYPE_CODES,
  EVENT_FORMAT_CODES,
  LOCALES,
} from "../src/domain/vocabularies"

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
    // Compared against the generated vocabularies, not against a list retyped
    // here. The retyped version passed happily while migration 0009 disagreed
    // with the PO on three rows — OPEN's names, SENIOR's min_age, and the Thai
    // for GRASSROOTS — because the test only ever checked the API against its
    // own copy. This asserts against what the fixtures actually say.
    expect(codes(ref.ageGroups)).toEqual([...AGE_GROUP_CODES])
    expect(codes(ref.genders)).toEqual([...GENDER_CODES])
    expect(codes(ref.orgTypes)).toEqual([...ORG_TYPE_CODES])
    expect(codes(ref.eventFormats)).toEqual([...EVENT_FORMAT_CODES])
  })

  test("age groups come back in age order, not alphabetical order", async ({ request }) => {
    const ref = await reference(request)
    // Sorting by code would give OPEN, SENIOR, U10, U12… which is useless in a
    // dropdown. This is why the table carries `sort`.
    expect(codes(ref.ageGroups)[0]).toBe("U10")
    expect(codes(ref.ageGroups).at(-1)).toBe("SENIOR")
  })

  const VOCABULARIES = [
    "ageGroups",
    "genders",
    "orgTypes",
    "eventTypes",
    "eventFormats",
    "provinces",
  ] as const

  test("every vocabulary is named in every locale on offer", async ({ request }) => {
    const ref = await reference(request)

    // Driven by the locales the API itself declares, not by a pair written out
    // here — shipping another language widens this assertion automatically.
    //
    // Released only. A draft locale is declared and partially translated on
    // purpose: demanding completeness of one would mean nobody could ever start
    // a language, which is the whole reason the status exists. The endpoint
    // returns drafts too, because they are real rows and a translator needs to
    // see them; a reader is never offered one.
    const declared = ref.locales as { code: string; status: string }[]
    const locales = declared.filter((l) => l.status === "released").map((l) => l.code)
    expect(locales.sort()).toEqual([...LOCALES].sort())

    for (const name of VOCABULARIES) {
      for (const row of ref[name] as { code: string; names: Record<string, string> }[]) {
        for (const locale of locales) {
          expect(row.names?.[locale], `${name}.${row.code} has no '${locale}' name`).toBeTruthy()
        }
      }
    }
  })

  test("names are rows, not columns — no per-language fields come back", async ({ request }) => {
    const ref = await reference(request)

    // The regression this guards: `name_th` used to be a column on every
    // vocabulary table, so a third language meant a migration and an edit to
    // every consumer. If a `nameTh`/`nameJa`-shaped field reappears on a
    // vocabulary row, that design has crept back in.
    for (const name of VOCABULARIES) {
      for (const row of ref[name] as Record<string, unknown>[]) {
        const perLanguage = Object.keys(row).filter((k) => /^name[A-Z]/.test(k) && k !== "nameEn")
        expect(perLanguage, `${name}.${row.code} carries per-language field(s)`).toEqual([])
      }
    }
  })

  test("codes are the Product Owner's codes, with no per-repo delta", async ({ request }) => {
    const ref = await reference(request)
    // This repo used to lowercase event types — migrations 0005 and 0009 gave
    // the reason as "the published OpenAPI enum is lowercase and changing it
    // would break existing clients". There were no clients, so the delta was
    // deleted along with the three generator functions that applied it. Any
    // reintroduction shows up here.
    expect(codes(ref.eventTypes)).toEqual([...EVENT_TYPE_CODES])
    expect(codes(ref.eventTypes).every((c) => c === c.toUpperCase())).toBe(true)
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
      data: { names: { en: "Bad Age" }, orgId, ageGroupCode: "U99", genderCode: "M" },
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
