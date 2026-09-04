import { test, expect } from "./fixture"
import { asVisitor, sessionFor } from "../helpers/actors"
import { apiMine, apiReference } from "../helpers/api-fixtures"
import { projectTeams } from "../helpers/projections"
import { VOCABULARY } from "../../src/domain/vocabularies"
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
  entry(orpc.me.mine, undefined, apiMine(held))

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
      entry(orpc.reference.list, undefined, apiReference(VOCABULARY)),
      // The relation comes back from ListObjects with the id. A row saying only
      // "yours" would be the page deciding; this is the model's own word for it
      // — the word, in the reader's language, not the code. It printed
      // HEAD_COACH until the 2026-09-04 walk.
      holdings([{ type: "TEAM", id: "team_001", relation: "HEAD_COACH" }]),
    ])
    await visit(page, "teams")

    await expect(page.getByTestId("your-teams")).toBeVisible()
    await expect(page.getByTestId("your-team-team_001")).toContainText("Head Coach")
    await expect(page.getByTestId("your-team-team_001")).not.toContainText("HEAD_COACH")
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

/**
 * A model code is not a word anybody reads.
 *
 * Gender has been localised on a team since ADR 015 and the age group beside it
 * never was, so four screens rendered "U16 หญิง" — a code next to a translated
 * word, in the same sentence. The vocabulary has carried "อายุไม่เกิน 16 ปี"
 * all along and nothing asked for it.
 *
 * Asserted in English here because the render tier reads the default locale;
 * what matters is that the row shows the vocabulary's name and not the code,
 * which is the difference the bug turned on.
 */
test("a team row names the age group rather than its code", async ({ page }) => {
  await asVisitor(page)
  await seedCache(page, [teams()])
  await visit(page, "teams")

  // The meta line, not the whole row: team_001 is *named* "Assumption College
  // U16 Boys", so the code legitimately appears there and a negative assertion
  // against the row would be asserting the seed rather than the bug.
  const meta = page.getByTestId("team-row-team_001").locator(".device-meta")
  await expect(meta).toContainText("Under 16")
  await expect(meta).not.toContainText("U16")
})
