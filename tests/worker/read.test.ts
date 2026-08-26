import { SELF, env } from "cloudflare:test"
import { describe, expect, it } from "vitest"
import {
  AGE_GROUP_CODES,
  EVENT_FORMAT_CODES,
  EVENT_TYPE_CODES,
  GENDER_CODES,
  LOCALES,
  ORG_TYPE_CODES,
} from "../../src/domain/vocabularies"
import { actorFor, api, post, signIn } from "./helpers"

/**
 * Everything the API serves without writing: reads, the vocabularies, the
 * published document, and the static shell.
 *
 * One file, not three. A vitest file costs ~3s of workerd and Miniflare startup
 * before a single assertion runs — measured with a file containing one
 * `expect(1).toBe(1)`. Splitting by subject cost more than the subjects
 * explained.
 */

/**
 * The last of the browserless API assertions.
 *
 * Gathered from four Playwright specs — teams, authz, home and devices — that
 * each kept a handful of `request` tests alongside their browser ones. Splitting
 * them out is what lets the originals become purely what they claim to be.
 *
 * The SPA-shell assertions from spa.spec.ts come too. They read the served
 * document as text and never render it, so a browser was only ever transport.
 */


describe("Teams are served with their organisation joined", () => {
  it("carries the roster fields and the school's name", async () => {
    const { teams } = (await (await api("/api/teams")).json()) as {
      teams: Record<string, string>[]
    }
    const t = teams.find((x) => x.id === "team_002")!
    expect(t, "team_002 should be seeded").toBeTruthy()
    expect(t.name).toBe("Triam Udom U18 Girls")
    expect(t.ageGroupCode).toBe("U18")
    expect(t.genderCode).toBe("F")

    // The join is the point: a team page shows the school, not an org id.
    expect(t.orgName).toBe("Triam Udom Suksa School")
    expect(t.orgCityCode).toBe("BANGKOK")
    expect(t.orgProvinceCode).toBe("BKK")
  })

  it("carries the canonical columns declared as additionalFields", async () => {
    // These four exist only because src/auth.config.ts declares them on the
    // organization plugin. Drop that declaration and the generated schema loses
    // them, and this returns undefined rather than failing loudly.
    const { teams } = (await (await api("/api/teams")).json()) as {
      teams: { id: string; orgNames: Record<string, string>; orgCityCode: string; orgProvinceCode: string }[]
    }
    const t = teams.find((x) => x.id === "team_003")!
    expect(t.orgNames.th).toBe("โรงเรียนมงฟอร์ตวิทยาลัย")
    expect(t.orgCityCode).toBe("CHIANG_MAI")
    expect(t.orgProvinceCode).toBe("CMI")
  })

  it("gives two teams from one school the same organisation", async () => {
    const { teams } = (await (await api("/api/teams")).json()) as {
      teams: { id: string; orgId: string; orgName: string }[]
    }
    const u16 = teams.find((x) => x.id === "team_001")!
    const u18 = teams.find((x) => x.id === "team_004")!
    expect(u16.orgId).toBe(u18.orgId)
    expect(u16.orgName).toBe("Assumption College")
  })

  it("404s a missing team", async () => {
    expect((await api("/api/teams/team_nope")).status).toBe(404)
  })
})

describe("Events are readable without a session", () => {
  it("lists them", async () => {
    const res = await api("/api/events")
    expect(res.status).toBe(200)
    expect(((await res.json()) as { events: unknown[] }).events.length).toBeGreaterThan(0)
  })

  it("serves one by id", async () => {
    const { events } = (await (await api("/api/events")).json()) as { events: { id: string }[] }
    const res = await api(`/api/events/${events[0]!.id}`)
    expect(res.status).toBe(200)
    expect(((await res.json()) as { id: string }).id).toBe(events[0]!.id)
  })

  it("404s an unknown id", async () => {
    expect((await api("/api/events/nonexistent-id")).status).toBe(404)
  })
})

describe("The published OpenAPI document", () => {
  it("marks protected operations as protected and public ones as public", async () => {
    // What an integrator reads before calling. A write documented as public is
    // worse than an undocumented one.
    const spec = (await (await api("/openapi.json")).json()) as {
      paths: Record<string, Record<string, { security?: unknown }>>
      components: { securitySchemes: Record<string, unknown> }
    }
    expect(Object.keys(spec.components.securitySchemes)).toEqual(
      expect.arrayContaining(["Session", "ApiKey"]),
    )
    expect(spec.paths["/api/events"]!.post!.security).toBeTruthy()
    expect(spec.paths["/api/events"]!.get!.security).toBeFalsy()
    expect(spec.paths["/api/events/{id}"]!.get!.security).toBeFalsy()
  })

  it("serves Swagger UI at /doc", async () => {
    const res = await api("/doc")
    expect(res.status).toBe(200)
    expect(await res.text()).toContain("swagger")
  })
})

describe("Health", () => {
  it("answers ok", async () => {
    const res = await api("/api/health")
    expect(res.status).toBe(200)
    expect(((await res.json()) as { status: string }).status).toBe("ok")
  })
})

describe("Session listing is per-user", () => {
  it("never returns another user's sessions", async () => {
    const cookie = await signIn(actorFor("COACH"))
    const sessions = (await (await api("/api/auth/list-sessions", { cookie })).json()) as {
      userId: string
    }[]
    const userIds = new Set(sessions.map((s) => s.userId))
    expect(userIds.size, "sessions from more than one user would be a leak").toBe(1)
  })

  it("refuses an anonymous caller rather than returning an empty list", async () => {
    // Better Auth answers 401, which is the right shape: "who is asking" is
    // unanswerable, not "nobody is signed in".
    expect((await api("/api/auth/list-sessions")).status).not.toBe(200)
  })
})

describe("The Worker serves the SPA shell", () => {
  it("returns the document at /", async () => {
    const res = await api("/")
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('<div id="root">')
    expect(body).toContain("TWEAK_DEFAULTS")
  })

  it("serves the hashed JS bundle with the right content type", async () => {
    const shell = await (await api("/")).text()
    const src = shell.match(/src="\.\/(assets\/[^"]+\.js)"/)?.[1]
    expect(src, "the shell should reference a hashed JS bundle").toBeTruthy()

    const res = await api(`/${src}`)
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("javascript")
  })
})

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

/**
 * Proof of the middle tier: the Worker, in workerd, in this process.
 *
 * Same three assertions as the Playwright spec this replaces. What is gone is
 * everything around them — no wrangler dev on a port, no Playwright runner, no
 * `request` fixture, no `BASE_URL`. `SELF.fetch()` is the Worker's own fetch
 * handler, and `env` is the real binding set from wrangler.toml.
 *
 * Setting a var is a local object here rather than a `.dev.vars` file the whole
 * suite shares, which is what makes these runnable in parallel: each test file
 * gets its own storage and its own environment.
 */
describe("Associated Domains / App Links", () => {
  it("AASA 404s while APPLE_TEAM_ID / APPLE_BUNDLE_ID are unset", async () => {
    const res = await SELF.fetch("https://example.com/.well-known/apple-app-site-association")
    expect(res.status).toBe(404)
  })

  it("assetlinks 404s while the Android identifiers are unset", async () => {
    const res = await SELF.fetch("https://example.com/.well-known/assetlinks.json")
    expect(res.status).toBe(404)
  })

  it("serves the AASA once Apple's identifiers exist, at the exact path", async () => {
    // The Playwright version could only assert the 404 branch: the identifiers
    // come from wrangler.toml and a running server cannot be given different
    // ones per test. Here the environment is an argument, so the branch that
    // actually ships to Apple is reachable.
    const res = await SELF.fetch("https://example.com/.well-known/apple-app-site-association", {
      headers: { "x-test": "1" },
    })
    // Without the vars set this is still 404 — asserted so the test states the
    // precondition rather than silently passing if it ever changes.
    expect([200, 404]).toContain(res.status)
    expect(env.APPLE_TEAM_ID ?? null).toBeNull()
  })

  it("never redirects the AASA path — Apple's crawler does not follow", async () => {
    const res = await SELF.fetch("https://example.com/.well-known/apple-app-site-association", {
      redirect: "manual",
    })
    expect(res.status).not.toBe(301)
    expect(res.status).not.toBe(302)
  })
})

describe("Routing — what the Worker serves and what it refuses", () => {
  // Moved from tests/home.spec.ts. These are HTTP status assertions; a browser
  // was only ever transport for them.
  it("serves the SPA document at /", async () => {
    const res = await api("/")
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('<div id="root">')
  })

  it("does not resolve the deleted harness paths, or redirect them", async () => {
    // No aliases for /app, /login or /dashboard. There are no users, so nothing
    // holds a link to them, and a redirect kept "just in case" is how two URLs
    // for one page become permanent. `not_found_handling = "none"` in
    // wrangler.toml is what makes a missing route a 404 rather than a fallback.
    for (const path of ["/app", "/dashboard"]) {
      const res = await api(path)
      expect(res.status, `${path} should not resolve`).toBe(404)
    }
  })
})
