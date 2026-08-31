import { test, expect } from "./fixture"
import { seedCache, entry, orpc } from "../helpers/seed-cache"

/**
 * What happens when the app itself breaks.
 *
 * Before the boundary existed, a render error unmounted the tree and left a
 * white rectangle — no message, no way back short of knowing to reload, and no
 * report. So the failure that takes the *whole page* away was the one failure
 * the system could not see, while a 404 on a single endpoint was fully
 * instrumented.
 *
 * ## Why the reference list, of all things
 *
 * Nearly every hook in lib/data.tsx passes a `select`, and TanStack runs that
 * outside the render — so a malformed response becomes a *query error*, which
 * the pages already handle, and never reaches a boundary. That is a good
 * property and worth writing down: the boundary is a backstop for bugs in our
 * own render code, not for bad data.
 *
 * `orpc.reference.list` has no `select`, and both LocaleProvider and discover
 * read it directly. That makes it the one honest way to produce a real
 * render-time throw from outside a component — and, usefully, at two different
 * depths.
 */

/** Everything the provider needs, so a crash below it stays below it. */
const LOCALES = [{ code: "en" }, { code: "th" }, { code: "ja" }]

/**
 * The one cast in tests/ that is not a mistake, and the only one left.
 *
 * Every other `as never` in this suite was hiding a fixture that had drifted
 * from the contract. These two are the opposite: the payload is *deliberately*
 * malformed, because that is the subject — an API response that cannot be
 * rendered, and whether the reader gets a message or a white screen. A fixture
 * that satisfied the contract would test nothing here.
 *
 * `as never` would say only "stop looking". This names what is happening:
 * a value the endpoint could never return, seeded on purpose.
 */
type MalformedResponse = Parameters<typeof entry<undefined, never>>[2]
const malformed = (body: unknown) => body as MalformedResponse

/**
 * `cities` as a string. Discover maps over it, so the throw is *inside*
 * LocaleProvider and the translated boundary catches it.
 */
const brokenPage = () =>
  entry(
    orpc.reference.list,
    undefined,
    malformed({ cities: "not-an-array", eventTypes: [], locales: LOCALES }),
  )

/**
 * No `locales` at all. LocaleProvider itself throws on `locales.map`, which is
 * *above* the translated boundary — the case that still white-screened after
 * the first boundary was added.
 */
const brokenProvider = () =>
  entry(orpc.reference.list, undefined, malformed({ cities: [], eventTypes: [] }))

test.describe("When a page throws", () => {
  test("the reader gets a message and a way back, not a white screen", async ({ page }) => {
    await seedCache(page, [brokenPage()])
    await page.goto("/#/discover")

    const crash = page.getByTestId("crash")
    await expect(crash).toBeVisible()
    // The words matter as much as the element. A reader told nothing goes and
    // checks their wifi, because that is what a blank page means to everyone
    // who has ever seen one.
    await expect(crash).toContainText("This page stopped working")
    await expect(crash.getByRole("button")).toBeVisible()
  })

  test("speaks the reader's language, at the worst possible moment", async ({ page }) => {
    // The inner boundary sits inside LocaleProvider for exactly this. Nesting it
    // outside would have been simpler and would have shown English to everyone
    // precisely when they were least able to cope with it.
    await page.addInitScript(() => localStorage.setItem("remy.locale", "th"))
    await seedCache(page, [brokenPage()])
    await page.goto("/#/discover")

    await expect(page.getByTestId("crash")).toContainText("หน้านี้หยุดทำงาน")
  })

  test("catches a provider that throws, which no inner boundary can", async ({ page }) => {
    // A boundary cannot catch a throw from a component rendered *above* it, so
    // the one inside LocaleProvider could not catch LocaleProvider. That still
    // white-screened until an outer, dependency-free boundary was added — found
    // by this test seeding a reference payload with a field missing.
    await page.addInitScript(() => localStorage.setItem("remy.locale", "th"))
    await seedCache(page, [brokenProvider()])
    await page.goto("/#/discover")

    const crash = page.getByTestId("crash")
    await expect(crash).toBeVisible()
    // English even though the reader chose Thai: the thing that translates is
    // one of the things being caught. A message in one language beats a white
    // rectangle in every language.
    await expect(crash).toContainText("This page stopped working")
  })

  test("reports itself, so a white screen is not the only evidence", async ({ page }) => {
    /**
     * Captured at `navigator.sendBeacon`, not off the network.
     *
     * A beacon sends a Blob, and Playwright exposes neither `postData` nor
     * `postDataBuffer` for one — the first two versions of this test read an
     * empty body and concluded nothing had been sent, while the request was
     * plainly going out. Wrapping the call is also the more honest assertion:
     * what matters is what our code decided to report.
     */
    await page.addInitScript(() => {
      const sent: string[] = []
      ;(window as unknown as { __BEACONS__: string[] }).__BEACONS__ = sent
      const original = navigator.sendBeacon.bind(navigator)
      navigator.sendBeacon = (url: string | URL, body?: BodyInit | null) => {
        if (String(url).includes("/api/analytics") && body instanceof Blob) {
          void body.text().then((t) => sent.push(t))
        }
        return original(url, body)
      }
    })

    await seedCache(page, [brokenPage()])
    await page.goto("/#/discover")
    await expect(page.getByTestId("crash")).toBeVisible()

    const sent = await page
      .waitForFunction(() => {
        const all = (window as unknown as { __BEACONS__: string[] }).__BEACONS__ ?? []
        return all.map((t) => JSON.parse(t)).find((b) => b.event === "client.error") ?? null
      })
      .then((h) => h.jsonValue() as Promise<{ fields: Record<string, string> }>)

    // The route, with no id in it — see tests/unit/report.test.ts.
    expect(sent.fields.route).toBe("/discover")
    // The error's name is what groups the report; without it every crash is
    // indistinguishable from every other crash.
    expect(sent.fields.name).toBe("TypeError")
  })
})
