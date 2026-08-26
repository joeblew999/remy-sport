import { beforeAll, describe, expect, it } from "vitest"
import {
  AGE_GROUP_CODES,
  EVENT_FORMAT_CODES,
  EVENT_TYPE_CODES,
  GENDER_CODES,
  LOCALES,
  ORG_TYPE_CODES,
} from "../../src/domain/vocabularies"
import { actorFor, api, post, seed, signIn } from "./helpers"

/**
 * ADR 015. The controlled vocabularies were Zod enums hand-copied from
 * remy-sport-biz into route files with nothing checking the copy. They are
 * tables with foreign keys now, and these are the check.
 *
 * Converted from tests/reference.spec.ts, which never opened a browser.
 */

type Row = { code: string; names?: Record<string, string> }

const reference = async () => {
  const res = await api("/api/reference")
  expect(res.status).toBe(200)
  return (await res.json()) as Record<string, Row[]>
}

const codes = (rows: Row[]) => rows.map((r) => r.code)

const VOCABULARIES = [
  "ageGroups",
  "genders",
  "orgTypes",
  "eventTypes",
  "eventFormats",
  "provinces",
] as const

beforeAll(seed)

describe("Controlled vocabularies", () => {
  it("serves the Product Owner's vocabularies verbatim", async () => {
    // Compared against the generated vocabularies, not a list retyped here. The
    // retyped version passed happily while migration 0009 disagreed with the PO
    // on three rows, because the test only ever checked the API against its own
    // copy.
    const ref = await reference()
    expect(codes(ref.ageGroups!)).toEqual([...AGE_GROUP_CODES])
    expect(codes(ref.genders!)).toEqual([...GENDER_CODES])
    expect(codes(ref.orgTypes!)).toEqual([...ORG_TYPE_CODES])
    expect(codes(ref.eventFormats!)).toEqual([...EVENT_FORMAT_CODES])
  })

  it("returns age groups in age order, not alphabetical order", async () => {
    // Sorting by code gives OPEN, SENIOR, U10, U12… which is useless in a
    // dropdown. This is why the table carries `sort`.
    const ref = await reference()
    expect(codes(ref.ageGroups!)[0]).toBe("U10")
    expect(codes(ref.ageGroups!).at(-1)).toBe("SENIOR")
  })

  it("names every vocabulary in every locale on offer", async () => {
    const ref = await reference()

    // Driven by the locales the API declares, not a pair written out here —
    // shipping another language widens this automatically.
    //
    // Released only. A draft locale is partially translated on purpose:
    // demanding completeness of one would mean nobody could ever start a
    // language. The endpoint returns drafts because a translator needs to see
    // them; a reader is never offered one.
    const declared = ref.locales as unknown as { code: string; status: string }[]
    const locales = declared.filter((l) => l.status === "released").map((l) => l.code)
    expect(locales.sort()).toEqual([...LOCALES].sort())

    for (const name of VOCABULARIES) {
      for (const row of ref[name]!) {
        for (const locale of locales) {
          expect(row.names?.[locale], `${name}.${row.code} has no '${locale}' name`).toBeTruthy()
        }
      }
    }
  })

  it("returns no per-language fields — names are rows, not columns", async () => {
    // The regression this guards: `name_th` was a column on every vocabulary
    // table, so a third language meant a migration and an edit to every
    // consumer. A `nameTh`/`nameJa`-shaped field reappearing means that design
    // has crept back in.
    const ref = await reference()
    for (const name of VOCABULARIES) {
      for (const row of ref[name]! as unknown as Record<string, unknown>[]) {
        const perLanguage = Object.keys(row).filter((k) => /^name[A-Z]/.test(k) && k !== "nameEn")
        expect(perLanguage, `${name}.${row.code} carries per-language field(s)`).toEqual([])
      }
    }
  })

  it("uses the PO's codes with no per-repo delta", async () => {
    // This repo used to lowercase event types, justified as "the published
    // OpenAPI enum is lowercase and changing it would break existing clients".
    // There were no clients, so the delta was deleted. Any reintroduction shows
    // up here.
    const ref = await reference()
    expect(codes(ref.eventTypes!)).toEqual([...EVENT_TYPE_CODES])
    expect(codes(ref.eventTypes!).every((c) => c === c.toUpperCase())).toBe(true)
  })

  it("is public — the SPA needs it before anyone signs in", async () => {
    expect((await api("/api/reference")).status).toBe(200)
  })
})

describe("The database enforces the vocabulary, not just the API", () => {
  it("refuses a code outside the vocabulary, at both layers", async () => {
    const cookie = await signIn(actorFor("COACH"))
    const { teams } = (await (await api("/api/teams")).json()) as {
      teams: { orgId: string; ageGroupCode: string; genderCode: string }[]
    }

    // Rejected at the API boundary by the Zod enum…
    const viaApi = await post(
      "/api/teams",
      { names: { en: "Bad Age" }, orgId: teams[0]!.orgId, ageGroupCode: "U99", genderCode: "M" },
      cookie,
    )
    expect(viaApi.status).not.toBe(201)

    // …and, since migration 0009, by a foreign key underneath it. That second
    // line of defence is the point: before it, any writer bypassing these
    // routes — the seed route, a migration, a future admin tool — could store
    // anything at all.
    const after = (await (await api("/api/teams")).json()) as { teams: { ageGroupCode: string }[] }
    expect(after.teams.every((t) => t.ageGroupCode !== "U99")).toBe(true)
  })

  it("keeps every seeded team inside the served vocabularies", async () => {
    const ref = await reference()
    const { teams } = (await (await api("/api/teams")).json()) as {
      teams: { ageGroupCode: string; genderCode: string }[]
    }
    const ageGroups = new Set(codes(ref.ageGroups!))
    const genders = new Set(codes(ref.genders!))
    for (const t of teams) {
      expect(ageGroups.has(t.ageGroupCode), `${t.ageGroupCode} is not a known age group`).toBe(true)
      expect(genders.has(t.genderCode), `${t.genderCode} is not a known gender`).toBe(true)
    }
  })
})
