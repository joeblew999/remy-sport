import { test, expect } from "@playwright/test"
import { stateFor, actor, COACH, REFEREE } from "../helpers/auth"

/**
 * Managing an organisation, through the browser, against a real Worker.
 *
 * This is the round trip the render tier cannot make: the members list is
 * authorised by a relation derived from `org_member`, so "can this coach see the
 * roster" is a question only the database can answer. The render tier seeds the
 * query and asserts what the page does with the answer; this asserts the answer.
 *
 * Serial, and it puts the roster back the way it found it. `org_member` is
 * shared seed state — authz.spec.ts reads relations derived from it — so a test
 * that added a member and left them there would change what a later file sees.
 */

// usr_coach_001 is ADMIN of org_001 in the fixtures, which is what grants
// INVITE_ORG_MEMBER. A coach at another school holds no relation to it.
const OUTSIDER = actor("COACH", 2)

test.describe.serial("Organisations", () => {
  test.use({ storageState: stateFor(COACH) })

  test("the list links through to a school", async ({ page }) => {
    await page.goto("/#/orgs")
    await expect(page.getByTestId("orgs-page")).toBeVisible()

    await page.getByTestId("org-org_001").getByRole("button").click()
    await expect(page.getByTestId("org-page")).toContainText("Assumption College")
  })

  test("an org admin adds a member by email and removes them again", async ({ page }) => {
    await page.goto("/#/org/org_001")

    // The roster answered, so the section rendered — see pages/org.tsx: this is
    // the whole of the page's permission logic.
    await expect(page.getByTestId("org-members")).toBeVisible()
    await expect(page.getByTestId(`member-row-${REFEREE}`)).toHaveCount(0)

    await page.getByTestId("add-member-email").fill(REFEREE)
    await page.getByTestId("add-member-submit").click()

    // Present after the mutation invalidates the list — no reload.
    await expect(page.getByTestId(`member-row-${REFEREE}`)).toBeVisible()
    await expect(page.getByTestId(`member-row-${REFEREE}`)).toContainText("MEMBER")

    await page.getByTestId(`remove-${REFEREE}`).click()
    await expect(page.getByTestId(`member-row-${REFEREE}`)).toHaveCount(0)
  })

  test("an address nobody signed up with is reported, not swallowed", async ({ page }) => {
    await page.goto("/#/org/org_001")
    await page.getByTestId("add-member-email").fill("nobody@example.invalid")
    await page.getByTestId("add-member-submit").click()

    await expect(page.getByTestId("org-members-error")).toBeVisible()
    await expect(page.getByTestId(`member-row-nobody@example.invalid`)).toHaveCount(0)
  })

  test("the profile edit persists across a reload", async ({ page }) => {
    await page.goto("/#/org/org_001")
    await page.getByTestId("org-name-input").fill("Assumption College")
    await page.getByTestId("org-save").click()

    await expect(page.getByTestId("org-profile")).toContainText("Profile saved")
    await page.reload()
    await expect(page.getByTestId("org-name-input")).toHaveValue("Assumption College")
  })
})

test.describe("A coach at another school", () => {
  test.use({ storageState: stateFor(OUTSIDER) })

  test("sees the profile but is told the roster is not theirs", async ({ page }) => {
    await page.goto("/#/org/org_001")
    await expect(page.getByTestId("org-profile")).toBeVisible()
    await expect(page.getByTestId("org-members-denied")).toBeVisible()
    await expect(page.getByTestId("add-member-form")).toHaveCount(0)
  })
})
