import { beforeAll, describe, expect, it } from "vitest"
import { actorFor, api, seed, signIn } from "./helpers"

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

beforeAll(seed)

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
