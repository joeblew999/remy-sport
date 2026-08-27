import { test, expect } from "./fixture"
import { seedCache, entry, orpc } from "../helpers/seed-cache"
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
    await seedCache(page, [entry(orpc.orgs.list, undefined, { orgs: [ORG] } as never)])
    await page.goto("/#/orgs")

    await expect(page.getByTestId("orgs-page")).toBeVisible()
    await expect(page.getByTestId("org-org_001")).toContainText("Assumption College")
  })

  test("says so when there are none, rather than rendering an empty box", async ({ page }) => {
    await seedCache(page, [entry(orpc.orgs.list, undefined, { orgs: [] } as never)])
    await page.goto("/#/orgs")

    await expect(page.getByTestId("orgs-list")).toBeHidden()
    await expect(page.getByTestId("orgs-page")).toContainText("No organisations yet")
  })
})

test.describe("An organisation page", () => {
  test("shows the profile form with the current name in it", async ({ page }) => {
    await seedCache(page, [signedIn, entry(orpc.orgs.get, { id: "org_001" }, ORG as never)])
    await page.goto("/#/org/org_001")

    await expect(page.getByTestId("org-page")).toContainText("Assumption College")
    await expect(page.getByTestId("org-name-input")).toHaveValue("Assumption College")
  })

  test("offers no Save button to someone the server says may not edit", async ({ page }) => {
    // The whole branch, in one field. The page reads `canEdit` and nothing else
    // — it does not know or ask what this viewer's role is.
    await seedCache(page, [
      signedIn,
      entry(orpc.orgs.get, { id: "org_001" }, { ...ORG, canEdit: false } as never),
    ])
    await page.goto("/#/org/org_001")

    await expect(page.getByTestId("org-name-readonly")).toHaveText("Assumption College")
    await expect(page.getByTestId("org-name-input")).toHaveCount(0)
    await expect(page.getByTestId("org-save")).toHaveCount(0)
  })

  test("shows the roster when the members query answers", async ({ page }) => {
    await seedCache(page, [
      signedIn,
      entry(orpc.orgs.get, { id: "org_001" }, ORG as never),
      entry(orpc.orgs.members, { id: "org_001" }, {
        members: [
          { userId: "usr_coach_001", email: "wichai.s@assumption.test", name: "Wichai", orgRoleCode: "ADMIN" },
        ],
      } as never),
    ])
    await page.goto("/#/org/org_001")

    await expect(page.getByTestId("org-members")).toBeVisible()
    await expect(page.getByTestId("member-row-wichai.s@assumption.test")).toContainText("ADMIN")
    await expect(page.getByTestId("add-member-form")).toBeVisible()
  })

  test("says 'not yours' when the members query is refused", async ({ page }) => {
    // No members entry — the harness answers 404, which is how a 403 reaches
    // this component: as an error, not as data.
    await seedCache(page, [signedIn, entry(orpc.orgs.get, { id: "org_001" }, ORG as never)])
    await page.goto("/#/org/org_001")

    await expect(page.getByTestId("org-members-denied")).toBeVisible()
    await expect(page.getByTestId("org-members")).toBeHidden()
    await expect(page.getByTestId("add-member-form")).toBeHidden()
  })

  test("offers a signed-out visitor no members section at all", async ({ page }) => {
    await seedCache(page, [entry(orpc.orgs.get, { id: "org_001" }, ORG as never)])
    await page.goto("/#/org/org_001")

    await expect(page.getByTestId("org-profile")).toBeVisible()
    await expect(page.getByTestId("org-members")).toBeHidden()
    await expect(page.getByTestId("org-members-denied")).toBeHidden()
  })
})
