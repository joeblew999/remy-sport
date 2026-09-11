import { describe, expect, it } from "vitest"
import { TEMPLATES } from "../../src/mail/templates"
import { api } from "./helpers"

/**
 * The outbox, the OTP reset and the template preview, as procedures.
 *
 * The preview is the one worth asserting hardest: it answers raw HTML with its
 * own Content-Type, not JSON-wrapped HTML, because a person opens it in a
 * browser to read the copy. oRPC carries that through a `File` output, and a
 * regression to JSON would still be a 200 — so the content type is the
 * assertion, not the status.
 */

describe("GET /api/dev/outbox", () => {
  it("answers the captured messages, and DELETE empties it", async () => {
    const listed = await api("/api/dev/outbox")
    expect(listed.status).toBe(200)
    expect((await listed.json()) as { messages: unknown[] }).toHaveProperty("messages")

    const cleared = await api("/api/dev/outbox", { method: "DELETE" })
    expect(cleared.status).toBe(200)
    expect(await cleared.json()).toEqual({ cleared: true })

    const after = (await (await api("/api/dev/outbox")).json()) as { messages: unknown[] }
    expect(after.messages).toEqual([])
  })
})

describe("DELETE /api/dev/otp", () => {
  it("requires a recipient rather than silently clearing everything", async () => {
    const res = await api("/api/dev/otp", { method: "DELETE" })
    expect(res.status).toBe(400)
  })

  it("answers the identifiers it removed", async () => {
    const res = await api("/api/dev/otp?to=nobody@remy.test", { method: "DELETE" })
    expect(res.status).toBe(200)
    expect((await res.json()) as { cleared: string[] }).toEqual({ cleared: [] })
  })
})

describe("GET /api/dev/email/{name}", () => {
  it("renders a template as raw HTML, not as JSON", async () => {
    const res = await api("/api/dev/email/otp")
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/html")
    const body = await res.text()
    expect(body).toContain("424242")
    expect(body.trimStart().startsWith("{"), "an HTML preview must not be JSON-wrapped").toBe(false)
  })

  it("serves the text part as text/plain when asked", async () => {
    const res = await api("/api/dev/email/otp?part=text")
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/plain")
    expect(await res.text()).toContain("424242")
  })

  /**
   * Every preview, not just the one. A registry entry can be present and still
   * throw — a fixture index that does not exist, a message key that was
   * renamed — and the repo rule next door only proves the entry is *there*.
   */
  it("renders every template the registry offers", async () => {
    for (const name of TEMPLATES) {
      const res = await api(`/api/dev/email/${name}`)
      expect(res.status, `${name} should render`).toBe(200)
      expect((await res.text()).length, `${name} rendered empty`).toBeGreaterThan(0)
    }
  })

  it("refuses a template that does not exist, naming the ones that do", async () => {
    const res = await api("/api/dev/email/not-a-template")
    expect(res.status).toBe(400)
    expect(JSON.stringify(await res.json())).toContain("reminder")
  })
})
