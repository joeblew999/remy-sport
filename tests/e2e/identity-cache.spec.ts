import { test, expect, type Page } from "@playwright/test"
import { freshActor, releaseSessions, signInThroughLoginForm } from "../helpers/auth"

/**
 * What a page offers follows who is signed in — in the same document.
 *
 * The SPA is one document with hash routes, so signing in or out never reloads
 * anything: the query cache that answered the visitor is the cache the coach
 * then reads, and the other way round. Found on 2026-09-06 by pressing Sign
 * out on a team page as its head coach — "Team details" and "Manage squad"
 * stayed on screen for a visitor, who would have been refused on use. Only the
 * session query was being invalidated; every `can` the server had answered
 * for the previous person stayed put. `identityChanged` in lib/session.tsx is
 * the fix, and this is what holds it.
 *
 * Follow, not the coach's controls, so the person can be a fresh account that
 * belongs to this test alone: following is for anyone signed in and nobody
 * else, which is exactly a viewer-dependent answer on the same query.
 */
const TEAM = "team_001"
const follow = (page: Page) => page.getByTestId(`follow-TEAM-${TEAM}`)

test.afterEach(async () => {
  await releaseSessions()
})

test("a page's answers change with the person, without a reload", async ({ page }) => {
  // A visitor. Following is for the signed-in, so the button is not offered.
  await page.goto(`/#/team/${TEAM}`)
  await expect(page.getByTestId("team-name")).toBeVisible()
  await expect(follow(page)).toHaveCount(0)

  // Sign in on the login screen: a hash change in the same document, so the
  // cache that answered the visitor is the one this person now reads from.
  await signInThroughLoginForm(page, freshActor())
  await page.evaluate((id) => {
    location.hash = `#/team/${id}`
  }, TEAM)
  await expect(follow(page)).toBeVisible()

  // Sign out where you stand. The page stays open, and asks again.
  await page.getByTestId("topbar-sign-out").click()
  await expect(follow(page)).toHaveCount(0)
  await expect(page.getByTestId("topbar-sign-in")).toBeVisible()
})
