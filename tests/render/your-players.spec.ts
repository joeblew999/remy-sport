import { test, expect } from "./fixture"
import { seedCache, entry, orpc } from "../helpers/seed-cache"
import { sessionKey } from "../../src/web/lib/session"

/**
 * A guardian's children, on their own profile.
 *
 * The `guardians` table has been seeded since the fixtures were written and no
 * screen had ever read it — so a parent signing in had no way to learn which
 * team their child was on, which for a youth sports platform is close to the
 * whole point.
 */

const signedIn = {
  queryKey: sessionKey as unknown as readonly unknown[],
  data: {
    user: { id: "usr_spectator_001", email: "parent@remy.test", name: "Parent", role: "user" },
    session: { activeOrganizationId: null, impersonatedBy: null },
  },
}

const child = (over: Record<string, unknown> = {}) => ({
  playerId: "ply_001",
  names: { en: "Somchai Prasert", th: "สมชาย ประเสริฐ" },
  jerseyNumber: 7,
  positionCode: "PG",
  guardianTypeCode: "PARENT",
  teamId: "team_001",
  teamNames: { en: "Assumption U18 Boys" },
  canEdit: true,
  ...over,
})

const seed = (page: Parameters<typeof seedCache>[0], players: unknown[]) =>
  seedCache(page, [
    signedIn,
    entry(orpc.players.mine, undefined as never, { players } as never),
    entry(orpc.events.list, undefined as never, { events: [] } as never),
  ])

test.describe("Your players", () => {
  test("names each child, their relationship, position and team", async ({ page }) => {
    await seed(page, [child()])
    await page.goto("/#/profile")

    const row = page.getByTestId("your-player-ply_001")
    await expect(row).toContainText("Somchai Prasert")
    await expect(row).toContainText("#7")
    // The model distinguishes parent from grandparent from legal guardian, and
    // flattening them to "guardian" would discard what the table says.
    await expect(row).toContainText("Parent")
    await expect(row).toContainText("Assumption U18 Boys")
  })

  test("goes to the team, which is what a guardian came for", async ({ page }) => {
    await seed(page, [child()])
    await page.goto("/#/profile")
    await page.getByTestId("your-player-ply_001").click()

    await expect(page).toHaveURL(/#\/team\/team_001/)
  })

  test("says so rather than linking nowhere when a child has no team", async ({ page }) => {
    // A real state: a player registered but not yet placed. A row that looks
    // clickable and goes nowhere is the dead-button problem again.
    await seed(page, [child({ teamId: null, teamNames: null })])
    await page.goto("/#/profile")

    const row = page.getByTestId("your-player-ply_001")
    await expect(row).toContainText("Not on a team")
    await expect(row).toBeDisabled()
  })

  test("omits the relationship when the player is you", async ({ page }) => {
    // SELF is not a guardianship. "Self · Parent" would be nonsense, and the
    // API sends null for exactly this case.
    await seed(page, [child({ guardianTypeCode: null })])
    await page.goto("/#/profile")

    const row = page.getByTestId("your-player-ply_001")
    await expect(row).toContainText("Assumption U18 Boys")
    await expect(row).not.toContainText("Parent")
  })

  test("renders nothing at all for somebody who is guardian to nobody", async ({ page }) => {
    // Most people signing in are not guardians. A permanent "you are not a
    // guardian to anyone" panel on every profile is what teaches people to stop
    // reading a section.
    await seed(page, [])
    await page.goto("/#/profile")

    await expect(page.getByTestId("profile-events")).toBeVisible()
    await expect(page.getByTestId("your-players")).toHaveCount(0)
  })
})
