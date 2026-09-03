import { test, expect } from "./fixture"
import { sessionFor } from "../helpers/actors"
import { visit } from "../helpers/surfaces"
import { seedCache, entry, orpc } from "../helpers/seed-cache"
import { apiMyPlayer, type ApiMyPlayer } from "../helpers/api-fixtures"

/**
 * A guardian's children, on their own profile.
 *
 * The `guardians` table has been seeded since the fixtures were written and no
 * screen had ever read it — so a parent signing in had no way to learn which
 * team their child was on, which for a youth sports platform is close to the
 * whole point.
 */

const signedIn = sessionFor("SPECTATOR")

// Through `apiMyPlayer`, so `guardianTypeCode` and `positionCode` stay their
// vocabularies. The `Record<string, unknown>` overrides here widened both to
// `string`, which is what the cast at each seed site was covering.
const child = (over: Partial<ApiMyPlayer> = {}) =>
  apiMyPlayer({
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

const seed = (page: Parameters<typeof seedCache>[0], players: ApiMyPlayer[]) =>
  seedCache(page, [
    signedIn,
    entry(orpc.players.mine, undefined, { players }),
    entry(orpc.events.list, undefined, { events: [], canCreate: false }),
  ])

test.describe("Your players", () => {
  test("names each child, their relationship, position and team", async ({ page }) => {
    await seed(page, [child()])
    await visit(page, "dashboard")

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
    await visit(page, "dashboard")
    await page.getByTestId("goto-team-ply_001").click()

    await expect(page).toHaveURL(/#\/team\/team_001/)
  })

  test("says so rather than linking nowhere when a child has no team", async ({ page }) => {
    // A real state: a player registered but not yet placed. A row that looks
    // clickable and goes nowhere is the dead-button problem again.
    await seed(page, [child({ teamId: null, teamNames: null })])
    await visit(page, "dashboard")

    await expect(page.getByTestId("your-player-ply_001")).toContainText("Not on a team")
    // The navigating control is disabled, not the row — a row that looks
    // clickable and goes nowhere is the dead-button problem again.
    await expect(page.getByTestId("goto-team-ply_001")).toBeDisabled()
  })

  test("omits the relationship when the player is you", async ({ page }) => {
    // SELF is not a guardianship. "Self · Parent" would be nonsense, and the
    // API sends null for exactly this case.
    await seed(page, [child({ guardianTypeCode: null })])
    await visit(page, "dashboard")

    const row = page.getByTestId("your-player-ply_001")
    await expect(row).toContainText("Assumption U18 Boys")
    await expect(row).not.toContainText("Parent")
  })

  test("shows no roster to somebody who is guardian to nobody, but does offer the way in", async ({
    page,
  }) => {
    // Most people signing in are not guardians, and a permanent "you are not a
    // guardian to anyone" panel is what teaches people to stop reading a
    // section — so there is no card.
    //
    // The Add control is the exception and has to be. Until 2026-08-31 no
    // procedure could create a player, so a real parent signed in to an empty
    // list and had nowhere to go. A card that hides itself when empty is right;
    // one that hides the only way to stop being empty is a dead end.
    await seed(page, [])
    await visit(page, "dashboard")

    await expect(page.getByTestId("profile-events")).toBeVisible()
    await expect(page.getByTestId("your-players")).toHaveCount(0)
    await expect(page.getByTestId("add-player")).toBeVisible()
  })
})

test.describe("Signing up a child", () => {
  /**
   * `SIGN_UP_PLAYER_AS_GUARDIAN` is granted to ANY_SIGNED_IN — any parent may
   * register their own child, whatever else they are — and it is a different
   * action from `CREATE_PLAYER`, which is a coach adding somebody to the pool.
   * This form is the parent's, so it writes the guardianship with the player.
   */
  test("asks for the child, and for how you are related to them", async ({ page }) => {
    await seed(page, [])
    await visit(page, "dashboard")
    await page.getByTestId("add-player").click()

    await expect(page.getByTestId("add-player-form")).toBeVisible()
    await expect(page.getByTestId("add-player-name")).toBeVisible()
    // The relationship is asked because the model distinguishes parent from
    // grandparent from legal guardian, and the row renders which.
    await expect(page.getByTestId("add-player-relationship")).toBeVisible()
  })

  test("asks for a date of birth with a date control, not a text box", async ({ page }) => {
    // `dob` decides age-group eligibility and the edit form deliberately cannot
    // change it, so this is the only moment it is ever set. A free-text box is
    // how "18/04/2012" reaches an API that wants YYYY-MM-DD and comes back a
    // 400 the parent cannot read.
    await seed(page, [])
    await visit(page, "dashboard")
    await page.getByTestId("add-player").click()
    await expect(page.getByTestId("add-player-dob")).toHaveAttribute("type", "date")
  })

  test("sends what was typed, as the contract wants it", async ({ page }) => {
    await seed(page, [])
    await visit(page, "dashboard")

    let sent = ""
    await page.route("**/rpc/**", async (route) => {
      if (!route.request().url().includes("signUpAsGuardian")) return route.fallback()
      sent = route.request().postData() ?? ""
      await route.fulfill({ status: 201, contentType: "application/json", body: "{}" })
    })

    await page.getByTestId("add-player").click()
    await page.getByTestId("add-player-name").fill("Ploy Suksawat")
    await page.getByTestId("add-player-dob").fill("2012-04-18")
    await page.getByTestId("add-player-number").fill("12")
    await page.getByTestId("add-player-save").click()

    await expect.poll(() => sent).toContain("Ploy Suksawat")
    // The name is a locale map underneath, even though the form asks once.
    expect(sent).toContain("\"en\"")
    expect(sent).toContain("2012-04-18")
  })

  test("closes without saving when cancelled", async ({ page }) => {
    await seed(page, [])
    await visit(page, "dashboard")
    await page.getByTestId("add-player").click()
    await expect(page.getByTestId("add-player-form")).toBeVisible()
    await page.getByRole("button", { name: "Cancel" }).click()
    await expect(page.getByTestId("add-player-form")).toHaveCount(0)
  })
})

test.describe("Correcting a player's details", () => {
  /**
   * `EDIT_PLAYER_PROFILE` was granted to SELF, GUARDIAN and the coaches from
   * the day the fixtures were written, with no procedure and no form — a parent
   * whose child was given the wrong squad number could do nothing about it.
   */
  test("is offered only where the model says the reader may edit", async ({ page }) => {
    await seed(page, [child({ canEdit: false })])
    await visit(page, "dashboard")
    await expect(page.getByTestId("your-player-ply_001")).toBeVisible()
    await expect(page.getByTestId("edit-player-ply_001")).toHaveCount(0)
  })

  test("opens a form prefilled with what is stored", async ({ page }) => {
    await seed(page, [child()])
    await visit(page, "dashboard")
    await page.getByTestId("edit-player-ply_001").click()

    await expect(page.getByTestId("player-number-ply_001")).toHaveValue("7")
    await expect(page.getByTestId("player-position-ply_001")).toHaveValue("PG")
  })

  test("is reachable by keyboard, which the first version was not", async ({ page }) => {
    // The Edit control started as a `<span role="button">` *inside* the
    // navigating `<button>`. Interactive content cannot nest: a keyboard user
    // reached the outer button and could never get to the inner one, and a
    // screen reader was told about a button containing a button. It behaved
    // with a mouse, which is what made it look finished.
    await seed(page, [child()])
    await visit(page, "dashboard")

    await page.getByTestId("edit-player-ply_001").focus()
    await page.keyboard.press("Enter")
    await expect(page.getByTestId("player-form-ply_001")).toBeVisible()
  })

  test("sends the change for that player", async ({ page }) => {
    let sent = ""
    await seed(page, [child()])
    await page.route("**/rpc/**", async (route) => {
      if (!route.request().url().includes("players/update")) return route.fallback()
      sent = route.request().postData() ?? ""
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          json: { playerId: "ply_001", names: child().names, jerseyNumber: 12, positionCode: "SG" },
        }),
      })
    })

    await visit(page, "dashboard")
    await page.getByTestId("edit-player-ply_001").click()
    await page.getByTestId("player-number-ply_001").fill("12")
    await page.getByTestId("player-position-ply_001").selectOption("SG")
    await page.getByTestId("player-save-ply_001").click()

    await expect.poll(() => sent, { message: "the edit must reach the server" }).not.toBe("")
    expect(sent).toContain("ply_001")
    expect(sent).toContain("12")
    expect(sent).toContain("SG")
  })

  test("edits one child at a time", async ({ page }) => {
    // Two open forms on one card is a way to save the wrong child's number.
    await seed(page, [child(), child({ playerId: "ply_002", names: { en: "Nid Chai" } })])
    await visit(page, "dashboard")

    await page.getByTestId("edit-player-ply_001").click()
    await expect(page.getByTestId("player-form-ply_001")).toBeVisible()
    await page.getByTestId("edit-player-ply_002").click()
    await expect(page.getByTestId("player-form-ply_002")).toBeVisible()
    await expect(page.getByTestId("player-form-ply_001")).toHaveCount(0)
  })
})
