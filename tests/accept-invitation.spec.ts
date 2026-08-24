import { test, expect, type Page } from "@playwright/test"
import { signInViaPage as signIn, deleteOrgViaPage, ORGANIZER, COACH, REFEREE, SPECTATOR } from "./helpers/auth"

// ADR 011. The invitation email sent in ADR 010 pointed at a route that did not
// exist. These cover the landing page and the accept round-trip.



async function createInvitation(page: Page, invitee: string) {
  await signIn(page, ORGANIZER)
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

test.describe("Accept invitation page", () => {
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
    await signIn(page, ORGANIZER)
    while (created.length) await deleteOrgViaPage(page, created.pop()!)
  })

  test("a signed-out visitor is asked to sign in, not told the invite is dead", async ({ page }) => {
    const { orgId, invitationId } = await createInvitation(page, "referee@remy.dev")
    created.push(orgId)

    // Clear the session — this is the real case: someone clicking a link in
    // their inbox. get-invitation 401s for them, and an earlier version of this
    // page reported that as "no longer valid".
    await page.context().clearCookies()
    await page.goto(`/app#/accept-invitation/${invitationId}`)

    await expect(page.getByTestId("invitation-needs-signin")).toBeVisible()
    await expect(page.getByTestId("invitation-error")).toHaveCount(0)
  })

  test("a bad invitation id is reported as invalid to a signed-in user", async ({ page }) => {
    await signIn(page, ORGANIZER)
    await page.goto("/app#/accept-invitation/not-a-real-invitation")
    await expect(page.getByTestId("invitation-error")).toBeVisible()
  })

  test("the invitee sees the organisation and can accept", async ({ page }) => {
    const { orgId, invitationId } = await createInvitation(page, "referee@remy.dev")
    created.push(orgId)

    await page.context().clearCookies()
    await signIn(page, REFEREE)

    await page.goto(`/app#/accept-invitation/${invitationId}`)
    await expect(page.getByTestId("invitation-ready")).toBeVisible()
    await page.getByTestId("invitation-accept").click()
    await expect(page.getByTestId("invitation-accepted")).toBeVisible()

    // Accepting must actually create membership, not just change the screen.
    const isMember = await page.evaluate(async (id) => {
      const r = await fetch(`/api/auth/organization/get-full-organization?organizationId=${id}`)
      if (!r.ok) return false
      const org = await r.json()
      return (org.members ?? []).some(
        (m: { user?: { email?: string } }) => m.user?.email === "referee@remy.dev",
      )
    }, orgId)
    expect(isMember, "the invitee should now be a member").toBe(true)
  })

  test("signed in as the wrong person, the page says so", async ({ page }) => {
    const { orgId, invitationId } = await createInvitation(page, "player@remy.dev")
    created.push(orgId)

    await page.context().clearCookies()
    await signIn(page, COACH)

    await page.goto(`/app#/accept-invitation/${invitationId}`)
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
