/**
 * Meetings: anyone may ask anyone, and the invitee decides.
 *
 * The Product Owner's rule, taken literally: there is no restriction on who may
 * create one or who may be invited, because nothing happens to an invitee until
 * they accept. The protection is the invitation, not a gate — so `CREATE_MEETING`
 * and `RESPOND_TO_MEETING_INVITE` are both granted to `ANY_SIGNED_IN` in the
 * model, and the handlers below scope every write to the caller's own row the
 * way the rest of this app does.
 *
 * The invitation is delivered through `notify`, which means it obeys the
 * reader's own channel preferences without special-casing: meeting email off,
 * no mail. That is "via their chosen notification option" — the machinery
 * already meant it, and the only new part is the copy.
 *
 * docs/2026-09-09-13-meetings.md.
 */

import { and, desc, eq, inArray, ne } from "drizzle-orm"
import { ORPCError } from "@orpc/server"
import { z } from "zod"
import * as schema from "../db/schema"
import { authed, authedRoute, requireAction } from "./base"
import { notify } from "./push"

/** Absolute, because an email is read outside the app. Same shape as the queue's. */
const originOf = (env: { BETTER_AUTH_URL?: string }) => (env.BETTER_AUTH_URL ?? "").replace(/\/+$/, "")
import { m } from "../paraglide/messages.js"
import { MEETING_STATUS_CODES, type ReleasedLocale } from "../domain/vocabularies"
import { meetingMail } from "../mail/templates/meeting"

const Participant = z.object({
  userId: z.string(),
  name: z.string(),
  statusCode: z.enum(MEETING_STATUS_CODES),
})

const Meeting = z.object({
  id: z.string(),
  title: z.string(),
  createdBy: z.string(),
  createdByName: z.string(),
  startsAt: z.string().nullable(),
  /** The caller's own standing in it. */
  myStatusCode: z.enum(MEETING_STATUS_CODES),
  participants: z.array(Participant),
})

/**
 * Everyone you could invite.
 *
 * Deliberately every account, at the Product Owner's instruction — you cannot
 * invite people you cannot name. It returns an id and a name and nothing else:
 * no address, no role, no status. That is what a picker needs and it is the
 * whole of what this exposes.
 */
export const people = authed
  .route({ method: "GET", path: "/meetings/people", summary: "People you can invite", ...authedRoute })
  .use(requireAction("CREATE_MEETING"))
  .output(z.object({ people: z.array(z.object({ id: z.string(), name: z.string() })) }))
  .handler(async ({ context }) => {
    const rows = await context.db
      .select({ id: schema.user.id, name: schema.user.name, email: schema.user.email })
      .from(schema.user)
      .where(ne(schema.user.id, context.user.id))
    return { people: rows.map((r) => ({ id: r.id, name: r.name || r.email })) }
  })

/** The meetings this reader is in, newest first. */
export const mine = authed
  .route({ method: "GET", path: "/meetings", summary: "Meetings you are in", ...authedRoute })
  .use(requireAction("CREATE_MEETING"))
  .output(z.object({ meetings: z.array(Meeting) }))
  .handler(async ({ context }) => {
    const mineRows = await context.db
      .select({ meetingId: schema.meetingParticipant.meetingId, statusCode: schema.meetingParticipant.statusCode })
      .from(schema.meetingParticipant)
      .where(eq(schema.meetingParticipant.userId, context.user.id))
    if (!mineRows.length) return { meetings: [] }
    const ids = mineRows.map((r) => r.meetingId)

    const [meetings, participants] = await Promise.all([
      context.db.select().from(schema.meeting).where(inArray(schema.meeting.id, ids)).orderBy(desc(schema.meeting.createdAt)),
      context.db
        .select({
          meetingId: schema.meetingParticipant.meetingId,
          userId: schema.meetingParticipant.userId,
          statusCode: schema.meetingParticipant.statusCode,
          name: schema.user.name,
          email: schema.user.email,
        })
        .from(schema.meetingParticipant)
        .innerJoin(schema.user, eq(schema.user.id, schema.meetingParticipant.userId))
        .where(inArray(schema.meetingParticipant.meetingId, ids)),
    ])
    const nameOf = new Map(participants.map((p) => [p.userId, p.name || p.email]))
    const mineStatus = new Map(mineRows.map((r) => [r.meetingId, r.statusCode]))
    return {
      meetings: meetings.map((mt) => ({
        id: mt.id,
        title: mt.title,
        createdBy: mt.createdBy,
        createdByName: nameOf.get(mt.createdBy) ?? "",
        startsAt: mt.startsAt,
        myStatusCode: mineStatus.get(mt.id) ?? "INVITED",
        participants: participants
          .filter((p) => p.meetingId === mt.id)
          .map((p) => ({ userId: p.userId, name: p.name || p.email, statusCode: p.statusCode })),
      })),
    }
  })

/** Start one, and tell the people invited. */
export const create = authed
  .route({ method: "POST", path: "/meetings", summary: "Start a meeting and invite people", ...authedRoute })
  .use(requireAction("CREATE_MEETING"))
  .input(
    z.object({
      title: z.string().min(1).max(120),
      userIds: z.array(z.string()).min(1).max(50),
      /** An ISO instant, or absent for now. */
      startsAt: z.string().datetime().optional(),
    }),
  )
  .output(z.object({ id: z.string() }))
  .handler(async ({ context, input }) => {
    const id = crypto.randomUUID().replace(/-/g, "")
    const invited = [...new Set(input.userIds)].filter((u) => u !== context.user.id)
    if (!invited.length) throw new ORPCError("BAD_REQUEST", { message: "Invite somebody other than yourself." })

    await context.db.insert(schema.meeting).values({
      id,
      title: input.title,
      createdBy: context.user.id,
      startsAt: input.startsAt ?? null,
      createdAt: new Date().toISOString(),
    })
    // The creator is a participant, already accepted — so "meetings I am in" is
    // one query and nobody has to accept their own invitation.
    await context.db.insert(schema.meetingParticipant).values([
      { meetingId: id, userId: context.user.id, statusCode: "ACCEPTED", respondedAt: new Date().toISOString() },
      ...invited.map((userId) => ({ meetingId: id, userId, statusCode: "INVITED" as const, respondedAt: null })),
    ])

    const from = context.user.name || ""
    await notify(context.db, context.env, {
      typeCode: "MEETING_INVITE",
      // Addressed, not broadcast: there is no object to follow here, and the
      // meeting is the thing being announced. See `audience` in ./push.ts.
      targets: [],
      users: invited,
      tag: `meeting:${id}`,
      render: {
        PUSH: (locale: ReleasedLocale) => ({
          channel: "PUSH" as const,
          title: m.push_meeting_title({ from }, { locale }),
          body: m.push_meeting_body({ title: input.title }, { locale }),
          url: `#/meeting/${id}`,
          tag: `meeting:${id}`,
        }),
        EMAIL: (locale: ReleasedLocale) => ({
          channel: "EMAIL" as const,
          ...meetingMail({ from, title: input.title, url: `${originOf(context.env)}/#/meeting/${id}` }, locale),
          unsubscribeLabel: m.email_unsubscribe({}, { locale }),
        }),
      },
    })
    return { id }
  })

/**
 * Accept or decline — your own row and nobody else's.
 *
 * Declining does not remove you and does not lock the door: it takes the
 * meeting out of your list, and the room stays open if you change your mind.
 * The Product Owner's rule is that the invitee decides, and deciding twice is
 * still deciding.
 */
export const respond = authed
  .route({ method: "POST", path: "/meetings/respond", summary: "Accept or decline an invitation", ...authedRoute })
  .use(requireAction("RESPOND_TO_MEETING_INVITE"))
  .input(z.object({ meetingId: z.string(), statusCode: z.enum(["ACCEPTED", "DECLINED"]) }))
  .output(z.object({ ok: z.literal(true) }))
  .handler(async ({ context, input }) => {
    const changed = await context.db
      .update(schema.meetingParticipant)
      .set({ statusCode: input.statusCode, respondedAt: new Date().toISOString() })
      .where(
        and(
          eq(schema.meetingParticipant.meetingId, input.meetingId),
          eq(schema.meetingParticipant.userId, context.user.id),
        ),
      )
      .returning({ userId: schema.meetingParticipant.userId })
    if (!changed.length) throw new ORPCError("NOT_FOUND")
    return { ok: true as const }
  })
