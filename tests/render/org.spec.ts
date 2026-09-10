import { test, expect } from "./fixture"
import { sessionFor } from "../helpers/actors"
import { apiMine } from "../helpers/api-fixtures"
import { projectOrg, projectOrgMembers, projectTeam, projectTeams } from "../helpers/projections"
import { visit } from "../helpers/surfaces"
import { seedCache, entry, orpc } from "../helpers/seed-cache"
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
 * Who the reader is on this school is stated — an ORG_ADMIN, here — and the
 * answers follow from the model. CREATE_TEAM is a *platform* grant, ANY_COACH
 * with no relation to any organisation, so it is `me.mine`'s answer and means
 * "may you create a team", not "here".
 */
const ORG = projectOrg(SCHOOL, ["ORG_ADMIN"])

const signedIn = sessionFor("COACH")
const asCoach = entry(orpc.me.mine, undefined, apiMine([], ["ANY_COACH"]))
const asSpectator = entry(orpc.me.mine, undefined, apiMine())

test.describe("The organisation list", () => {
  test("renders the schools it was given", async ({ page }) => {
    await seedCache(page, [entry(orpc.orgs.list, undefined, { orgs: [ORG] })])
    await visit(page, "orgs")

    await expect(page.getByTestId("orgs-page")).toBeVisible()
    const row = page.getByTestId("org-org_001")
    await expect(row).toContainText("Assumption College")
    // City and kind, in the reader's language. The second line was the slug —
    // "assumption-college", in monospace — which is an identifier, not a fact
    // about the school.
    await expect(row.locator("[data-slot=item-description]")).toHaveText("Bangkok · School")
    await expect(row).not.toContainText("assumption-college")
    // Everyone's list opens a school; only "Your organisations" manages one.
    await expect(row.getByRole("link")).toHaveText("Open")
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

    // The org names itself in the site header now, not in its hero band.
    await expect(page.getByTestId("page-title")).toContainText("Assumption College")
    await expect(page.getByTestId("org-name-input")).toHaveValue("Assumption College")
  })

  test("offers no Save button to someone the server says may not edit", async ({ page }) => {
    // The whole branch, in one field. The page reads `can.EDIT_ORG_PROFILE`
    // and nothing else — it does not know or ask what this viewer's role is.
    await seedCache(page, [
      signedIn,
      entry(orpc.orgs.get, { id: SCHOOL }, projectOrg(SCHOOL)),
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
      entry(orpc.orgs.members, { id: SCHOOL }, projectOrgMembers(SCHOOL)),
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
  /**
   * Off the seed, so the school, city and division are the row's own.
   *
   * The literal this replaces called team_001 "Assumption U18 Boys". team_001 is
   * the **U16** Boys — team_004 is the U18 side. It also carried a note about
   * having just fixed BANGKOK/BKK by hand, which is the tell: a fixture that has
   * to be corrected is one that can be wrong.
   */
  const team = (over: Partial<ApiTeam> = {}) => ({ ...projectTeam("team_001"), ...over })

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
      asSpectator,
      entry(orpc.orgs.get, { id: SCHOOL }, ORG),
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
      asCoach,
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

/**
 * Nothing appears above something a reader is already looking at.
 *
 * `Your organisations` is gated on `me.mine` and renders ABOVE the list, which
 * is gated on `orgs.list`. Two requests, resolving separately, so there used to
 * be a window where the rows were on screen and the section was not — and when
 * it landed, every row moved down the page.
 *
 * That is not cosmetic. A `click` fires only on the element that received both
 * `mousedown` and `mouseup`; when the row moves between them the browser fires
 * `click` on the nearest common ancestor and the link is never followed.
 * `orgs.spec.ts:24` in the e2e tier caught it as a click that completed and
 * navigated nowhere, and a reader tapping a school as their own list appears
 * loses the tap in exactly the same way, with nothing on screen to say why.
 *
 * This holds the invariant directly: while the section's query is in flight the
 * rows are not rendered at all. Seeding cannot express that — a seeded query is
 * answered before the first paint — so `me.mine` is left unseeded and held open
 * on the wire, which is the real shape of a slow answer.
 *
 * docs/done/2026-09-09-18-browser-tier-flakiness.md, step 9.
 */
test.describe("A section that renders above the list", () => {
  /** Holds one procedure open until the test lets it answer. */
  async function holdOpen(page: Parameters<typeof seedCache>[0], path: string) {
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => { release = resolve })
    // Registered after seedCache's catch-all, so it wins: Playwright matches
    // routes in reverse order of registration.
    await page.route(`**/rpc/${path}`, async (route) => {
      await held
      // The harness's own 404 — this test is about *when* the answer arrives,
      // not what it says.
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ code: "NOT_FOUND", message: "held open by this test" }),
      })
    })
    return () => release()
  }

  test("the organisations list waits for it, rather than being pushed down", async ({ page }) => {
    await seedCache(page, [signedIn, entry(orpc.orgs.list, undefined, { orgs: [ORG] })])
    const release = await holdOpen(page, "me/mine")
    await visit(page, "orgs")

    await expect(page.getByTestId("orgs-page")).toBeVisible()
    // The rows must not be on screen while something destined to sit above them
    // is still in flight.
    await expect(page.getByTestId("orgs-list")).toHaveCount(0)

    release()
    await expect(page.getByTestId("orgs-list")).toBeVisible()
    await expect(page.getByTestId("org-org_001")).toContainText("Assumption College")
  })
})
