import { SELF } from "cloudflare:test"
import { describe, expect, it } from "vitest"
import { AASA_PATH, FIXTURE_APP_ID } from "./assets-fixture"

/**
 * The association file is served the way Apple requires it.
 *
 * It stopped being a Worker route on 2026-09-11 and became a client-build
 * artefact. The move was very nearly a silent regression: the path carries no
 * extension, by Apple's own requirement, so the asset store infers nothing and
 * served it with NO Content-Type where the Worker had set application/json.
 * iOS caches the file aggressively, so that would have been cached wrong and
 * shown up as "universal links do not work" months later.
 *
 * A `_headers` file beside it states the type. This is the only place that
 * contract is checked end to end — one half is emitted by Vite, the other
 * honoured by the asset store, and no repo-tier rule can see across that.
 *
 * The fixture sits at a neighbouring path rather than the real one, because
 * tests/worker/read.test.ts asserts the real path 404s while the identifiers
 * are unset — which it does, everywhere, today. Both cannot be true of one
 * path in one tier. What is under test is the shape, not the filename.
 */

describe("an extensionless association file", () => {
  it("is served as application/json despite carrying no extension", async () => {
    const res = await SELF.fetch(`https://remy.test${AASA_PATH}`)
    expect(res.status).toBe(200)
    // The assertion. A 200 of the wrong type is exactly what iOS would cache.
    // Checked for presence first: without `_headers` the header is absent
    // entirely, and "expected null to contain" reads like a broken test rather
    // than the regression it is.
    const type = res.headers.get("content-type")
    expect(type, "no Content-Type at all — is the _headers file being emitted?").not.toBeNull()
    expect(type).toContain("application/json")
  })

  it("is never a redirect — Apple's crawler follows none", async () => {
    const res = await SELF.fetch(`https://remy.test${AASA_PATH}`, { redirect: "manual" })
    expect(res.status).toBe(200)
  })

  it("names the app it claims links for", async () => {
    const body = (await (await SELF.fetch(`https://remy.test${AASA_PATH}`)).json()) as {
      applinks?: { details?: { appIDs?: string[] }[] }
    }
    expect(body.applinks?.details?.[0]?.appIDs).toContain(FIXTURE_APP_ID)
  })
})
