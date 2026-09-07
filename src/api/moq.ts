/**
 * Where the live-video relay is, if there is one.
 *
 * Served rather than baked into the bundle, for the reason Cloudflare states
 * about their own relay: the token travels in the URL **path**, so it appears
 * in server access logs. A literal in `index.html` would additionally put it in
 * git, hand it to every visitor forever, and make rotating it a redeploy.
 *
 * Publishing tokens are capabilities. Issue one only to an authorized game's
 * broadcaster; watchers must never receive it as a subscribe-token fallback.
 * The configured token is still shared by publishers: per-game enforcement at
 * the relay requires scoped short-lived tokens, not just this issuance check.
 */

import { z } from "zod"
import { ORPCError } from "@orpc/server"
import { can, checkedInHandler, viewer } from "./base"

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
    // Watchers get the subscribe-only token, and they are most people. A token
    // scraped from the watch page then cannot start a broadcast.
    const token =
      input.role === "publish"
        ? context.env.MOQ_RELAY_TOKEN
        : context.env.MOQ_RELAY_TOKEN_SUBSCRIBE
    return { url: context.env.MOQ_RELAY_URL ?? null, token: token ?? null }
  })
