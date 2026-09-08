import { test, expect } from "./fixture"
import { VISITOR, sessionFor } from "../helpers/actors"
import { visit } from "../helpers/surfaces"
import { seedCache, entry, orpc } from "../helpers/seed-cache"
import { apiMine, apiReference } from "../helpers/api-fixtures"
import { VOCABULARY } from "../../src/domain/vocabularies"
import {
  projectEvents,
  projectGamesIn,
  projectMyPlayers,
  projectTeams,
  type Held,
} from "../helpers/projections"

/**
 * Home is built from what you hold, and shows nobody another kind of person's
 * empty state.
 *
 * Walked on 2026-09-04 as all six seeded roles, the old profile dashboard
 * showed every one of them at least one other role's empty state — a coach
 * was told "No children yet" and "not organising any events", a parent of four
 * was asked what brought her here. Each test here is one of those people, and
 * the assertion that matters is what they are *not* shown.
 */

const holding = (type: string, id: string, relation: string) => ({ type, id, relation })
const games = projectGamesIn("evt_002")
const gamesOf = (teamId: string) =>
  entry(orpc.games.list, { teamId }, {
    games: games.filter((g) => g.homeTeamId === teamId || g.awayTeamId === teamId),
    viewerTimezone: null,
  })

/** Everything Home asks for, answered emptily, so a section that is absent is absent by decision. */
const base = [
  entry(orpc.reference.list, undefined, apiReference(VOCABULARY)),
  entry(orpc.events.list, undefined, { events: projectEvents() }),
  entry(orpc.teams.list, undefined, { teams: projectTeams() }),
  entry(orpc.events.invitations, undefined, { invitations: [] }),
  entry(orpc.notifications.following, undefined, { following: [], muted: [] }),
  entry(orpc.players.mine, undefined, { players: [] }),
]

const mine = (holdings: ReturnType<typeof holding>[], as: Held = []) =>
  entry(orpc.me.mine, undefined, apiMine(holdings, as))

test.describe("Home", () => {
  test("a coach sees the teams they hold, named for how they hold them, and their next fixture", async ({ page }) => {
    await seedCache(page, [
      sessionFor("COACH"),
      ...base,
      mine([holding("TEAM", "team_001", "HEAD_COACH"), holding("TEAM", "team_004", "HEAD_COACH")], ["ANY_COACH"]),
      gamesOf("team_001"),
      gamesOf("team_004"),
    ])
    await visit(page, "home")

    const row = page.getByTestId("home-team-team_001")
    await expect(row).toBeVisible()
    // The model's word for the relation, in the reader's language — not the code.
    await expect(row).toContainText("Head Coach")
    await expect(row).not.toContainText("HEAD_COACH")
    await expect(page.getByTestId("home-team-team_004")).toBeVisible()

    // The next fixture, derived from the same games the schedule shows.
    const next = games
      .filter((g) => (g.homeTeamId === "team_001" || g.awayTeamId === "team_001") && g.statusCode !== "FINISHED")
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0]
    if (next) {
      const opponent = next.homeTeamId === "team_001" ? next.awayTeamNames.en! : next.homeTeamNames.en!
      await expect(page.getByTestId("home-team-next-team_001")).toContainText(opponent)
    }

    // What a coach is NOT shown: the parent's prompt, the organiser's empty
    // state, the newcomer's question. The half that matters.
    await expect(page.getByTestId("your-players-none")).toHaveCount(0)
    await expect(page.getByTestId("home-events")).toHaveCount(0)
    await expect(page.getByTestId("who-are-you")).toHaveCount(0)
    // But the thing the model lets a coach start.
    await expect(page.getByTestId("home-create-team")).toBeVisible()
  })

  test("an organiser sees what they organise, apart from what they follow", async ({ page }) => {
    await seedCache(page, [
      sessionFor("ORGANIZER"),
      ...base,
      mine(
        [
          holding("EVENT", "evt_002", "OWNER"),
          holding("EVENT", "evt_001", "CO_ORGANIZER"),
          holding("EVENT", "evt_003", "FOLLOWER_EVENT"),
        ],
        ["ANY_ORGANIZER"],
      ),
    ])
    await visit(page, "home")

    const organising = page.getByTestId("home-events")
    // A co-organiser runs the event, so they belong beside the owner — and the
    // row says which, in the model's word.
    await expect(organising.getByTestId("home-event-evt_002")).toContainText("Owner")
    await expect(organising.getByTestId("home-event-evt_001")).toContainText("Co-organizer")
    await expect(organising.getByTestId("home-event-evt_003")).toHaveCount(0)
    await expect(page.getByTestId("home-create-event")).toBeVisible()

    await expect(page.getByTestId("home-teams")).toHaveCount(0)
    await expect(page.getByTestId("your-players-none")).toHaveCount(0)
  })

  test("a referee sees the games they are on, and nothing that is somebody else's", async ({ page }) => {
    await seedCache(page, [
      sessionFor("REFEREE"),
      ...base,
      mine([holding("GAME", "gam_002", "GAME_REFEREE")], ["ANY_REFEREE"]),
      entry(orpc.games.list, {}, { games, viewerTimezone: null }),
    ])
    await visit(page, "home")

    await expect(page.getByTestId("your-games")).toBeVisible()
    await expect(page.getByTestId("your-game-gam_002")).toBeVisible()
    await expect(page.getByTestId("home-teams")).toHaveCount(0)
    await expect(page.getByTestId("home-events")).toHaveCount(0)
    await expect(page.getByTestId("your-players-none")).toHaveCount(0)
  })

  test("somebody holding nothing yet is asked what they are, and offered a child to add", async ({ page }) => {
    await seedCache(page, [sessionFor("SPECTATOR"), ...base, mine([])])
    await visit(page, "home")

    await expect(page.getByTestId("who-are-you")).toBeVisible()
    await expect(page.getByTestId("your-players-none")).toBeVisible()
    await expect(page.getByTestId("home-teams")).toHaveCount(0)
    await expect(page.getByTestId("home-events")).toHaveCount(0)
    // Following is everybody's: the one section with its own empty state.
    await expect(page.getByTestId("following-card")).toBeVisible()
  })

  test("a parent sees their children, not a question about what brings them here", async ({ page }) => {
    const guardian = "usr_spectator_001"
    await seedCache(page, [
      sessionFor("SPECTATOR"),
      ...base,
      mine([holding("PLAYER", "ply_001", "GUARDIAN"), holding("PLAYER", "ply_002", "GUARDIAN")]),
      entry(orpc.players.mine, undefined, { players: projectMyPlayers(guardian).players }),
    ])
    await visit(page, "home")

    await expect(page.getByTestId("your-players")).toBeVisible()
    await expect(page.getByTestId("your-player-ply_001")).toBeVisible()
    await expect(page.getByTestId("who-are-you")).toHaveCount(0)
  })

  test("a visitor at the root gets Discover, and no Home to go to", async ({ page }) => {
    await seedCache(page, [VISITOR, ...base])
    await visit(page, "home")

    await expect(page.getByRole("heading", { level: 1 })).toContainText("What's on the court")
    await expect(page.getByTestId("nav-home")).toHaveCount(0)
  })

  test("is where the sidebar starts, and Discover is a step away from it", async ({ page }) => {
    await seedCache(page, [
      sessionFor("COACH"),
      ...base,
      mine([holding("TEAM", "team_001", "HEAD_COACH")], ["ANY_COACH"]),
      gamesOf("team_001"),
    ])
    await visit(page, "home")
    await expect(page.getByTestId("nav-home")).toHaveAttribute("aria-current", "page")

    await page.getByTestId("nav-discover").click()
    await expect(page.getByRole("heading", { level: 1 })).toContainText("What's on the court")
    // The active state is the registry sidebar's `data-active` state attribute
    // — present and empty when active — not a class. B2 step 8 replaced the
    // hand-rolled nav row.
    await expect(page.getByTestId("nav-discover")).toHaveAttribute("data-active", "")
  })
})
