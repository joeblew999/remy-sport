import { test } from "@playwright/test"
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { LOCALES } from "../../src/domain/vocabularies"
import { stateFor, actor, ACTORS, ADMIN, COACH } from "../helpers/auth"

/**
 * Screenshots of every screen, in every released language, into `screenshots/`
 * — `bun run shots`, with Playwright's own `-g` to take one slice of it.
 *
 * Not a test — nothing here asserts anything, and it must never fail a build.
 * It exists because a green suite says a page *works*, not that it *looks*
 * right, and the two came apart twice while building the org GUI: a heading
 * butted onto a table and read as a column header, and the sidebar stayed in
 * English after switching to Thai. Both were invisible to 165 passing tests and
 * obvious in a picture.
 *
 * Beside every picture, the same screen as text: the sidebar entries this
 * person is offered and everything the page says. A picture is for a person;
 * the text is for an agent asked whether the GUI makes sense, which is a
 * question about what each seeded person is shown — and it went unanswered for
 * a session because this file had lost its task and nothing else could look.
 *
 * Deliberately not a `.spec.ts`. Playwright's default `testMatch` only collects
 * `*.spec.ts` / `*.test.ts`, so the e2e project does not see this file at all
 * and needs no `testIgnore` entry to keep ignoring it. The `shots` project in
 * playwright.config.ts names it explicitly.
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
  { name: "schedule", path: "/#/event/evt_002", as: "adisorn.b@bat.test", open: "games" },
  // The organiser's view of the same tab: the fixture form and the referee
  // picker a referee never sees.
  { name: "schedule-organiser", path: "/#/event/evt_002", as: actor("ORGANIZER", 1), open: "games" },
  { name: "standings", path: "/#/event/evt_001", as: null, open: "standings" },
  // A coach with a team still to enter: the entry form is the half a spectator
  // never sees.
  { name: "entries", path: "/#/event/evt_004", as: COACH, open: "teams" },
  // The coach's own team page, where the squad is editable.
  { name: "roster", path: "/#/team/team_001", as: COACH },
  // `live` has its own sidebar entry and was in neither this list nor any test.
  // A screen nobody photographs is a screen nobody looks at. (The bracket tab
  // that used to sit beside it was deleted with the invented data behind it.)
  { name: "live", path: "/#/live", as: null },
  { name: "admin", path: "/#/admin", as: ADMIN },
  { name: "devices", path: "/#/devices", as: COACH },
  { name: "login", path: "/#/login", as: null },
]

/**
 * Every seeded role on the screens that say *yours*, which are the ones this
 * app has been wrong about most. The same URL six times over is the point:
 * what a coach, a parent and a referee are each shown on "My team" is the
 * product, and no single screenshot of it can be right for all of them.
 */
const YOURS = [
  { name: "home", path: "/#/" },
  { name: "profile", path: "/#/profile" },
]
for (const [role, email] of Object.entries(ACTORS)) {
  for (const s of YOURS) SCREENS.push({ name: `${s.name}-${role.toLowerCase()}`, path: s.path, as: email })
}

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

// A screen that was deleted must not leave a stale picture behind to be read
// as current — but a slice (`-g`) must not throw away the rest of the last
// full walk either, which is the set a person was reading when they asked for
// one more angle. So: remove only what SCREENS no longer describes, and let
// every run overwrite its own pictures. (Wiping the directory on a full run
// only was the first answer, and a worker cannot see the CLI's grep to tell.)
test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true })
  const expected = new Set<string>()
  for (const s of SCREENS)
    for (const l of LOCALES)
      for (const vp of VIEWPORTS)
        for (const ext of ["png", "txt"]) expected.add(`${vp.name}/${s.name}.${l}.${ext}`)
  for (const vp of VIEWPORTS) {
    const dir = `${OUT}/${vp.name}`
    if (!existsSync(dir)) continue
    for (const f of readdirSync(dir)) {
      if (!expected.has(`${vp.name}/${f}`)) rmSync(`${dir}/${f}`, { force: true })
    }
  }
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
        // The app scrolls inside its fixed-height shell. WebKit's fullPage
        // capture adds thousands of blank pixels below that clipped shell;
        // capture the actual viewport. The text companion includes all rows.
        fullPage: false,
      })
      // The same screen as text, for a reader without eyes: what the sidebar
      // offers this person, then everything the page says.
      const text = await page.evaluate(() => {
        const nav = [...document.querySelectorAll("aside .nav-item")]
          .map((n) => (n as HTMLElement).innerText.trim())
          .join(" | ")
        const main = (document.querySelector("main") ?? document.body) as HTMLElement
        return `nav: ${nav}\n\n${main.innerText.replace(/\n{3,}/g, "\n\n").trim()}\n`
      })
      writeFileSync(`${OUT}/${vp.name}/${screen.name}.${locale}.txt`, text)
      await ctx.close()
    })
   }
  }
}
