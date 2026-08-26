import { test, expect } from "@playwright/test"

// ADR 008 step 2. Teams are the second resource to leave src/web/data.ts for
// D1; before this the team page was entirely hardcoded and did not even read
// the id from its own route.

test.describe("Teams API", () => {
  test("lists the seeded teams with their organisation joined", async ({ request }) => {
    const res = await request.get("/api/teams")
    expect(res.ok()).toBeTruthy()
    const { teams } = await res.json()

    const t = teams.find((x: { id: string }) => x.id === "team_002")
    expect(t, "team_002 should be seeded").toBeTruthy()
    expect(t.name).toBe("Triam Udom U18 Girls")
    expect(t.ageGroupCode).toBe("U18")
    expect(t.genderCode).toBe("F")

    // The join is the point: a team page shows the school, not an org id.
    expect(t.orgName).toBe("Triam Udom Suksa School")
    expect(t.orgCityCode).toBe("BANGKOK")
    expect(t.orgProvinceCode).toBe("BKK")
  })

  test("organisation carries the canonical fields added as additionalFields", async ({ request }) => {
    const { teams } = await (await request.get("/api/teams")).json()
    const t = teams.find((x: { id: string }) => x.id === "team_003")
    // These four columns only exist because src/auth.config.ts declares them on
    // the organization plugin — if that declaration is dropped, the generated
    // schema loses them and this returns undefined rather than failing loudly.
    expect(t.orgNames.th).toBe("โรงเรียนมงฟอร์ตวิทยาลัย")
    expect(t.orgCityCode).toBe("CHIANG_MAI")
    expect(t.orgProvinceCode).toBe("CMI")
  })

  test("two teams from one school share an organisation", async ({ request }) => {
    const { teams } = await (await request.get("/api/teams")).json()
    const u16 = teams.find((x: { id: string }) => x.id === "team_001")
    const u18 = teams.find((x: { id: string }) => x.id === "team_004")
    expect(u16.orgId).toBe(u18.orgId)
    expect(u16.orgName).toBe("Assumption College")
  })

  test("a missing team 404s", async ({ request }) => {
    const res = await request.get("/api/teams/team_nope")
    expect(res.status()).toBe(404)
  })
})

// Three rendering assertions moved to tests/team-render.spec.ts, where the
// query cache is seeded directly and no backend runs at all. What is left here
// needs the real API: a 404 path, and a fallback that depends on what the
// database actually contains.
test.describe("SPA team page", () => {
      test("no id falls back to the first team rather than a hardcoded one", async ({ page }) => {
    await page.goto("/#/team")
    // The old page always said "Saint Gabriel's College", which was never in D1.
    await expect(page.getByTestId("team-name")).not.toHaveText("Saint Gabriel's College")
    await expect(page.getByTestId("team-name")).toContainText("Assumption College")
  })

  test("a deep-link to a missing team says so", async ({ page }) => {
    await page.goto("/#/team/team_does_not_exist")
    await expect(page.locator(".empty")).toContainText("does not exist")
  })

    test("fixture-backed sections are labelled as sample data", async ({ page }) => {
    await page.goto("/#/team/team_002")
    // Roster and schedule still come from src/web/data.ts. Sitting under a real
    // team, they need to say so.
    await expect(page.locator(".section-h", { hasText: "Roster" })).toContainText("SAMPLE DATA")
  })
})
