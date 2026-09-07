/** Cloudflare relay credentials, with an optional scoped moq-relay adapter.
 * Publisher credentials are released only after checking the game's permission.
 */
import { z } from "zod"
import { ORPCError } from "@orpc/server"
import { can, checkedInHandler, viewer, found } from "./base"

import { mintRelayToken } from "./relay-credentials"
import { isCloudflareMoq } from "../moq-relay"

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
