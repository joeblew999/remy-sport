import { test, expect } from "./fixture"
import { asVisitor, sessionFor } from "../helpers/actors"
import { projectPlayer } from "../helpers/projections"
import { visit } from "../helpers/surfaces"
import { seedCache, entry, orpc } from "../helpers/seed-cache"

/**
 * The player page.
 *
 * The model has five object types and the app had a page for four. A player was
 * a row in somebody else's roster, which quietly made three more actions
 * unreachable: `FollowButton` accepts `PLAYER` and was rendered only for teams
 * and events, so nobody could follow a player and nobody could be notified
 * about one. `VIEW_PLAYER` — granted to PUBLIC — was answered only for a
 * guardian looking at their own child.
 *
 * Signed in throughout, deliberately. `players.get` is declared stricter than
 * the model for the reason `domain.ts` already gives: these rows name minors.
 */

const PLAYER = "ply_001"

const signedIn = sessionFor("SPECTATOR")

test.describe("The player page", () => {
  test("names them, their number and their position", async ({ page }) => {
    await seedCache(page, [
      signedIn,
      entry(orpc.players.get, { id: PLAYER }, projectPlayer(PLAYER)),
    ])
    await visit(page, "player", { id: PLAYER })

    await expect(page.getByTestId("player-page")).toBeVisible()
    // From the seed, not from a literal — the number and position are whatever
    // the fixtures hold.
    await expect(page.getByTestId("player-meta")).toContainText(
      String(projectPlayer(PLAYER).jerseyNumber),
    )
  })

  test("shows the squad they are on, and offers a way to it", async ({ page }) => {
    const p = projectPlayer(PLAYER)
    await seedCache(page, [signedIn, entry(orpc.players.get, { id: PLAYER }, p)])
    await visit(page, "player", { id: PLAYER })

    // ply_001 is on a squad in the seed; if that ever stops being true this
    // asserts the empty state instead, which is the honest failure.
    if (p.teamId) {
      await expect(page.getByTestId(`player-team-${p.teamId}`)).toBeVisible()
    } else {
      await expect(page.getByTestId("player-no-team")).toBeVisible()
    }
  })

  test("says so when they are between squads", async ({ page }) => {
    await seedCache(page, [
      signedIn,
      entry(orpc.players.get, { id: PLAYER }, {
        ...projectPlayer(PLAYER),
        teamId: null,
        teamNames: null,
      }),
    ])
    await visit(page, "player", { id: PLAYER })

    // A real state: signed up by a guardian and not yet placed. An empty cell
    // would read as a page that failed to load.
    await expect(page.getByTestId("player-no-team")).toBeVisible()
  })

  test("the roster is the way in, which it was not before", async ({ page }) => {
    const { projectRoster, projectTeam } = await import("../helpers/projections")
    const TEAM = "team_001"
    await seedCache(page, [
      signedIn,
      entry(orpc.teams.get, { id: TEAM }, projectTeam(TEAM)),
      entry(orpc.teams.roster, { teamId: TEAM }, projectRoster(TEAM, { signedIn: true })),
    ])
    await visit(page, "team", { id: TEAM })

    const first = projectRoster(TEAM, { signedIn: true }).players[0]!
    await page.getByTestId(`open-player-${first.playerId}`).click()
    await expect(page).toHaveURL(new RegExp(`#/player/${first.playerId}$`))
  })
})

/**
 * Signed out is not "no such player".
 *
 * `players.get` is stricter than the model and refuses without a session, so a
 * visitor's query fails and the page has no data — which it first reported as
 * "No such player." Telling somebody a child does not exist, when the truth is
 * that they have not signed in, is a lie the reader cannot see through.
 *
 * This page is the only one that has to draw the distinction: it is the single
 * screen the model grants to PUBLIC and the app deliberately keeps behind a
 * session, because these rows name minors.
 */
test.describe("The player page, signed out", () => {
  test("asks the visitor to sign in rather than denying the player exists", async ({ page }) => {
    await asVisitor(page)
    await visit(page, "player", { id: PLAYER })

    await expect(page.getByTestId("player-signin")).toBeVisible()
    await expect(page.getByTestId("player-not-found")).toHaveCount(0)
  })
})
