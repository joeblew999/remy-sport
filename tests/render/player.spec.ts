import { test, expect } from "./fixture"
import { asVisitor, sessionFor } from "../helpers/actors"
import { projectPlayer, projectPlayerStats } from "../helpers/projections"
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

/**
 * Where they have played before.
 *
 * `playerTeam` has carried `fromDate` and `toDate` since the fixtures were
 * written and `toDate` was the one field in the whole API that no screen read —
 * `ply_002` left `team_001` on 2026-03-31 and the app could not say so.
 *
 * It is why the roster's button says "remove from squad" rather than "delete":
 * ending a spell keeps last season's team sheet true. The distinction was real
 * in the database and invisible everywhere else.
 */
test.describe("A player's past squads", () => {
  test("names the team and the dates, for somebody who left one", async ({ page }) => {
    // Derived: whichever seeded player actually has an ended spell. Naming one
    // would be a literal about the seed, which is what projections replaced.
    const departed = projectPlayer("ply_002")
    expect(departed.past.length, "ply_002 left team_001 in the seed").toBeGreaterThan(0)

    await seedCache(page, [
      signedIn,
      entry(orpc.players.get, { id: "ply_002" }, departed),
    ])
    await visit(page, "player", { id: "ply_002" })

    const spell = departed.past[0]!
    await expect(page.getByTestId(`player-past-${spell.teamId}`)).toContainText(spell.toDate)
  })

  test("says nothing at all for somebody who has only ever been on one squad", async ({ page }) => {
    await seedCache(page, [
      signedIn,
      entry(orpc.players.get, { id: PLAYER }, { ...projectPlayer(PLAYER), past: [] }),
    ])
    await visit(page, "player", { id: PLAYER })

    // Not an empty card. "Previously: nothing" on every page is noise on the
    // common case.
    await expect(page.getByTestId("player-past")).toHaveCount(0)
  })

  /**
   * The box score, which this page could not show until 2026-09-04.
   *
   * Scores were per team and nothing recorded what a player did, so the page's
   * own docstring said a "Points" heading over a blank column would be a
   * promise the schema could not keep. `playerGameStat` is that promise made
   * good, and `ply_001` has a real line from Assumption 68 – Montfort 54.
   */
  test("shows the season totals, and a per-game average beside each", async ({ page }) => {
    const stats = projectPlayerStats(PLAYER)
    expect(stats.recorded, "ply_001 should have a seeded box score").toBeGreaterThan(0)

    await seedCache(page, [
      signedIn,
      entry(orpc.players.get, { id: PLAYER }, projectPlayer(PLAYER)),
      entry(orpc.players.stats, { playerId: PLAYER }, stats),
    ])
    await visit(page, "player", { id: PLAYER })

    await expect(page.getByTestId("player-stats")).toBeVisible()
    for (const key of ["points", "rebounds", "assists", "fouls"] as const) {
      const row = page.getByTestId(`stat-${key}`)
      await expect(row).toContainText(String(stats.totals[key]))
      // The average, to one place — the number beside the total, not instead
      // of it.
      await expect(row).toContainText((stats.totals[key] / stats.recorded).toFixed(1))
    }
  })

  test("says how many games the numbers come from, not how many were played", async ({ page }) => {
    // A player can be on a squad for a game nobody kept a sheet for, so the
    // denominator is lines recorded. Calling it "games played" would make a
    // season look shorter than it was.
    const stats = projectPlayerStats(PLAYER)
    await seedCache(page, [
      signedIn,
      entry(orpc.players.get, { id: PLAYER }, projectPlayer(PLAYER)),
      entry(orpc.players.stats, { playerId: PLAYER }, stats),
    ])
    await visit(page, "player", { id: PLAYER })
    await expect(page.getByTestId("player-stats-games")).toContainText(String(stats.recorded))
  })

  test("shows no stat block at all for a player nobody kept a sheet on", async ({ page }) => {
    // Absent, not empty. Most players have no lines, and a blank stat card on
    // every page is the noise a "Previously: nothing" card would be.
    const none = { lines: [], recorded: 0, totals: { points: 0, rebounds: 0, assists: 0, fouls: 0 } }
    await seedCache(page, [
      signedIn,
      entry(orpc.players.get, { id: PLAYER }, projectPlayer(PLAYER)),
      entry(orpc.players.stats, { playerId: PLAYER }, none),
    ])
    await visit(page, "player", { id: PLAYER })
    await expect(page.getByTestId("player-page")).toBeVisible()
    await expect(page.getByTestId("player-stats")).toHaveCount(0)
  })
})
