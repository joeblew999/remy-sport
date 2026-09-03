import { test, expect } from "./fixture"
import { asVisitor, sessionFor } from "../helpers/actors"
import { projectTeams } from "../helpers/projections"
import { visit } from "../helpers/surfaces"
import { seedCache, entry, orpc } from "../helpers/seed-cache"

/**
 * The teams directory.
 *
 * `BROWSE_TEAMS` is granted to PUBLIC and `teams.list` has declared exactly that
 * action since it was written — `openTo("BROWSE_TEAMS")` — while no screen read
 * it except the admin console's delete list. So the endpoint was built,
 * enforced, and unreachable: a parent could not see who their child plays next.
 *
 * Seeded from `projectTeams`, not from literals, so the rows here are the rows
 * the database holds. A directory asserted against invented teams would pass
 * against a seed that no longer has them.
 */

const teams = () => entry(orpc.teams.list, undefined, { teams: projectTeams() })

/** Which teams the model says are this reader's, and how. */
const holdings = (held: { type: string; id: string; relation: string }[]) =>
  entry(orpc.me.mine, undefined, { holdings: held, can: {} })

test.describe("The teams directory", () => {
  test("lists every squad, signed out — the model grants this to PUBLIC", async ({ page }) => {
    await asVisitor(page)
    await seedCache(page, [teams()])
    await visit(page, "teams")

    await expect(page.getByTestId("teams-list")).toBeVisible()
    // team_001 is in the seed and is the one every other spec leans on.
    await expect(page.getByTestId("team-row-team_001")).toBeVisible()
  })

  test("puts yours on top, and says why each one is yours", async ({ page }) => {
    await seedCache(page, [
      sessionFor("COACH"),
      teams(),
      // The relation comes back from ListObjects with the id. A row saying only
      // "yours" would be the page deciding; this is the model's own word for it.
      holdings([{ type: "TEAM", id: "team_001", relation: "HEAD_COACH" }]),
    ])
    await visit(page, "teams")

    await expect(page.getByTestId("your-teams")).toBeVisible()
    await expect(page.getByTestId("your-team-team_001")).toContainText("HEAD_COACH")
    // And still in the full list below: this is a shortcut, not a filter.
    await expect(page.getByTestId("team-row-team_001")).toBeVisible()
  })

  test("no section at all when none of them are yours", async ({ page }) => {
    await seedCache(page, [sessionFor("SPECTATOR"), teams(), holdings([])])
    await visit(page, "teams")

    await expect(page.getByTestId("teams-list")).toBeVisible()
    await expect(page.getByTestId("your-teams")).toHaveCount(0)
  })

  test("says so when there are none, rather than rendering an empty card", async ({ page }) => {
    await asVisitor(page)
    await seedCache(page, [entry(orpc.teams.list, undefined, { teams: [] })])
    await visit(page, "teams")

    await expect(page.getByTestId("teams-empty")).toBeVisible()
  })
})
