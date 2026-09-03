import { test, expect } from "./fixture"
import { sessionFor } from "../helpers/actors"
import { projectOrg, projectOrgMembers, projectTeams } from "../helpers/projections"
import { visit } from "../helpers/surfaces"
import { seedCache, entry, orpc } from "../helpers/seed-cache"
import { apiTeam } from "../helpers/api-fixtures"
import type { ApiTeam } from "../../src/domain/api"

/**
 * The organisation pages, rendered against seeded data.
 *
 * What is worth asserting here is the one decision pages/org.tsx makes: it holds
 * no copy of the access matrix, so whether the members section appears is
 * decided by whether the members *query* answered. A test that seeded a role and
 * expected a section would be asserting a rule the page does not contain.
 *
 * So: seed the query and the section renders; leave it unseeded and the
 * harness's 404 stands in for the server's 403, and the page says "not yours".
 * That is the real branch, exercised the real way.
 */

const SCHOOL = "org_001"

/**
 * Assumption College, off the seed.
 *
 * The literal this replaces carried `cityCode: "BKK"` — a *province* code in a
 * city field. The page never showed it, so nothing caught it; a test asserting
 * a school's city would have agreed with the fixture and disagreed with every
 * database.
 *
 * `canEdit` and `canCreateTeam` are the server's answers and stay stated. The
 * second is a *platform* grant — CREATE_TEAM is granted to ANY_COACH with no
 * relation to any organisation, so it means "may you create a team", not "here".
 */
const ORG = projectOrg(SCHOOL, { canEdit: true, canCreateTeam: true })

const signedIn = sessionFor("COACH")

test.describe("The organisation list", () => {
  test("renders the schools it was given", async ({ page }) => {
    await seedCache(page, [entry(orpc.orgs.list, undefined, { orgs: [ORG] })])
    await visit(page, "orgs")

    await expect(page.getByTestId("orgs-page")).toBeVisible()
    await expect(page.getByTestId("org-org_001")).toContainText("Assumption College")
  })

  test("says so when there are none, rather than rendering an empty box", async ({ page }) => {
    await seedCache(page, [entry(orpc.orgs.list, undefined, { orgs: [] })])
    await visit(page, "orgs")

    await expect(page.getByTestId("orgs-list")).toBeHidden()
    await expect(page.getByTestId("orgs-page")).toContainText("No organisations yet")
  })
})

test.describe("An organisation page", () => {
  test("shows the profile form with the current name in it", async ({ page }) => {
    await seedCache(page, [signedIn, entry(orpc.orgs.get, { id: SCHOOL }, ORG)])
    await visit(page, "org", { id: SCHOOL })

    await expect(page.getByTestId("org-page")).toContainText("Assumption College")
    await expect(page.getByTestId("org-name-input")).toHaveValue("Assumption College")
  })

  test("offers no Save button to someone the server says may not edit", async ({ page }) => {
    // The whole branch, in one field. The page reads `canEdit` and nothing else
    // — it does not know or ask what this viewer's role is.
    await seedCache(page, [
      signedIn,
      entry(orpc.orgs.get, { id: SCHOOL }, { ...ORG, canEdit: false }),
    ])
    await visit(page, "org", { id: SCHOOL })

    await expect(page.getByTestId("org-name-readonly")).toHaveText("Assumption College")
    await expect(page.getByTestId("org-name-input")).toHaveCount(0)
    await expect(page.getByTestId("org-save")).toHaveCount(0)
  })

  test("shows the roster when the members query answers", async ({ page }) => {
    await seedCache(page, [
      signedIn,
      entry(orpc.orgs.get, { id: SCHOOL }, ORG),
      entry(orpc.orgs.members, { id: SCHOOL }, projectOrgMembers(SCHOOL, { canManage: true })),
    ])
    await visit(page, "org", { id: SCHOOL })

    await expect(page.getByTestId("org-members")).toBeVisible()
    // The model's name for the role, not the code. This asserted "ADMIN",
    // which is what the page printed — a SCREAMING_SNAKE identifier, the same
    // in every language, while the `orgRoles` vocabulary that names it was
    // fetched on every page load and read by nothing.
    const admin = projectOrgMembers(SCHOOL).members.find((m) => m.orgRoleCode === "ADMIN")!
    await expect(page.getByTestId(`member-row-${admin.email}`)).toContainText("Organisation Admin")
    await expect(page.getByTestId("add-member-form")).toBeVisible()
  })

  test("says 'not yours' when the members query is refused", async ({ page }) => {
    // No members entry — the harness answers 404, which is how a 403 reaches
    // this component: as an error, not as data.
    await seedCache(page, [signedIn, entry(orpc.orgs.get, { id: SCHOOL }, ORG)])
    await visit(page, "org", { id: SCHOOL })

    await expect(page.getByTestId("org-members-denied")).toBeVisible()
    await expect(page.getByTestId("org-members")).toBeHidden()
    await expect(page.getByTestId("add-member-form")).toBeHidden()
  })

  test("offers a signed-out visitor no members section at all", async ({ page }) => {
    await seedCache(page, [entry(orpc.orgs.get, { id: SCHOOL }, ORG)])
    await visit(page, "org", { id: SCHOOL })

    await expect(page.getByTestId("org-profile")).toBeVisible()
    await expect(page.getByTestId("org-members")).toBeHidden()
    await expect(page.getByTestId("org-members-denied")).toBeHidden()
  })
})

test.describe("A school's teams", () => {
  /**
   * `teams.create` was enforced by CREATE_TEAM and reachable from nowhere, so a
   * team could not be created from the app at all — every team in existence came
   * from the seed.
   *
   * The list is filtered from `teams.list` rather than fetched per org: it is
   * already in the cache, it is small, and a second endpoint returning a subset
   * would be a second thing to keep correct.
   */
  // `apiTeam` from the shared fixtures, not a local literal. The version here
  // took `Record<string, unknown>` overrides, which widened `ageGroupCode` and
  // `genderCode` from their vocabularies to bare `string` — so the cast at each
  // call site was covering a factory that had already thrown the types away.
  const team = (over: Partial<ApiTeam> = {}) =>
    apiTeam({
      id: "team_001",
      name: "Assumption U18 Boys",
      names: { en: "Assumption U18 Boys" },
      orgId: "org_001",
      ageGroupCode: "U18",
      genderCode: "M",
      orgName: "Assumption College",
      orgNames: { en: "Assumption College" },
      // BANGKOK is the city; BKK is the province. Both were "BKK" here.
      orgCityCode: "BANGKOK",
      orgProvinceCode: "BKK",
      ...over,
    })

  test("lists only this school's teams", async ({ page }) => {
    await seedCache(page, [
      signedIn,
      entry(orpc.orgs.get, { id: SCHOOL }, ORG),
      entry(orpc.teams.list, undefined, {
        // Every seeded team, so the filter is doing real work: nine of the
        // fifteen belong to other schools and must not appear.
        teams: projectTeams(),
      }),
    ])
    await visit(page, "org", { id: SCHOOL })

    for (const t of projectTeams()) {
      const row = page.getByTestId(`org-team-${t.id}`)
      await (t.orgId === SCHOOL ? expect(row).toBeVisible() : expect(row).toHaveCount(0))
    }
  })

  test("says so when a school has none, rather than showing an empty box", async ({ page }) => {
    await seedCache(page, [
      signedIn,
      entry(orpc.orgs.get, { id: SCHOOL }, ORG),
      entry(orpc.teams.list, undefined, { teams: [] }),
    ])
    await visit(page, "org", { id: SCHOOL })

    await expect(page.getByTestId("org-no-teams")).toBeVisible()
  })

  test("offers the form to a coach and not to a spectator", async ({ page }) => {
    await seedCache(page, [
      signedIn,
      entry(orpc.orgs.get, { id: SCHOOL }, { ...ORG, canCreateTeam: false }),
      entry(orpc.teams.list, undefined, { teams: [team()] }),
    ])
    await visit(page, "org", { id: SCHOOL })

    // The list is still there — seeing a school's teams is not the same
    // permission as making one.
    await expect(page.getByTestId("org-team-team_001")).toBeVisible()
    await expect(page.getByTestId("create-team")).toHaveCount(0)
  })

  test("creates one with the school it was made on", async ({ page }) => {
    let sent = ""
    await seedCache(page, [
      signedIn,
      entry(orpc.orgs.get, { id: SCHOOL }, ORG),
      entry(orpc.teams.list, undefined, { teams: [] }),
    ])
    await page.route("**/rpc/**", async (route) => {
      if (!route.request().url().includes("teams/create")) return route.fallback()
      sent = route.request().postData() ?? ""
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ json: team() }),
      })
    })

    await visit(page, "org", { id: SCHOOL })
    await page.getByTestId("new-team-name").fill("Assumption U14 Girls")
    await page.getByTestId("new-team-age").selectOption("U14")
    await page.getByTestId("new-team-gender").selectOption("F")
    await page.getByTestId("create-team").click()

    await expect.poll(() => sent, { message: "create must reach the server" }).not.toBe("")
    expect(sent).toContain("Assumption U14 Girls")
    // The org comes from the page, not from a picker nobody filled in.
    expect(sent, "the school it was created on").toContain("org_001")
    expect(sent).toContain("U14")
  })
})
