import { Hono } from "hono"
import type { AppEnv } from "../types"

/**
 * Apple Associated Domains (universal links / deep links).
 *
 * Served by the Worker rather than from the [assets] directory so we control
 * the response exactly. Apple's CDN requires:
 *   - HTTPS, no redirects
 *   - Content-Type: application/json
 *   - path exactly /.well-known/apple-app-site-association (no extension)
 *
 * Apple caches this file aggressively. Serving a placeholder with wrong IDs is
 * worse than serving nothing, so this 404s until APPLE_TEAM_ID and
 * APPLE_BUNDLE_ID are set — see `mise run cf:apple:set`.
 */
const wellKnown = new Hono<AppEnv>()

wellKnown.get("/.well-known/apple-app-site-association", (c) => {
  const teamId = c.env.APPLE_TEAM_ID
  const bundleId = c.env.APPLE_BUNDLE_ID

  if (!teamId || !bundleId) {
    return c.json(
      { error: "Associated Domains not configured (APPLE_TEAM_ID / APPLE_BUNDLE_ID unset)" },
      404,
    )
  }

  const appId = `${teamId}.${bundleId}`

  return c.json(
    {
      applinks: {
        details: [
          {
            appIDs: [appId],
            // Every SPA route is reachable by universal link. The SPA itself
            // uses hash routing, so the server only ever sees /app.
            components: [{ "/": "/app*", comment: "SPA and all hash routes beneath it" }],
          },
        ],
      },
      // Declared so the same file works if Handoff/App Clips are added later.
      webcredentials: { apps: [appId] },
    },
    200,
    { "Content-Type": "application/json" },
  )
})

// Android App Links equivalent, for Tauri Android deep links.
wellKnown.get("/.well-known/assetlinks.json", (c) => {
  const pkg = c.env.ANDROID_PACKAGE_NAME
  const fingerprint = c.env.ANDROID_CERT_FINGERPRINT

  if (!pkg || !fingerprint) {
    return c.json(
      { error: "App Links not configured (ANDROID_PACKAGE_NAME / ANDROID_CERT_FINGERPRINT unset)" },
      404,
    )
  }

  return c.json(
    [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: pkg,
          sha256_cert_fingerprints: [fingerprint],
        },
      },
    ],
    200,
    { "Content-Type": "application/json" },
  )
})

export default wellKnown
