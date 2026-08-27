import { test } from "@playwright/test"
import { mkdirSync, rmSync } from "node:fs"
import { LOCALES } from "../../src/domain/vocabularies"
import { stateFor, actor, ADMIN, COACH } from "../helpers/auth"

/**
 * Screenshots of every screen, in every released language, into `screenshots/`.
 *
 * Not a test — nothing here asserts anything, and it must never fail a build.
 * It exists because a green suite says a page *works*, not that it *looks*
 * right, and the two came apart twice while building the org GUI: a heading
 * butted onto a table and read as a column header, and the sidebar stayed in
 * English after switching to Thai. Both were invisible to 165 passing tests and
 * obvious in a picture.
 *
 * Deliberately not a `.spec.ts`. Playwright's default `testMatch` only collects
 * `*.spec.ts` / `*.test.ts`, so `mise run test` does not see this file at all
 * and needs no `testIgnore` entry to keep ignoring it. `mise run shots` points
 * playwright.shots.config.ts at it explicitly.
 *
 * It reuses the E2E tier's whole apparatus — the seeded database, the signed-in
 * states from auth.setup.ts, the wrangler dev server — because "what does a
 * coach see" is a question that needs a real session against real data.
 */

const OUT = "screenshots"

/**
 * The screens worth looking at, and who is looking.
 *
 * `as: null` is a signed-out visitor, which is a distinct rendering and not the
 * same as "any signed-in user" — it is what a stranger sees. Add a line here to
 * add a screen; nothing else needs changing.
 *
 * `open` is a tab's id, not its label. Labels are translated, so naming one by
 * text photographed the English page and timed out on the Thai one — which is
 * the localisation working, caught by the screenshots.
 */
const SCREENS: { name: string; path: string; as: string | null; open?: string }[] = [
  { name: "discover", path: "/#/", as: null },
  { name: "orgs", path: "/#/orgs", as: COACH },
  { name: "org", path: "/#/org/org_001", as: COACH },
  // The same URL as the line above, and the point of the pair: this coach
  // belongs to another school, so the roster must render as refused.
  { name: "org-not-yours", path: "/#/org/org_001", as: actor("COACH", 2) },
  // The schedule, seen by the referee who may score one of its games.
  { name: "schedule", path: "/#/event/evt_002", as: "adisorn.b@bat.test", open: "schedule" },
  // The organiser's view of the same tab: the fixture form and the referee
  // picker a referee never sees.
  { name: "schedule-organiser", path: "/#/event/evt_002", as: actor("ORGANIZER", 1), open: "schedule" },
  { name: "standings", path: "/#/event/evt_001", as: null, open: "standings" },
  // A coach with a team still to enter: the entry form is the half a spectator
  // never sees.
  { name: "entries", path: "/#/event/evt_004", as: COACH, open: "teams" },
  // The coach's own team page, where the squad is editable.
  { name: "roster", path: "/#/team/team_001", as: COACH },
  { name: "admin", path: "/#/admin", as: ADMIN },
  { name: "devices", path: "/#/devices", as: COACH },
  { name: "profile", path: "/#/profile", as: COACH },
  { name: "login", path: "/#/login", as: null },
]

/**
 * Desktop and phone, because the two disagree and only one was ever looked at.
 *
 * Every `.admin-table` — events, accounts, org members, roster, entries — was
 * four columns of desktop layout squeezed into 390px, rendering "Chiang Mai
 * Summer Basketball Camp 2026" one word per line down a 150px column. Nothing
 * overflowed the page, so no automated check could have objected; the whole
 * suite passed and the screen was unusable. It was found by looking, which is
 * what this file is for, and it could not be found here because this file only
 * ever photographed 1280px.
 *
 * `isMobile` and `hasTouch` as well as the width: they change what the page
 * gets — `@media (pointer: coarse)` bumps tap targets, and a viewport-only
 * shrink would photograph a desktop pointer on a phone-sized screen.
 */
const VIEWPORTS = [
  { name: "desktop", viewport: { width: 1280, height: 900 } },
  { name: "mobile", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
] as const

// One clean directory per run, so a screen that was deleted does not leave a
// stale picture behind to be read as current.
test.beforeAll(() => {
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })
})

for (const screen of SCREENS) {
  for (const locale of LOCALES) {
   for (const vp of VIEWPORTS) {
    test(`${screen.name} · ${locale} · ${vp.name}`, async ({ browser }) => {
      const ctx = await browser.newContext({
        ...(screen.as ? { storageState: stateFor(screen.as) } : {}),
        viewport: vp.viewport,
        ...("isMobile" in vp ? { isMobile: vp.isMobile, hasTouch: vp.hasTouch } : {}),
      })
      // Set before the bundle runs. Clicking the switcher would work too, but
      // it screenshots a page that rendered once in the wrong language first,
      // and any animation mid-transition lands in the picture.
      await ctx.addInitScript((l) => localStorage.setItem("remy.locale", l), locale)

      const page = await ctx.newPage()
      await page.goto(screen.path)
      if (screen.open) await page.getByTestId(`tab-${screen.open}`).click()
      // The data arrives over the network, so there is a real moment where the
      // page says "Loading…". Waiting for the network to settle is what stops
      // that being what gets captured.
      await page.waitForLoadState("networkidle")
      await page.screenshot({
        path: `${OUT}/${vp.name}/${screen.name}.${locale}.png`,
        fullPage: true,
      })
      await ctx.close()
    })
   }
  }
}
