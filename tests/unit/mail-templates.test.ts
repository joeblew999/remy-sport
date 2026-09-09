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
