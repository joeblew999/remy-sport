import { describe, expect, it } from "vitest"
import { api } from "./helpers"

/**
 * The Worker serving the SPA — the only tests that go through ASSETS.
 *
 * Split out of read.test.ts so the rest of the worker tier can run beside
 * everything else.
 *
 * `check` used to run thirteen worker files alone, after its parallel group, for
 * 13.4s of the gate's ~37s. The reason was real: these assertions reach the SPA
 * through Miniflare's local ASSETS server, which answers 404 when the box is
 * busy. It is not one conflicting task — paired with any single check they pass,
 * and they fail against the whole group. Cumulative load, nothing else.
 *
 * The failure is local infrastructure and not product behaviour. On Cloudflare,
 * ASSETS is a platform service and cannot be starved by a laptop compiling
 * TypeScript. So the tests stay honest and the schedule works around them —
 * masking it with a retry would hide a real 404 the day one appears.
 *
 * What changed is the size of what has to stand aside: three tests in one file
 * rather than 249 in thirteen. The gate pays one file's workerd startup instead
 * of the whole tier's.
 *
 * **Anything asserting a 2xx from a non-/api path belongs here**, not in
 * read.test.ts. A 404 assertion does not: a starved ASSETS returns 404 too, so
 * those cannot fail this way and stay with the routing rules they belong to.
 */

describe("The Worker serves the SPA shell", () => {
  it("returns the document at /", async () => {
    const res = await api("/")
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('<div id="root">')
    expect(body).toContain("TWEAK_DEFAULTS")
  })

  it("serves the hashed JS bundle with the right content type", async () => {
    const shell = await (await api("/")).text()
    const src = shell.match(/src="\.\/(assets\/[^"]+\.js)"/)?.[1]
    expect(src, "the shell should reference a hashed JS bundle").toBeTruthy()

    const res = await api(`/${src}`)
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("javascript")
  })
})
