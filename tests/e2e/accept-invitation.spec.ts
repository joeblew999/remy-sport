import { test, expect, type Page } from "@playwright/test"
import {
  COACH,
  REFEREE,
  SPECTATOR,
  actor,
  deleteOrgViaPage,
  gotoFresh,
  signInViaPage as signIn,
  ACTORS,
} from "../helpers/auth"

/**
 * This spec's own actors, not the shared ones.
 *
 * Every e2e spec runs against one local D1 and one set of seeded people. Better
 * Auth invalidates an OTP when a newer one is requested for the same address,
 * so two specs signing in as *the* organizer concurrently make one of them fail
 * with INVALID_OTP — and which one loses moves between runs, so it reads as a
 * bug in whichever was second.
 *
 * The fixtures already seed three organizers and three coaches at three
 * schools. Nothing needed adding; the specs were simply all taking the first.
 *
 * The COACH here is deliberately NOT indexed: seed.ts makes `usr_coach_001` —
 * the first one — the org admin at Assumption College, and the membership
 * assertions below are about that seeded relationship. Swapping in another
 * coach makes them fail for the right reason.
 */
const ORGANIZER_2 = actor("ORGANIZER", 2)


// ADR 011. The invitation email sent in ADR 010 pointed at a route that did not
// exist. These cover the landing page and the accept round-trip.



async function createInvitation(page: Page, invitee: string) {
  await signIn(page, ORGANIZER_2)
  return page.evaluate(async (email) => {
    const org = await (
      await fetch("/api/auth/organization/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Accept Test Org",
          slug: `accept-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        }),
      })
    ).json()
    const invite = await (
      await fetch("/api/auth/organization/invite-member", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role: "member", organizationId: org.id }),
      })
    ).json()
    return { orgId: org.id as string, invitationId: invite.id as string }
  }, invitee)
}

test.describe.serial("Accept invitation page", () => {
  // Each test creates an organization; without this they accumulate until
  // organization/list stops returning the newest one and an unrelated spec
  // fails. See tests/helpers/auth.ts.
  const created: string[] = []
  test.afterEach(async ({ page }) => {
    if (!created.length) return
    // Sign back in as the owner first. These tests clear cookies or sign in as
    // the invitee, so the context that reaches teardown usually cannot delete
    // anything — which is why an earlier best-effort version silently deleted
    // nothing at all and the orgs kept accumulating.
    await signIn(page, ORGANIZER_2)
    while (created.length) await deleteOrgViaPage(page, created.pop()!)
  })

  test("a signed-out visitor is asked to sign in, not told the invite is dead", async ({ page }) => {
    const { orgId, invitationId } = await createInvitation(page, ACTORS.REFEREE)
    created.push(orgId)

    // Clear the session — this is the real case: someone clicking a link in
    // their inbox. get-invitation 401s for them, and an earlier version of this
    // page reported that as "no longer valid".
    await page.context().clearCookies()
    await gotoFresh(page, `/#/accept-invitation/${invitationId}`)

    await expect(page.getByTestId("invitation-needs-signin")).toBeVisible()
    await expect(page.getByTestId("invitation-error")).toHaveCount(0)
  })

  test("a bad invitation id is reported as invalid to a signed-in user", async ({ page }) => {
    await signIn(page, ORGANIZER_2)
    await gotoFresh(page, "/#/accept-invitation/not-a-real-invitation")
    await expect(page.getByTestId("invitation-error")).toBeVisible()
  })

  test("the invitee sees the organisation and can accept", async ({ page }) => {
    const { orgId, invitationId } = await createInvitation(page, ACTORS.REFEREE)
    created.push(orgId)

    await page.context().clearCookies()
    await signIn(page, REFEREE)

    await gotoFresh(page, `/#/accept-invitation/${invitationId}`)
    await expect(page.getByTestId("invitation-ready")).toBeVisible()
    await page.getByTestId("invitation-accept").click()
    await expect(page.getByTestId("invitation-accepted")).toBeVisible()

    // Accepting must actually create membership, not just change the screen.
    // The invitee's address is passed in: `page.evaluate` runs in the browser,
    // where a Node-scope constant does not exist.
    const isMember = await page.evaluate(
      async ({ id, email }) => {
        const r = await fetch(`/api/auth/organization/get-full-organization?organizationId=${id}`)
        if (!r.ok) return false
        const org = await r.json()
        return (org.members ?? []).some((m: { user?: { email?: string } }) => m.user?.email === email)
      },
      { id: orgId, email: ACTORS.REFEREE },
    )
    expect(isMember, "the invitee should now be a member").toBe(true)
  })

  test("signed in as the wrong person, the page says so", async ({ page }) => {
    const { orgId, invitationId } = await createInvitation(page, ACTORS.PLAYER)
    created.push(orgId)

    await page.context().clearCookies()
    await signIn(page, COACH)

    await gotoFresh(page, `/#/accept-invitation/${invitationId}`)
    await expect(page.getByTestId("invitation-wrong-account")).toBeVisible()
    // The accept button must not be offered to the wrong account.
    await expect(page.getByTestId("invitation-accept")).toHaveCount(0)
  })
})

test.describe("Session carries an active organization", () => {
  test("a member's session records which org they are in", async ({ page }) => {
    // ADR 009 left session.active_organization_id unwritten; ADR 011 fills it
    // from the user's oldest membership. The coach is seeded into Assumption.
    await signIn(page, COACH)
    const activeOrg = await page.evaluate(async () => {
      const r = await fetch("/api/auth/get-session")
      const s = await r.json()
      return s?.session?.activeOrganizationId ?? null
    })
    expect(activeOrg, "a seeded org member should have an active organization").toBeTruthy()
  })

  test("a user in no organization gets no active organization", async ({ page }) => {
    await signIn(page, SPECTATOR)
    const activeOrg = await page.evaluate(async () => {
      const r = await fetch("/api/auth/get-session")
      const s = await r.json()
      return s?.session?.activeOrganizationId ?? null
    })
    expect(activeOrg).toBeNull()
  })
})
