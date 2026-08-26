import { beforeAll, describe, expect, it } from "vitest"
import { actorFor, api, post, seed, signIn } from "./helpers"

/**
 * ADR 009. Team writes are the first endpoints where "may you do this?" needs
 * two answers: a platform-wide one (may this actor type touch teams at all) and
 * an object-scoped one (is this person part of *this* school). The organization
 * plugin's `member` table supplies the second.
 *
 * Converted from tests/org-teams.spec.ts, which never opened a browser. Two
 * constraints it carried are gone with it: it needed one sign-in per test
 * because a second sign-in on the same Playwright request context arrives
 * carrying a cookie, and its create/delete pair had to be `describe.serial`
 * because the rows were shared with every other spec. Here each cookie is a
 * value and `isolatedStorage` gives this file its own database.
 */

const ADMIN = actorFor("ADMIN")
const ORGANIZER = actorFor("ORGANIZER")
const COACH = actorFor("COACH")
const SPECTATOR = actorFor("SPECTATOR")

const put = (path: string, body: unknown, cookie: string) =>
  api(path, { method: "PUT", body: JSON.stringify(body), cookie })

const del = (path: string, cookie?: string) => api(path, { method: "DELETE", cookie })

/** Resolve an org id through the public teams listing, which joins organization. */
async function orgIdForTeam(teamId: string) {
  const res = await api(`/api/teams/${teamId}`)
  expect(res.status, `${teamId} should be seeded`).toBe(200)
  return ((await res.json()) as { orgId: string }).orgId
}

beforeAll(seed)

describe("Team writes need platform permission AND org membership", () => {
  it("a coach can create a team in the school they belong to, and an admin can delete it", async () => {
    const coach = await signIn(COACH)
    // team_001 is an Assumption College team, and the seed makes the coach an
    // org admin of Assumption College.
    const orgId = await orgIdForTeam("team_001")

    const res = await post(
      "/api/teams",
      { names: { en: "Assumption U14 Boys" }, orgId, ageGroupCode: "U14", genderCode: "M" },
      coach,
    )
    expect(res.status).toBe(201)
    const team = (await res.json()) as { id: string; orgName: string; ageGroupCode: string }
    expect(team.orgName).toBe("Assumption College")
    expect(team.ageGroupCode).toBe("U14")

    // biz data/access/matrix.md: DELETE_TEAM -> PLATFORM_ADMIN and nobody else.
    // One test, not two: the pair used to need `describe.serial` and a
    // module-level `let` to pass the id between them.
    const admin = await signIn(ADMIN)
    const deleted = await del(`/api/teams/${team.id}`, admin)
    expect(deleted.status).toBe(200)
    expect(((await deleted.json()) as { deleted: string }).deleted).toBe(team.id)
  })
})

describe("Team writes — refusals", () => {
  it("a coach CANNOT create a team in a school they do not belong to", async () => {
    const coach = await signIn(COACH)
    // team_003 is Montfort College; the coach belongs to Assumption only.
    const otherOrg = await orgIdForTeam("team_003")

    const res = await post(
      "/api/teams",
      { names: { en: "Should Not Exist" }, orgId: otherOrg, ageGroupCode: "U14", genderCode: "M" },
      coach,
    )
    // The case that was inexpressible before ADR 009: same role, same action,
    // different object — and it has to be refused.
    expect(res.status).toBe(403)
    const body = (await res.json()) as { code: string; message: string }
    // oRPC's error shape: a machine-readable `code` beside the message.
    expect(body.code).toBe("FORBIDDEN")
    expect(body.message).toContain("Not a member")
  })

  it("a spectator is refused before membership is even considered", async () => {
    const cookie = await signIn(SPECTATOR)
    const orgId = await orgIdForTeam("team_001")
    // Platform permission runs first: a spectator holds no team:create at all,
    // so membership never gets asked about.
    const res = await post(
      "/api/teams",
      { names: { en: "Nope" }, orgId, ageGroupCode: "U14", genderCode: "M" },
      cookie,
    )
    expect(res.status).toBe(403)
  })

  it("an anonymous caller gets 401, not 403", async () => {
    const orgId = await orgIdForTeam("team_001")
    const res = await post("/api/teams", {
      names: { en: "Nope" },
      orgId,
      ageGroupCode: "U14",
      genderCode: "M",
    })
    expect(res.status).toBe(401)
  })

  it("a coach can update their own school's team", async () => {
    const cookie = await signIn(COACH)
    const res = await put("/api/teams/team_001", { names: { en: "Test Team", th: "ทีมทดสอบ" } }, cookie)
    expect(res.status).toBe(200)
    expect(((await res.json()) as { names: { th: string } }).names.th).toBe("ทีมทดสอบ")
  })

  it("a coach cannot update another school's team", async () => {
    const cookie = await signIn(COACH)
    expect((await put("/api/teams/team_003", { names: { en: "hack" } }, cookie)).status).toBe(403)
  })

  it("an unknown team id is 404, not 403 — it must not leak which ids exist", async () => {
    const cookie = await signIn(COACH)
    const res = await put("/api/teams/team_definitely_not_real", { names: { en: "x" } }, cookie)
    expect(res.status).toBe(404)
  })

  it("a coach who is an org admin still cannot delete a team", async () => {
    const cookie = await signIn(COACH)
    expect((await del("/api/teams/team_001", cookie)).status).toBe(403)
  })

  it("an organizer cannot delete a team either", async () => {
    const cookie = await signIn(ORGANIZER)
    expect((await del("/api/teams/team_002", cookie)).status).toBe(403)
  })
})

describe("Organization roles resolve", () => {
  it("the owner role granted at creation actually resolves to permissions", async () => {
    // Regression guard for the bug ADR 009 fixed. auth.config.ts used to hand
    // the six *domain* roles to the organization plugin, so "owner" — the role
    // createOrganization actually writes — matched no role in the map, and
    // every org-scoped check for the creator denied.
    //
    // Asserting the role *string* is "owner" passed throughout that bug: the
    // string was always written correctly, what failed was resolving it. This
    // asks the plugin to resolve it.
    const cookie = await signIn(ORGANIZER)
    const created = await post(
      "/api/auth/organization/create",
      { name: "Role Resolve Check", slug: "role-resolve-check" },
      cookie,
    )
    expect(created.status).toBe(200)
    const org = (await created.json()) as { id: string }

    const res = await post(
      "/api/auth/organization/has-permission",
      { organizationId: org.id, permissions: { organization: ["update"] } },
      cookie,
    )
    expect(res.status, "has-permission should not error").toBe(200)
    expect(((await res.json()) as { success: boolean }).success, "an owner may update their own org").toBe(true)

    // No cleanup. The old spec had to delete the org because every spec shared
    // one database and they accumulated; this file's storage is discarded.
  })
})

describe("Org teams are a separate noun from roster teams", () => {
  it("leaves the domain team table untouched by the plugin's org_team", async () => {
    // Both tables exist; both are "team" in their own vocabulary. /api/teams
    // must keep serving rosters, with age group and gender — fields the
    // plugin's org_team does not have and never will.
    const { teams } = (await (await api("/api/teams")).json()) as {
      teams: { id: string; ageGroupCode: string; genderCode: string; orgName: string }[]
    }
    const roster = teams.find((t) => t.id === "team_002")!
    expect(roster.ageGroupCode).toBe("U18")
    expect(roster.genderCode).toBe("F")
    expect(roster.orgName).toBe("Triam Udom Suksa School")
  })
})
