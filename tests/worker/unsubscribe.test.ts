import { SELF, env } from "cloudflare:test"
import { describe, expect, it } from "vitest"
import { unsubscribeToken } from "../../src/api/unsubscribe"
import { actorFor } from "./helpers"
import { SEED_ENTITIES } from "../../src/domain/model/entities"

/**
 * One URL, two methods, two very different meanings.
 *
 * The gate for the move off Hono is the POST: a mail client sends
 * `List-Unsubscribe=One-Click` as `application/x-www-form-urlencoded`, and
 * oRPC's OpenAPI handler has to parse that into the procedure's input. Nothing
 * else in this repo posts a form, so nothing else would have found it — and
 * the failure mode is Gmail deciding our unsubscribe does not work, which is a
 * deliverability problem long before anyone notices a 400.
 *
 * The GET half is the one that is expensive to get backwards: scanners,
 * previewers and corporate gateways follow GET links in mail they inspect, so
 * a GET that acted would silently unsubscribe people who never clicked.
 */

const ORIGIN = "https://remy.test"
// A real code from the model's NOTIFICATION_TYPE vocabulary. The preference
// row carries a foreign key to it, so an invented one fails the insert — as it
// did in the Hono route too, and as it should: only our own signer mints these.
const TYPE = "EVENT_REMINDER"

const userId = () => SEED_ENTITIES.users.find((u) => u.email === actorFor("COACH"))!.id

const linkFor = async () =>
  `${ORIGIN}/api/unsubscribe?t=${await unsubscribeToken(env as never, { userId: userId(), typeCode: TYPE })}`

describe("POST /api/unsubscribe — the RFC 8058 path", () => {
  it("accepts the exact body a mail client sends", async () => {
    const res = await SELF.fetch(await linkFor(), {
      method: "POST",
      // Verbatim from RFC 8058: the header a bulk message carries is
      // `List-Unsubscribe-Post: List-Unsubscribe=One-Click`, and the client
      // posts that as the body.
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "List-Unsubscribe=One-Click",
    })
    expect(res.status).toBe(200)
    expect(await res.text()).toContain("Unsubscribed")
  })

  it("accepts an empty body too, because not every client sends the marker", async () => {
    const res = await SELF.fetch(await linkFor(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "",
    })
    expect(res.status).toBe(200)
  })

  it("refuses a token that was not signed by us", async () => {
    const res = await SELF.fetch(`${ORIGIN}/api/unsubscribe?t=forged.forged`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "List-Unsubscribe=One-Click",
    })
    // 400, not a rendered page: a refusal that answered 200 would read, to
    // anything inspecting the response, like the unsubscribe had worked.
    expect(res.status).toBe(400)
    expect(await res.text()).toContain("not valid")
  })
})

describe("GET /api/unsubscribe — the page", () => {
  it("renders a form and changes nothing", async () => {
    const link = await linkFor()
    const res = await SELF.fetch(link)
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/html")

    const body = await res.text()
    expect(body).toContain("Stop these emails?")
    // The whole point: a scanner following this link must leave preferences as
    // it found them, so the page carries a form rather than having acted.
    expect(body).toContain('method="post"')
  })

  it("says so plainly when the token is not ours", async () => {
    const res = await SELF.fetch(`${ORIGIN}/api/unsubscribe?t=forged.forged`)
    expect(res.status).toBe(400)
    expect(await res.text()).toContain("not valid")
  })
})
