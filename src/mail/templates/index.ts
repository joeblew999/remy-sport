/**
 * The mail templates that can be previewed, as one plain record.
 *
 * Deliberately dumb: a name to a render function, and nothing else. No base
 * class, no per-template metadata beyond what a preview needs. The
 * notifications unification replaces game, meeting and reminder with one
 * generic template, and that must be a deletion from this record rather than a
 * refactor of a framework — `otp` and `invite` are the two that stay.
 *
 * `/api/dev/email/{name}` derives its accepted names from these keys, so the
 * list a caller may ask for and the list that can actually be rendered are the
 * same thing.
 *
 * Completeness the other way — every template having an entry — is not something
 * the type system can state, so `tests/repo/mail-templates.test.ts` asserts it.
 * It had to: `meeting.tsx` shipped with no preview and nobody noticed until the
 * registry was written.
 */

import { SEED_ENTITIES, SEED_RELATIONSHIPS } from "../../domain/model/entities"
import { pick, type Names } from "../../domain/names"
import type { ReleasedLocale } from "../../domain/vocabularies"
import { m } from "../../paraglide/messages.js"
import { gameMail } from "./game"
import { inviteMail } from "./invite"
import { meetingMail } from "./meeting"
import { otpMail } from "./otp"
import { reminderMail } from "./reminder"
import type { Bulk, Composed } from "./render"

/**
 * What a preview needs to render: the locale, and where links should point.
 */
export interface PreviewContext {
  locale: ReleasedLocale
  origin: string
}

/**
 * The previewable templates, as one record.
 *
 * The enum below is derived from its keys, so the list a caller may ask for
 * and the list this can render are the same thing by construction — adding a
 * template here adds it to the API, and removing one fails `tsc` rather than
 * leaving a name that 400s.
 *
 * It is not derived from src/mail/templates/ because there is no registry
 * there to derive from — the templates are separate modules with no index. The
 * cost of that is already visible: `meeting.tsx` is a real template with no
 * preview, and nothing noticed. A registry in the mail layer would make this
 * automatic, and is worth doing when something else needs one.
 */
export const PREVIEWS = {
  otp: ({ locale }: PreviewContext) =>
    otpMail({ otp: "424242", purpose: m.email_otp_purpose_sign_in({}, { locale }) }, locale),
  invite: ({ locale, origin }: PreviewContext) =>
    inviteMail(
      {
        invitedBy:
          SEED_RELATIONSHIPS.userNotificationChannels.find((ch) => ch.channelCode === "EMAIL")?.address ?? "",
        org: pick(SEED_ENTITIES.orgs[0]?.names as Names, locale),
        url: `${origin}/#/accept-invitation/preview`,
      },
      locale,
    ),
  "game-start": (ctx: PreviewContext) => bulkOf(gamePreview("start", ctx), ctx),
  "game-end": (ctx: PreviewContext) => bulkOf(gamePreview("end", ctx), ctx),
  score: (ctx: PreviewContext) => bulkOf(gamePreview("score", ctx), ctx),
  meeting: (ctx: PreviewContext) =>
    bulkOf(
      meetingMail(
        {
          // Their name, not their address — the template says so.
          from: SEED_ENTITIES.users[0]?.names.en ?? "",
          title: pick(SEED_ENTITIES.events[0]?.names as Names, ctx.locale),
          url: `${ctx.origin}/#/meetings`,
        },
        ctx.locale,
      ),
      ctx,
    ),
  reminder: (ctx: PreviewContext) =>
    bulkOf(
      reminderMail(
        {
          event: pick(SEED_ENTITIES.events[0]?.names as Names, ctx.locale),
          url: `${ctx.origin}/#/event/${SEED_ENTITIES.events[0]?.id ?? ""}`,
        },
        ctx.locale,
      ),
      ctx,
    ),
} satisfies Record<string, (ctx: PreviewContext) => Composed>

export const TEMPLATES = Object.keys(PREVIEWS) as [keyof typeof PREVIEWS, ...(keyof typeof PREVIEWS)[]]

/** A bulk template's HTML needs the unsubscribe pair a real send would carry. */
function bulkOf(b: Bulk, { locale, origin }: PreviewContext) {
  return {
    subject: b.subject,
    text: b.text,
    html: b.html({
      label: m.email_unsubscribe({}, { locale }),
      url: `${origin}/api/unsubscribe?t=preview`,
    }),
  }
}

function gamePreview(kind: "start" | "end" | "score", { locale, origin }: PreviewContext): Bulk {
  const team = (index: number) => pick(SEED_ENTITIES.teams[index]?.names as Names, locale)
  return gameMail(
    {
      kind,
      home: team(0),
      away: team(1),
      event: pick(SEED_ENTITIES.events[0]?.names as Names, locale),
      url: `${origin}/#/game/gam_002`,
      homeScore: "61",
      awayScore: "58",
    },
    locale,
  )
}

