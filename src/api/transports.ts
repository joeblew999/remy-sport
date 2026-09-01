/**
 * How a notification actually reaches somebody, per channel.
 *
 * The schema has been multi-channel since it was written — `notification_channel`
 * is a vocabulary with five rows, `userNotificationChannel.channelCode` is a
 * foreign key to it, and `userNotificationPreference` is keyed by
 * (user, type, channel), which is exactly the shape a per-channel default
 * needs. Only the *code* pinned PUSH, in ten places.
 *
 * A transport takes rendered content and a list of addresses and reports what
 * happened. Adding a third is a map entry.
 *
 * ## Rendering is per channel, not one shape bent into two
 *
 * A `PushBody` is a title, a short body and a URL, and it collapses by tag. An
 * email has a subject, a body that can run longer, and no notion of collapsing
 * at all — a second email does not replace the first.
 *
 * So `notify` takes a *renderer per channel* rather than one renderer returning
 * a per-channel shape. Two reasons, and the second is the important one:
 *
 *   - Adding a channel is adding a key, which matches the map below.
 *   - **A caller that has not written copy for a channel does not send on it.**
 *     Push copy in an email body is the failure this design is most likely to
 *     produce by accident, and the type makes it impossible rather than
 *     discouraged: there is no fallback to fall back to.
 *
 * The cost is that a channel silently reaches nobody until somebody writes its
 * copy. That is the right direction to fail, and `notify.batch` telemetry shows
 * a channel with an audience and no sends.
 */

import { deliverPush, type PushTarget } from "./push-send"
import { mailerFor } from "../mail/mailer"
import { unsubscribeHeaders, unsubscribeUrl } from "./unsubscribe"
import type { Bindings } from "../types"
import type { Db } from "./base"

/** One person reachable on one channel, before the transport interprets it. */
export type Recipient = {
  userId: string
  address: string
  secret: string | null
  localeCode: string | null
}

/** What a transport is asked to deliver. Rendered, per locale, by the caller. */
export type Rendered =
  | { channel: "PUSH"; title: string; body: string; url: string; tag: string }
  | {
      channel: "EMAIL"
      subject: string
      text: string
      html?: string
      /**
       * The sentence above the unsubscribe link, in the reader's language.
       *
       * Rendered by the caller rather than written here, because it is copy and
       * copy is translated — an English "Stop these emails" under a Thai
       * notification is the same bug as an English month name in a Thai date.
       */
      unsubscribeLabel: string
    }

/** What became of a batch on one channel. */
export type Delivered = { sent: number; gone: number; failed: number }

export interface Transport {
  /**
   * `content` is keyed by locale code, because a transport delivers to an
   * audience that does not share a language and rendering per person would be
   * the same three strings a hundred times.
   */
  send(
    db: Db,
    env: Bindings,
    recipients: Recipient[],
    content: Map<string, Rendered>,
    fallback: Rendered,
    /** Which notification type — an unsubscribe token is scoped to one. */
    typeCode: string,
  ): Promise<Delivered>
}

const push: Transport = {
  async send(db, env, recipients, content, fallback) {
    const targets: PushTarget[] = []
    for (const r of recipients) {
      const rendered = content.get(r.localeCode ?? "") ?? fallback
      if (rendered.channel !== "PUSH") continue
      targets.push({
        address: r.address,
        secret: r.secret,
        body: { title: rendered.title, body: rendered.body, url: rendered.url, tag: rendered.tag },
      })
    }
    return deliverPush(db, env, targets)
  },
}

/**
 * Email, through the mailer this app already had.
 *
 * `mailerFor` picks the Cloudflare transport or the outbox by `MAIL_TRANSPORT`,
 * which is what makes this provable end to end on the dev tunnel: an
 * EMAIL-enabled preference produces a captured message with a real subject, and
 * `mise run cf:smoke` already checks that capture works.
 *
 * There is no `gone` here. A push service tells us an endpoint is permanently
 * dead and we delete the row; an SMTP bounce arrives asynchronously, to a
 * mailbox nobody reads, and inferring "this address is dead" from a send that
 * did not throw would be guessing. Unsubscribing an address on a guess is worse
 * than leaving it, so every failure counts as `failed` and the row stays.
 */
const email: Transport = {
  async send(_db, env, recipients, content, fallback, typeCode) {
    const mailer = mailerFor(env)
    let sent = 0
    let failed = 0
    await Promise.all(
      recipients.map(async (r) => {
        const rendered = content.get(r.localeCode ?? "") ?? fallback
        if (rendered.channel !== "EMAIL") {
          failed += 1
          return
        }
        try {
          /**
           * Per recipient, because the token is per recipient.
           *
           * The header and the body link both authorise exactly this person's
           * preference for exactly this notification type, so neither can be
           * shared across an audience — one leaked link would otherwise
           * unsubscribe everybody.
           */
          const claim = { userId: r.userId, typeCode }
          const headers = await unsubscribeHeaders(env, claim)
          const link = await unsubscribeUrl(env, claim)
          await mailer.send({
            to: r.address,
            subject: rendered.subject,
            // A visible link as well as the header. Somebody already annoyed
            // enough to want out will not go hunting in their mail client's
            // menus — and the alternative to finding the door is pressing
            // "spam", which costs the sending domain far more.
            text: `${rendered.text}\n\n${rendered.unsubscribeLabel}\n${link}`,
            ...(rendered.html ? { html: rendered.html } : {}),
            kind: "bulk",
            headers,
          })
          sent += 1
        } catch {
          // A mailer that throws is a failure, not a dead address — see above.
          failed += 1
        }
      }),
    )
    return { sent, gone: 0, failed }
  },
}

/**
 * Every channel this Worker can actually deliver on.
 *
 * The vocabulary defines five — LINE, EMAIL, SMS, PUSH, IN_APP. Three have no
 * transport, so a recipient reachable only on those is counted and not sent to,
 * which `notify.batch` makes visible rather than silent. That is the honest
 * state: the Product Owner has described channels the platform does not have
 * yet, and pretending otherwise would be a dispatch table that lies.
 */
export const TRANSPORTS: Record<string, Transport> = { PUSH: push, EMAIL: email }
