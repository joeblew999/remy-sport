import { test, expect } from "./fixture"
import { seedCache, entry, orpc } from "../helpers/seed-cache"
import { apiTeam } from "../helpers/api-fixtures"
import type { ApiTeam } from "../../src/domain/api"
import { sessionKey } from "../../src/web/lib/session"

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

const ORG = {
  id: "org_001",
  slug: "assumption-college",
  orgTypeCode: "SCHOOL",
  cityCode: "BKK",
  provinceCode: "BKK",
  names: { en: "Assumption College", th: "โรงเรียนอัสสัมชัญ" },
  // The server's answer to "may this reader edit it". Not derived in the page
  // from a role — see src/api/orgs.ts.
  canEdit: true,
  // A *platform* grant — CREATE_TEAM is granted to ANY_COACH with no relation
  // to any organisation, so this is "may you create a team", not "here".
  canCreateTeam: true,
}

const signedIn = {
  queryKey: sessionKey as unknown as readonly unknown[],
  data: {
    user: { id: "usr_coach_001", email: "coach@remy.test", name: "Coach", role: "coach" },
    session: { activeOrganizationId: null, impersonatedBy: null },
  },
}

test.describe("The organisation list", () => {
  test("renders the schools it was given", async ({ page }) => {
    await seedCache(page, [entry(orpc.orgs.list, undefined, { orgs: [ORG] })])
    await page.goto("/#/orgs")

    await expect(page.getByTestId("orgs-page")).toBeVisible()
    await expect(page.getByTestId("org-org_001")).toContainText("Assumption College")
  })

  test("says so when there are none, rather than rendering an empty box", async ({ page }) => {
    await seedCache(page, [entry(orpc.orgs.list, undefined, { orgs: [] })])
    await page.goto("/#/orgs")

    await expect(page.getByTestId("orgs-list")).toBeHidden()
    await expect(page.getByTestId("orgs-page")).toContainText("No organisations yet")
  })
})

test.describe("An organisation page", () => {
  test("shows the profile form with the current name in it", async ({ page }) => {
    await seedCache(page, [signedIn, entry(orpc.orgs.get, { id: "org_001" }, ORG)])
    await page.goto("/#/org/org_001")

    await expect(page.getByTestId("org-page")).toContainText("Assumption College")
    await expect(page.getByTestId("org-name-input")).toHaveValue("Assumption College")
  })

  test("offers no Save button to someone the server says may not edit", async ({ page }) => {
    // The whole branch, in one field. The page reads `canEdit` and nothing else
    // — it does not know or ask what this viewer's role is.
    await seedCache(page, [
      signedIn,
      entry(orpc.orgs.get, { id: "org_001" }, { ...ORG, canEdit: false }),
    ])
    await page.goto("/#/org/org_001")

    await expect(page.getByTestId("org-name-readonly")).toHaveText("Assumption College")
    await expect(page.getByTestId("org-name-input")).toHaveCount(0)
    await expect(page.getByTestId("org-save")).toHaveCount(0)
  })

  test("shows the roster when the members query answers", async ({ page }) => {
    await seedCache(page, [
      signedIn,
      entry(orpc.orgs.get, { id: "org_001" }, ORG),
      entry(orpc.orgs.members, { id: "org_001" }, {
        members: [
          { userId: "usr_coach_001", email: "wichai.s@assumption.test", name: "Wichai", orgRoleCode: "ADMIN" },
        ],
      }),
    ])
    await page.goto("/#/org/org_001")

    await expect(page.getByTestId("org-members")).toBeVisible()
    await expect(page.getByTestId("member-row-wichai.s@assumption.test")).toContainText("ADMIN")
    await expect(page.getByTestId("add-member-form")).toBeVisible()
  })

  test("says 'not yours' when the members query is refused", async ({ page }) => {
    // No members entry — the harness answers 404, which is how a 403 reaches
    // this component: as an error, not as data.
    await seedCache(page, [signedIn, entry(orpc.orgs.get, { id: "org_001" }, ORG)])
    await page.goto("/#/org/org_001")

    await expect(page.getByTestId("org-members-denied")).toBeVisible()
    await expect(page.getByTestId("org-members")).toBeHidden()
    await expect(page.getByTestId("add-member-form")).toBeHidden()
  })

  test("offers a signed-out visitor no members section at all", async ({ page }) => {
    await seedCache(page, [entry(orpc.orgs.get, { id: "org_001" }, ORG)])
    await page.goto("/#/org/org_001")

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
      entry(orpc.orgs.get, { id: "org_001" }, ORG),
      entry(orpc.teams.list, undefined, {
        teams: [team(), team({ id: "team_009", name: "Somewhere Else U16", orgId: "org_002" })],
      }),
    ])
    await page.goto("/#/org/org_001")

    await expect(page.getByTestId("org-team-team_001")).toBeVisible()
    await expect(page.getByTestId("org-team-team_009")).toHaveCount(0)
  })

  test("says so when a school has none, rather than showing an empty box", async ({ page }) => {
    await seedCache(page, [
      signedIn,
      entry(orpc.orgs.get, { id: "org_001" }, ORG),
      entry(orpc.teams.list, undefined, { teams: [] }),
    ])
    await page.goto("/#/org/org_001")

    await expect(page.getByTestId("org-no-teams")).toBeVisible()
  })

  test("offers the form to a coach and not to a spectator", async ({ page }) => {
    await seedCache(page, [
      signedIn,
      entry(orpc.orgs.get, { id: "org_001" }, { ...ORG, canCreateTeam: false }),
      entry(orpc.teams.list, undefined, { teams: [team()] }),
    ])
    await page.goto("/#/org/org_001")

    // The list is still there — seeing a school's teams is not the same
    // permission as making one.
    await expect(page.getByTestId("org-team-team_001")).toBeVisible()
    await expect(page.getByTestId("create-team")).toHaveCount(0)
  })

  test("creates one with the school it was made on", async ({ page }) => {
    let sent = ""
    await seedCache(page, [
      signedIn,
      entry(orpc.orgs.get, { id: "org_001" }, ORG),
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

    await page.goto("/#/org/org_001")
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
