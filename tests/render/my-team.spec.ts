import { test, expect } from "./fixture"
import { sessionFor } from "../helpers/actors"
import { visit } from "../helpers/surfaces"
import { seedCache, entry, orpc } from "../helpers/seed-cache"
import { projectTeam } from "../helpers/projections"
import { apiMine } from "../helpers/api-fixtures"

/**
 * "My team" is yours, and — the half that matters — is nobody else's.
 *
 * The sidebar links to `#/team` with no id, and the page resolved that to
 * `allTeams[0]`: whichever team sorted first on the whole platform, shown to
 * every reader under a possessive heading. A coach at Assumption was shown
 * Triam Udom's team.
 *
 * The positive assertion could never have caught it, because a page showing
 * *somebody's* team satisfies "shows a team" perfectly. So each test here
 * asserts both halves: the right team appears, and the other one does not.
 *
 * Three answers, all ordinary — none, one, several. Seeding holdings directly
 * is what makes them cheap to reach: the several case needs a coach with two
 * teams and the none case needs a person with no relations, and asking the PO
 * to seed either would be a fixture request for a rendering test.
 */

const ASSUMPTION = "team_001"
const TRIAM = "team_002"

/**
 * Two teams at two schools, distinct in every field the page renders.
 *
 * `apiTeam`'s defaults are Triam Udom's, so overriding only the name left
 * team_001 called "Assumption" while its school still read "Triam Udom Suksa
 * School" — and the negative assertion failed against a page that was correct.
 * The school is overridden too, so "Triam Udom" appearing anywhere means the
 * wrong team is on screen and nothing else.
 */
const teams = [
  projectTeam(ASSUMPTION),
  projectTeam(TRIAM),
]

/** What `me.mine` returns: ids and how they are held, never rows. */
const holding = (id: string, type = "TEAM", relation = "HEAD_COACH") => ({ type, id, relation })

/** The whole response. `can` is the platform grants; no test here reads them. */
const mine = (holdings: ReturnType<typeof holding>[]) => apiMine(holdings)

test.describe("My team", () => {
  test("shows the team you hold, and not the one you do not", async ({ page }) => {
    await seedCache(page, [
      sessionFor("COACH"),
      entry(orpc.teams.list, undefined, { teams }),
      entry(orpc.me.mine, undefined, mine([holding(ASSUMPTION)])),
    ])
    await visit(page, "team")

    await expect(page.getByTestId("team-name")).toContainText("Assumption")
    // The assertion the original bug would have failed. Everything else here
    // passes just as happily when the page shows the wrong team.
    await expect(page.locator("body")).not.toContainText("Triam Udom")
  })

  test("offers a choice when you hold several, rather than choosing for you", async ({ page }) => {
    await seedCache(page, [
      sessionFor("COACH"),
      entry(orpc.teams.list, undefined, { teams }),
      entry(orpc.me.mine, undefined, mine([holding(ASSUMPTION), holding(TRIAM)])),
    ])
    await visit(page, "team")

    // Picking the first of your own teams is the same bug with a better source.
    await expect(page.getByTestId("team-choose")).toBeVisible()
    await expect(page.getByTestId(`my-team-${ASSUMPTION}`)).toBeVisible()
    await expect(page.getByTestId(`my-team-${TRIAM}`)).toBeVisible()
  })

  test("says so when you hold none, rather than showing a stranger's", async ({ page }) => {
    await seedCache(page, [
      sessionFor("SPECTATOR"),
      entry(orpc.teams.list, undefined, { teams }),
      entry(orpc.me.mine, undefined, mine([])),
    ])
    await visit(page, "team")

    // The common case: most readers of this product are on no team. It is not
    // an error, so it says what is missing and offers the way onward.
    await expect(page.getByTestId("team-none")).toBeVisible()
    await expect(page.locator("body")).not.toContainText("Assumption")
    await expect(page.locator("body")).not.toContainText("Triam Udom")
  })

  test("a team asked for by id is still shown, holdings or not", async ({ page }) => {
    await seedCache(page, [
      sessionFor("SPECTATOR"),
      entry(orpc.teams.get, { id: TRIAM }, teams[1]!),
      entry(orpc.teams.list, undefined, { teams }),
      entry(orpc.me.mine, undefined, mine([])),
    ])
    await visit(page, "team", { id: TRIAM })

    // Looking is public — see GRANTS. "Mine" narrows what you are shown by
    // default; it never hides a team somebody navigated to deliberately.
    await expect(page.getByTestId("team-name")).toContainText("Triam Udom")
  })
})
