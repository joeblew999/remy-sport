import { test, expect } from "./fixture"
import { VISITOR, sessionFor } from "../helpers/actors"
import { visit } from "../helpers/surfaces"
import { seedCache, entry, orpc } from "../helpers/seed-cache"
import { projectEvent } from "../helpers/projections"

/**
 * The shell and the derived view models, with the cache handed its data.
 *
 * Split out of spa.spec.ts. What stayed there is the pair that genuinely proves
 * the wiring — that the page's data came from the server over /rpc, and that the
 * API is same-origin. Everything below asserts what the UI does with data it was
 * given, which needs no server at all.
 *
 * The date-window test is the sharpest example. It guards the AGENTS.md rule
 * "derive, don't store, anything that is a function of other columns": there is
 * no `status` column and there must never be one. Asserting that used to require
 * a seeded row whose dates happened to be in the past — so the test depended on
 * the fixture staying stale. Here the window is an argument.
 */

// From the shared factory, typed as the real ApiEvent — see
// tests/helpers/api-fixtures.ts for why the hand-written literal went.
/**
 * The seeded league. The literal here carried its real name against the camp's
 * dates and an organiser called "u1" — a person no row holds.
 */
const LEAGUE = "evt_002"
const EVENT = projectEvent(LEAGUE)

/**
 * The camp, whose window closed in April.
 *
 * "status comes from the stored date window" needs an event that has finished,
 * and the seed has one — the literal this replaces borrowed the camp's dates
 * and wore the league's name.
 */
const FINISHED = projectEvent("evt_003")

test.describe("The SPA shell", () => {
  test("React mounts and renders into #root", async ({ page }) => {
    // Router defaults to discover when there is no hash.
    await seedCache(page, [entry(orpc.events.list, undefined, { events: [] })])
    await visit(page, "discover")
    await expect(page.locator("#root")).not.toBeEmpty()
    await expect(page.locator("#root *").first()).toBeVisible()
  })

  test("a hash deep-link resolves client-side, with no server round trip", async ({ page }) => {
    await visit(page, "live")
    await expect(page.locator("#root")).not.toBeEmpty()
    expect(page.url()).toContain("#/live")
  })

  test("a deep link renders rather than 404ing", async ({ page }) => {
    // Hash routing means every deep link resolves to the same document; there
    // is no server-side rewrite table and there must not need to be one.
    await visit(page, "admin")
    await expect(page.locator("#root")).toBeAttached()
  })
})

test.describe("Event view models are derived, not stored", () => {
  test("status and date come from the stored date window", async ({ page }) => {
    // No status column exists in D1; the SPA computes it. An event whose window
    // has passed must read as finished.
    await seedCache(page, [entry(orpc.events.list, undefined, { events: [FINISHED] })])
    await visit(page, "discover")

    const row = page.getByTestId("event-row").filter({ hasText: FINISHED.name })
    await expect(row).toBeVisible()
    await expect(row.getByTestId("event-day")).toHaveText("15")
    // "Apr", not "APR": the month comes from Intl.DateTimeFormat, in the
    // reader's language, and nothing shouts it — the hardcoded MONTHS array
    // this replaced was uppercase in every language.
    await expect(row.getByTestId("event-month")).toHaveText("Apr")
    await expect(row.getByTestId("event-status")).toHaveText("Finished")
  })

  test("an event deep-link renders that event", async ({ page }) => {
    await seedCache(page, [entry(orpc.events.get, { id: LEAGUE }, EVENT)])
    await visit(page, "event", { id: "evt_002" })
    // The event names itself in the site header now, not in its hero band.
    await expect(page.getByTestId("page-title")).toContainText("Bangkok Schools Basketball League 2026")
  })

})

/**
 * The app shows the signed-in account, not an invented one.
 *
 * It used to render "Coach Sukasem · Head Coach · SGS", hardcoded, at the bottom
 * of every page — while the topbar showed the real account. A signed-in coach
 * saw two different people on one screen, and nothing marked either as sample.
 * The user card is gone (B2 step 8): the person is the topbar's dropdown
 * trigger, in one place, and the sidebar carries navigation only.
 */
test.describe("The signed-in identity", () => {
  test("is the signed-in user, shown once", async ({ page }) => {
    await seedCache(page, [
      sessionFor("COACH"),
    ])
    await visit(page, "discover")

    await expect(page.getByTestId("account-user")).toHaveText("Wichai Srisuk")
    // The platform role, which is what decides permissions (ADR 009).
    await expect(page.getByTestId("account-role")).toHaveText("coach")
    // The name nobody is signed in as.
    await expect(page.getByTestId("account-user")).not.toContainText("Sukasem")
    await expect(page.getByTestId("account-user")).toHaveCount(1)
  })

  test("renders nothing at all when signed out, rather than a placeholder person", async ({
    page,
  }) => {
    await seedCache(page, [
      VISITOR,
    ])
    await visit(page, "discover")
    await expect(page.getByTestId("account")).toHaveCount(0)
    await expect(page.getByTestId("topbar-sign-in")).toBeVisible()
  })
})
