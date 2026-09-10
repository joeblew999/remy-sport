/** Cloudflare relay credentials, with an optional scoped moq-relay adapter.
 * Publisher credentials are released only after checking the game's permission.
 */
import { z } from "zod"
import { ORPCError } from "@orpc/server"
import { authed, authedRoute, can, checkedInHandler, found, infrastructure, requireAction, viewer } from "./base"

import { mintMeetingToken, mintRelayToken, mintRoomToken } from "./relay-credentials"
import { isCloudflareMoq } from "../moq-relay"
import { environmentOf } from "../environment"
import * as schema from "../db/schema"
import { eq } from "drizzle-orm"

export const config = viewer
  .use(checkedInHandler("BROADCAST_GAME", "VIEW_LIVE_STREAM"))
  .route({ method: "GET", path: "/moq/config", summary: "The MoQ relay, or null if video is off" })
  .input(z.object({ role: z.enum(["watch", "publish"]).default("watch"), gameId: z.string().optional() }))
  .output(z.object({ url: z.string().nullable(), token: z.string().nullable() }))
  .handler(async ({ context, input }) => {
    if (input.role === "publish") {
      if (!context.user) throw new ORPCError("UNAUTHORIZED")
      if (!input.gameId || !await can(context.db, "BROADCAST_GAME", context.user, input.gameId)) {
        throw new ORPCError("FORBIDDEN")
      }
    }
    if (!input.gameId) return { url: null, token: null }
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(input.gameId)) throw new ORPCError("BAD_REQUEST")
    found(await context.db.query.game.findFirst({ where: (game, { eq }) => eq(game.id, input.gameId!) }))
    if (!context.env.MOQ_RELAY_URL) return { url: null, token: null }
    try {
      const url = new URL(context.env.MOQ_RELAY_URL)
      if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("Invalid relay URL")
      if (isCloudflareMoq(url)) {
        // Cloudflare tokens are relay-wide, not game-scoped. See GAP-03 in
        // docs/2026-09-07-02-relay-capabilities.md. Never give a viewer the
        // publisher token as a fallback for a missing subscribe-only token.
        const token = input.role === "publish" ? context.env.MOQ_RELAY_TOKEN : context.env.MOQ_RELAY_TOKEN_SUBSCRIBE
        return token ? { url: url.origin, token } : { url: null, token: null }
      }
      if (!context.env.MOQ_RELAY_SIGNING_KEY) return { url: null, token: null }
      url.pathname = `${url.pathname.replace(/\/$/, "")}/games/${input.gameId}`
      return { url: url.toString(), token: await mintRelayToken(context.env.MOQ_RELAY_SIGNING_KEY, input.gameId, input.role) }
    } catch {
      // Do not log key material or a capability-bearing URL on configuration errors.
      throw new ORPCError("SERVICE_UNAVAILABLE")
    }
  })

/** A development experiment, not a meeting grant or a game permission bypass. */
export const meetingConfig = authed
  .use(infrastructure("authenticated dev-only Hang media experiment; no meeting domain grants or game state"))
  .route({ method: "GET", path: "/moq/meeting-test", summary: "Development-only two-person Hang test", ...authedRoute })
  .input(z.object({ room: z.string().regex(/^[a-f0-9]{32}$/), seat: z.enum(["a", "b"]) }))
  .output(z.object({ publish: z.object({ url: z.string(), token: z.string(), name: z.string() }), watch: z.object({ url: z.string(), token: z.string(), name: z.string() }) }).nullable())
  .handler(async ({ context, input }) => {
    if (environmentOf(context.env) !== "dev") throw new ORPCError("NOT_FOUND")
    if (!context.env.MOQ_RELAY_URL) return null
    try {
      const url = new URL(context.env.MOQ_RELAY_URL)
      if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("Invalid relay URL")
      const peer = input.seat === "a" ? "b" : "a"
      const prefix = `meeting-test/${input.room}`
      if (isCloudflareMoq(url)) {
        const publish = context.env.MOQ_RELAY_TOKEN
        const watch = context.env.MOQ_RELAY_TOKEN_SUBSCRIBE
        if (!publish || !watch) return null
        // Relay-wide capabilities are confined to the authenticated dev test.
        // Random room names provide separation, not private meeting access.
        return { publish: { url: url.origin, token: publish, name: `${prefix}/${input.seat}.hang` }, watch: { url: url.origin, token: watch, name: `${prefix}/${peer}.hang` } }
      }
      const key = context.env.MOQ_RELAY_SIGNING_KEY
      if (!key) return null
      url.pathname = `/${prefix}`
      return {
        publish: { url: url.toString(), token: await mintMeetingToken(key, input.room, input.seat, "publish"), name: `${input.seat}.hang` },
        watch: { url: url.toString(), token: await mintMeetingToken(key, input.room, input.seat, "watch"), name: `${peer}.hang` },
      }
    } catch { throw new ORPCError("SERVICE_UNAVAILABLE") }
  })

/**
 * The media for a real meeting: publish as yourself, watch everyone else.
 *
 * A generalisation of `meetingConfig` above, which is the dev two-seat test and
 * stays exactly as it is. The differences are the ones that make this the
 * feature rather than the experiment: the room is a stored meeting, the seat is
 * the caller's own user id rather than the literal `a` or `b`, membership is
 * checked against `meeting_participant`, and it runs outside `dev`.
 *
 * Only participants get credentials. That is not a contradiction of the Product
 * Owner's "no restrictions" — anyone may *create* a meeting with anyone, and an
 * invitee may accept or decline. Handing relay tokens to somebody who was never
 * invited is a different thing, and nothing in the product asks for it.
 *
 * A declined participant still gets them: declining takes the meeting out of
 * your list, it does not lock the door if you change your mind.
 * docs/done/2026-09-09-13-meetings.md.
 */
export const meetingRoom = authed
  .use(requireAction("RESPOND_TO_MEETING_INVITE"))
  .route({ method: "GET", path: "/moq/meeting", summary: "Media credentials for a meeting you are in", ...authedRoute })
  .input(z.object({ meetingId: z.string().min(1) }))
  .output(
    z.object({
      publish: z.object({ url: z.string(), token: z.string(), name: z.string() }),
      watch: z.array(z.object({ url: z.string(), token: z.string(), name: z.string(), who: z.string() })),
    }).nullable(),
  )
  .handler(async ({ context, input }) => {
    const rows = await context.db
      .select({
        userId: schema.meetingParticipant.userId,
        name: schema.user.name,
        email: schema.user.email,
      })
      .from(schema.meetingParticipant)
      .innerJoin(schema.user, eq(schema.user.id, schema.meetingParticipant.userId))
      .where(eq(schema.meetingParticipant.meetingId, input.meetingId))
    if (!rows.some((r) => r.userId === context.user.id)) throw new ORPCError("NOT_FOUND")
    if (!context.env.MOQ_RELAY_URL) return null

    try {
      const url = new URL(context.env.MOQ_RELAY_URL)
      if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
        throw new Error("Invalid relay URL")
      }
      const others = rows.filter((r) => r.userId !== context.user.id)
      const seat = context.user.id
      const prefix = `meeting/${input.meetingId}`
      if (isCloudflareMoq(url)) {
        const publish = context.env.MOQ_RELAY_TOKEN
        const watch = context.env.MOQ_RELAY_TOKEN_SUBSCRIBE
        if (!publish || !watch) return null
        return {
          publish: { url: url.origin, token: publish, name: `${prefix}/${seat}.hang` },
          watch: others.map((o) => ({
            url: url.origin,
            token: watch,
            name: `${prefix}/${o.userId}.hang`,
            who: o.name || o.email,
          })),
        }
      }
      const key = context.env.MOQ_RELAY_SIGNING_KEY
      if (!key) return null
      url.pathname = `/${prefix}`
      return {
        publish: {
          url: url.toString(),
          token: await mintRoomToken(key, input.meetingId, seat, "publish", []),
          name: `${seat}.hang`,
        },
        watch: await Promise.all(
          others.map(async (o) => ({
            url: url.toString(),
            token: await mintRoomToken(key, input.meetingId, seat, "watch", others.map((x) => x.userId)),
            name: `${o.userId}.hang`,
            who: o.name || o.email,
          })),
        ),
      }
    } catch {
      throw new ORPCError("SERVICE_UNAVAILABLE")
    }
  })
