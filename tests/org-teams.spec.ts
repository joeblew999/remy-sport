import { test, expect, type APIRequestContext } from "@playwright/test"
import { signIn, deleteOrg, ADMIN, ORGANIZER, COACH, SPECTATOR } from "./helpers/auth"

// ADR 009. Team writes are the first endpoints in this repo where "may you do
// this?" needs two answers: a platform-wide one (is this actor type allowed to
// touch teams at all) and an object-scoped one (is this person part of *this*
// school). The organization plugin's `member` table supplies the second.
//
// One sign-in per test, matching authz.spec.ts — signing in twice inside a
// single request context fails, because the second call arrives already
// carrying a session cookie.



/** Resolve an org id through the public teams listing, which joins organization. */
async function orgIdForTeam(request: APIRequestContext, teamId: string) {
  const res = await request.get(`/api/teams/${teamId}`)
  expect(res.ok(), `${teamId} should be seeded`).toBeTruthy()
  return (await res.json()).orgId as string
}

test.describe.serial("Team writes — platform permission AND org membership", () => {
  let createdTeamId: string

  test("a coach can create a team in the school they belong to", async ({ request }) => {
    await signIn(request, COACH)
    // team_001 is an Assumption College team, and the seed makes the coach an
    // org admin of Assumption College.
    const orgId = await orgIdForTeam(request, "team_001")

    const res = await request.post("/api/teams", {
      data: { name: "Assumption U14 Boys", orgId, ageGroupCode: "U14", genderCode: "M" },
    })
    expect(res.status()).toBe(201)
    const team = await res.json()
    expect(team.orgName).toBe("Assumption College")
    expect(team.ageGroupCode).toBe("U14")
    createdTeamId = team.id
  })

  test("a platform admin can delete it — the only role the biz matrix allows", async ({ request }) => {
    // biz data/access/matrix.md: DELETE_TEAM -> PLATFORM_ADMIN and nobody else.
    // Doubles as cleanup, so re-runs do not accumulate teams the way
    // organization.spec.ts has been accumulating orgs.
    expect(createdTeamId, "the create test should have run first").toBeTruthy()
    await signIn(request, ADMIN)
    const res = await request.delete(`/api/teams/${createdTeamId}`)
    expect(res.status()).toBe(200)
    expect((await res.json()).deleted).toBe(createdTeamId)
  })
})

test.describe("Team writes — refusals", () => {
  test("a coach CANNOT create a team in a school they do not belong to", async ({ request }) => {
    await signIn(request, COACH)
    // team_003 is Montfort College; the coach belongs to Assumption only.
    const otherOrg = await orgIdForTeam(request, "team_003")

    const res = await request.post("/api/teams", {
      data: { name: "Should Not Exist", orgId: otherOrg, ageGroupCode: "U14", genderCode: "M" },
    })
    // The case that was inexpressible before ADR 009: same role, same action,
    // different object — and it has to be refused.
    expect(res.status()).toBe(403)
    expect((await res.json()).error).toContain("Not a member")
  })

  test("a spectator is refused before membership is even considered", async ({ request }) => {
    await signIn(request, SPECTATOR)
    const orgId = await orgIdForTeam(request, "team_001")
    const res = await request.post("/api/teams", {
      data: { name: "Nope", orgId, ageGroupCode: "U14", genderCode: "M" },
    })
    // Platform permission runs first: a spectator holds no team:create at all,
    // so membership never gets asked about.
    expect(res.status()).toBe(403)
  })

  test("an anonymous caller gets 401, not 403", async ({ request }) => {
    const orgId = await orgIdForTeam(request, "team_001")
    const res = await request.post("/api/teams", {
      data: { name: "Nope", orgId, ageGroupCode: "U14", genderCode: "M" },
    })
    expect(res.status()).toBe(401)
  })

  test("a coach can update their own school's team", async ({ request }) => {
    await signIn(request, COACH)
    const res = await request.put("/api/teams/team_001", { data: { nameTh: "ทีมทดสอบ" } })
    expect(res.status()).toBe(200)
    expect((await res.json()).nameTh).toBe("ทีมทดสอบ")
  })

  test("a coach cannot update another school's team", async ({ request }) => {
    await signIn(request, COACH)
    const res = await request.put("/api/teams/team_003", { data: { nameTh: "hack" } })
    expect(res.status()).toBe(403)
  })

  test("an unknown team id is 404, not 403 — it must not leak which ids exist", async ({ request }) => {
    await signIn(request, COACH)
    const res = await request.put("/api/teams/team_definitely_not_real", { data: { nameTh: "x" } })
    expect(res.status()).toBe(404)
  })

  test("a coach who is an org admin still cannot delete a team", async ({ request }) => {
    await signIn(request, COACH)
    expect((await request.delete("/api/teams/team_001")).status()).toBe(403)
  })

  test("an organizer cannot delete a team either", async ({ request }) => {
    await signIn(request, ORGANIZER)
    expect((await request.delete("/api/teams/team_002")).status()).toBe(403)
  })
})

test.describe("Organization roles resolve", () => {
  test("the owner role granted at creation actually resolves to permissions", async ({ request, baseURL }) => {
    // Regression guard for the bug ADR 009 fixed. auth.config.ts used to hand
    // the six *domain* roles to the organization plugin, so "owner" — the role
    // createOrganization actually writes — matched no role in the map, and
    // every org-scoped check for the creator denied.
    //
    // organization.spec.ts already asserts the creator's role *string* is
    // "owner". That passed throughout the bug, because the string was always
    // written correctly; what failed was resolving it. This asks the plugin to
    // resolve it.
    // Better Auth's own routes reject a cookie-bearing request with no Origin
    // (ADR 006 §9a). A browser sets it; APIRequestContext does not, which is
    // why organization.spec.ts drives these endpoints through `page`.
    const origin = { Origin: baseURL! }

    await signIn(request, ORGANIZER)
    const slug = `role-resolve-${Date.now()}`
    const created = await request.post("/api/auth/organization/create", {
      data: { name: "Role Resolve Check", slug },
      headers: origin,
    })
    expect(created.ok()).toBeTruthy()
    const org = await created.json()

    const res = await request.post("/api/auth/organization/has-permission", {
      data: {
        organizationId: org.id,
        permissions: { organization: ["update"] },
      },
      headers: origin,
    })
    expect(res.ok(), "has-permission should not error").toBeTruthy()
    expect((await res.json()).success, "an owner may update their own org").toBe(true)

    await deleteOrg(request, org.id)
  })
})

test.describe("Org teams are a separate noun from roster teams", () => {
  test("the domain team table is untouched by the plugin's org_team", async ({ request }) => {
    // Both tables exist; both are "team" in their own vocabulary. /api/teams
    // must keep serving rosters, with age group and gender — fields the
    // plugin's org_team does not have and never will.
    const { teams } = await (await request.get("/api/teams")).json()
    const roster = teams.find((t: { id: string }) => t.id === "team_002")
    expect(roster.ageGroupCode).toBe("U18")
    expect(roster.genderCode).toBe("F")
    expect(roster.orgName).toBe("Triam Udom Suksa School")
  })
})
