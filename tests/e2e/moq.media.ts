import { test } from "@playwright/test"
import { verifyCloudflareVideo } from "../integration/cloudflare-video.mjs"

// Explicit CLI mode: real relay credentials and Chrome are required. Never skip
// missing delivery infrastructure and call that a media pass. No token-bearing traces.
test("real media: denial, distinct frames, playback controls, stop and restart", async () => {
  test.setTimeout(150_000)
  await verifyCloudflareVideo()
})
