import { describe, expect, it } from "vitest"
import { LOCALES } from "../../src/domain/vocabularies"
import { m } from "../../src/paraglide/messages.js"
import { DOCTYPE } from "../../src/mail/templates/frame"
import { otpMail } from "../../src/mail/templates/otp"
import { inviteMail } from "../../src/mail/templates/invite"
import { gameMail } from "../../src/mail/templates/game"
import { reminderMail } from "../../src/mail/templates/reminder"

/**
 * Every template, in every released locale: the text part is the message,
 * the HTML part is the same message laid out, and what has to be a link is one.
 */
const unsubscribe = { label: "Stop receiving these emails:", url: "https://example.test/api/unsubscribe?t=abc" }

describe.each(LOCALES)("mail templates in %s", (locale) => {
  it("the sign-in code: the code is the headline, the text is the message, no link anywhere", () => {
    const purpose = m.email_otp_purpose_sign_in({}, { locale })
    const mail = otpMail({ otp: "424242", purpose }, locale)
    expect(mail.subject).toBe(m.email_otp_subject({ otp: "424242" }, { locale }))
    expect(mail.text).toBe(m.email_otp_body({ otp: "424242", purpose }, { locale }))
    expect(mail.html.startsWith(DOCTYPE)).toBe(true)
    expect(mail.html).toContain(`lang="${locale}"`)
    expect(mail.html).toContain("<h1")
    expect(mail.html).toContain("424242")
    expect(mail.html).not.toContain("<a ")
  })

  it("the invitation: the accept URL is a link", () => {
    const url = "https://example.test/#/accept-invitation/inv_1"
    const mail = inviteMail({ invitedBy: "Somchai", org: "Assumption", url }, locale)
    expect(mail.text).toContain(url)
    expect(mail.html).toContain(`href="${url}"`)
  })

  it("a game: subject as headline, the game URL a link, the way out only when there is one", () => {
    const url = "https://example.test/#/game/gam_002"
    const mail = gameMail({ kind: "end", home: "A", away: "B", event: "League", url, homeScore: "61", awayScore: "58" }, locale)
    expect(mail.subject).toBe(m.email_game_end_subject({ home: "A", away: "B", homeScore: "61", awayScore: "58" }, { locale }))
    const withOut = mail.html(unsubscribe)
    expect(withOut).toContain(`href="${url}"`)
    expect(withOut).toContain(`href="${unsubscribe.url}"`)
    expect(withOut).toContain(unsubscribe.label)
    const without = mail.html(null)
    expect(without).not.toContain(unsubscribe.url)
    for (const kind of ["start", "score"] as const) {
      expect(gameMail({ kind, home: "A", away: "B", event: "League", url, homeScore: "0", awayScore: "0" }, locale).subject).toBeTruthy()
    }
  })

  it("a reminder: the event URL a link, the way out in the reader's language", () => {
    const url = "https://example.test/#/event/evt_001"
    const mail = reminderMail({ event: "League", url }, locale)
    expect(mail.text).toBe(m.email_reminder_text({ event: "League", url }, { locale }))
    expect(mail.html(unsubscribe)).toContain(`href="${url}"`)
    expect(mail.html(unsubscribe)).toContain(unsubscribe.label)
  })
})

/**
 * A refused email says who it was for and why.
 *
 * Better Auth sends the sign-in code through `runInBackgroundOrAwait` and logs
 * a failure as "Failed to run background task:" followed by a stack and nothing
 * else. Read from staging's Workers Logs on 2026-09-10: ten frames of minified
 * line numbers, no message, no address, no reason — no way to tell an
 * unverified destination from an expired binding.
 *
 * On staging that is noise, because the suite signs in as addresses no mail
 * server will accept. In production it is a reader who never got their code,
 * and it would look identical. So the mailer attaches the reason where the send
 * happens, before anything upstream can swallow it.
 */
describe("a refused send", () => {
  it("names the sender, the recipient, the kind and the reason", async () => {
    const { mailerFor } = await import("../../src/mail/mailer")
    const env = {
      MAIL_TRANSPORT: "cloudflare",
      EMAIL_FROM: "noreply@staging.example.test",
      EMAIL: { send: async () => { throw new Error("destination address not verified") } },
    } as never

    const failure = await mailerFor(env)
      .send({ kind: "transactional", to: "somebody@example.test", subject: "Your code", text: "123456" } as never)
      .then(() => null, (e: Error) => e)

    expect(failure, "a refused send must reject").toBeInstanceOf(Error)
    // Each part earns its place: the sender identifies the domain whose
    // reputation is involved, the recipient separates a test fixture from a
    // real person, and the reason is the whole point.
    expect(failure!.message).toContain("noreply@staging.example.test")
    expect(failure!.message).toContain("somebody@example.test")
    expect(failure!.message).toContain("transactional")
    expect(failure!.message).toContain("destination address not verified")
    // The original survives, so a stack is still reachable.
    expect(failure!.cause).toBeInstanceOf(Error)
  })
})

/**
 * Every email leaves a row, including the ones that work.
 *
 * Found by the Product Owner on 2026-09-10: email had been working for them for
 * weeks and was, from the telemetry, indistinguishable from completely broken.
 * Bulk notifications were counted by `notify.batch`; everything transactional —
 * the sign-in code, an invitation — went through the mailer directly and left
 * no trace, so the only evidence one had existed was a failure.
 *
 * A channel you can only see when it breaks is not observable.
 */
describe("every send is counted", () => {
  const recorded: { event: string; fields: Record<string, unknown> }[] = []
  const envWith = (send: () => Promise<void>) =>
    ({
      MAIL_TRANSPORT: "cloudflare",
      EMAIL_FROM: "noreply@example.test",
      EMAIL: { send },
      // The writer the Worker uses; capturing it here is what makes the
      // assertion about telemetry rather than about a mock mailer.
      ANALYTICS: { writeDataPoint: (p: { blobs?: string[]; doubles?: number[] }) => recorded.push({ event: String(p.blobs?.[0]), fields: p as never }) },
      ENVIRONMENT: "test",
    }) as never

  it("records a success, not only a failure", async () => {
    recorded.length = 0
    const { mailerFor } = await import("../../src/mail/mailer")
    await mailerFor(envWith(async () => {})).send({ kind: "transactional", to: "a@example.test", subject: "s", text: "t" } as never)
    expect(recorded.map((r) => r.event), "a working send must be visible").toContain("mail.sent")
  })

  it("records a refusal and still throws it", async () => {
    recorded.length = 0
    const { mailerFor } = await import("../../src/mail/mailer")
    const failed = await mailerFor(envWith(async () => { throw new Error("nope") }))
      .send({ kind: "bulk", to: "a@example.test", subject: "s", text: "t" } as never)
      .then(() => null, (e: Error) => e)
    expect(failed, "recording must not swallow the failure").toBeInstanceOf(Error)
    expect(recorded.map((r) => r.event)).toContain("mail.sent")
  })
})
