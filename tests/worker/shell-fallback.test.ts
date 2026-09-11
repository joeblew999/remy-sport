import { SELF } from "cloudflare:test"
import { describe, expect, it } from "vitest"

/**
 * The SPA shell is served for a navigation, and for nothing else.
 *
 * When the asset store has nothing, one of two things is true: a reader has
 * followed a link the SPA routes itself, or something asked for a file that
 * is not there. The first wants the shell; the second wants the 404 it asked
 * for, and giving it HTML instead is worse than useless.
 *
 * **The Accept header is the check that matters.** Apple's crawler fetching
 * the association file, a mail client following a link, and the SPA's own
 * `fetch` for a chunk a deploy renamed all ask for something other than HTML,
 * and none of them should be handed a page. iOS caches the association file;
 * a JSON parse of an HTML document is a confusing error a long way from its
 * cause.
 */

const ORIGIN = "https://remy.test"
const BROWSER = { Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" }

describe("a navigation", () => {
  it("gets the shell for a path the SPA routes itself", async () => {
    const res = await SELF.fetch(`${ORIGIN}/events/abc`, { headers: BROWSER })
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/html")
    expect(await res.text()).toContain('<div id="root">')
  })

  it("is recognised by Sec-Fetch-Dest as well, for a client that sends no Accept", async () => {
    const res = await SELF.fetch(`${ORIGIN}/events/abc`, { headers: { "Sec-Fetch-Dest": "document" } })
    expect(res.status).toBe(200)
  })
})

describe("anything that is not a navigation", () => {
  it("does not get the shell for the association file", async () => {
    // The identifiers are unset everywhere, so nothing is emitted and this
    // must 404. Apple caches what it is given: an HTML page here would be
    // cached as the association file and universal links would fail silently.
    const res = await SELF.fetch(`${ORIGIN}/.well-known/apple-app-site-association`)
    expect(res.status).toBe(404)
    expect(res.headers.get("content-type") ?? "").not.toContain("text/html")
  })

  it("does not get the shell for a missing bundle", async () => {
    // A deploy renames hashed chunks. The SPA asking for one that has gone
    // must see a 404, not a page that fails to parse as JavaScript.
    const res = await SELF.fetch(`${ORIGIN}/assets/missing.js`, { headers: BROWSER })
    expect(res.status).toBe(404)
    expect(await res.text()).not.toContain('<div id="root">')
  })

  it("does not get the shell for a fetch that wants JSON", async () => {
    const res = await SELF.fetch(`${ORIGIN}/events/abc`, { headers: { Accept: "application/json" } })
    expect(res.status).toBe(404)
  })

  it("does not get the shell for a POST", async () => {
    const res = await SELF.fetch(`${ORIGIN}/events/abc`, { method: "POST", headers: BROWSER })
    expect(res.status).not.toBe(200)
  })
})
