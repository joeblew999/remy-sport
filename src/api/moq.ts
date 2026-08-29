/**
 * Where the live-video relay is, if there is one.
 *
 * Served rather than baked into the bundle, for the reason Cloudflare states
 * about their own relay: the token travels in the URL **path**, so it appears
 * in server access logs. A literal in `index.html` would additionally put it in
 * git, hand it to every visitor forever, and make rotating it a redeploy.
 *
 * Public, like the VAPID key next door, and for a weaker reason than that one:
 * a push key is genuinely not a secret, whereas this token *is* a capability —
 * anyone holding it can publish to the relay. That is acceptable only because
 * this is a test harness with no authorisation on broadcasting at all (see
 * src/web/pages/video.tsx on why inventing one would be worse). Before this is
 * anything but a harness, the relay needs short-lived per-viewer tokens, which
 * is Cloudflare's own guidance.
 */

import { z } from "zod"
import { infrastructure, pub } from "./base"

export const config = pub
  .use(
    infrastructure(
      "the MoQ relay address for the video harness — a capability token, and the " +
        "harness has no authorisation on broadcasting for it to be scoped to yet",
    ),
  )
  .route({ method: "GET", path: "/moq/config", summary: "The MoQ relay, or null if video is off" })
  .output(z.object({ url: z.string().nullable(), token: z.string().nullable() }))
  .handler(({ context }) => ({
    url: context.env.MOQ_RELAY_URL ?? null,
    token: context.env.MOQ_RELAY_TOKEN ?? null,
  }))
