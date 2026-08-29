import { test, expect } from "./fixture"
import { seedCache, entry, orpc } from "../helpers/seed-cache"
import { sessionKey } from "../../src/web/lib/session"
import { apiEvent } from "../helpers/api-fixtures"

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
const EVENT = apiEvent({
  names: { en: "Bangkok Schools Basketball League 2026" },
  startDate: "2026-04-15",
  endDate: "2026-04-19",
  organizerUserId: "u1",
  organizerName: "Bangkok Schools League",
})

test.describe("The SPA shell", () => {
  test("React mounts and renders into #root", async ({ page }) => {
    // Router defaults to discover when there is no hash.
    await seedCache(page, [entry(orpc.events.list, undefined, { events: [] } as never)])
    await page.goto("/")
    await expect(page.locator("#root")).not.toBeEmpty()
    await expect(page.locator("#root *").first()).toBeVisible()
  })

  test("a hash deep-link resolves client-side, with no server round trip", async ({ page }) => {
    await page.goto("/#/live")
    await expect(page.locator("#root")).not.toBeEmpty()
    expect(page.url()).toContain("#/live")
  })

  test("a deep link renders rather than 404ing", async ({ page }) => {
    // Hash routing means every deep link resolves to the same document; there
    // is no server-side rewrite table and there must not need to be one.
    await page.goto("/#/admin")
    await expect(page.locator("#root")).toBeAttached()
  })
})

test.describe("Event view models are derived, not stored", () => {
  test("status and date come from the stored date window", async ({ page }) => {
    // No status column exists in D1; the SPA computes it. An event whose window
    // has passed must read as finished.
    await seedCache(page, [entry(orpc.events.list, undefined, { events: [EVENT] } as never)])
    await page.goto("/")

    const row = page.locator(".event-row", { hasText: "Bangkok Schools Basketball League 2026" })
    await expect(row).toBeVisible()
    await expect(row.locator(".date .day")).toHaveText("15")
    // "Apr", not "APR": the month comes from Intl.DateTimeFormat now, and the
    // uppercase is CSS (`.mo { text-transform: uppercase }`). That is the right
    // place for it — text-transform is a no-op for Thai and Japanese, whereas
    // the hardcoded MONTHS array this replaced was uppercase in every language.
    await expect(row.locator(".date .mo")).toHaveText("Apr")
    await expect(row.locator(".status")).toHaveText("Finished")
  })

  test("an event deep-link renders that event", async ({ page }) => {
    await seedCache(page, [entry(orpc.events.get, { id: "evt_002" }, EVENT)])
    await page.goto("/#/event/evt_002")
    await expect(page.locator(".event-hero")).toContainText("Bangkok Schools Basketball League 2026")
  })

})

/**
 * The sidebar shows the signed-in account, not an invented one.
 *
 * It used to render "Coach Sukasem · Head Coach · SGS", hardcoded, at the bottom
 * of every page — while the topbar showed the real account. A signed-in coach
 * saw two different people on one screen, and nothing marked either as sample.
 */
test.describe("The sidebar identity", () => {
  test("is the signed-in user, and matches the topbar", async ({ page }) => {
    await seedCache(page, [
      {
        queryKey: sessionKey as unknown as readonly unknown[],
        data: {
          user: { id: "u1", email: "wichai.s@assumption.test", name: "Wichai Srisuk", role: "coach" },
          session: { activeOrganizationId: null, impersonatedBy: null },
        },
      },
    ])
    await page.goto("/#/")

    await expect(page.getByTestId("sidebar-user")).toContainText("Wichai Srisuk")
    await expect(page.getByTestId("sidebar-user")).toContainText("coach")
    await expect(page.getByTestId("topbar-user")).toHaveText("Wichai Srisuk")
    // The name nobody is signed in as.
    await expect(page.getByTestId("sidebar-user")).not.toContainText("Sukasem")
  })

  test("renders nothing at all when signed out, rather than a placeholder person", async ({
    page,
  }) => {
    await seedCache(page, [
      { queryKey: sessionKey as unknown as readonly unknown[], data: { user: null, session: null } },
    ])
    await page.goto("/#/")
    await expect(page.getByTestId("sidebar-user")).toHaveCount(0)
  })
})
