/**
 * What WebKit can actually do about live video, printed as one JSON object.
 *
 * A standalone script rather than a test body, and that is not tidiness. The
 * identical call fails inside a Playwright test worker — byte-identical
 * MiniBrowser command line, compared via `ps` — and works when spawned as a
 * child process from that same worker. The cause was not found: not the runtime,
 * not PLAYWRIGHT_TEST, not which package the import came from, not launchOptions
 * merging. So tests/render/moq-support.spec.ts spawns this and asserts on the
 * output.
 *
 * WebTransport in Playwright's WebKit needs three things at once, and missing
 * any one reads as an unsupported browser:
 *
 *   1. `--features=+WebTransport`. It is compiled in but ships disabled;
 *      `MiniBrowser --features=help` lists it as `- WebTransport (developer)`,
 *      and the leading minus is the default-off.
 *   2. `launchPersistentContext`, not `launch()`. A normal launch passes
 *      `--no-startup-window`, MiniBrowser never creates the web view the CLI
 *      features apply to, and the flag is accepted and silently ignored.
 *   3. A secure origin. On `about:blank` or a `data:` URL both WebTransport and
 *      WebCodecs are undefined regardless of any flag.
 */

import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { webkit } from "playwright"

const ORIGIN = process.env.PROBE_ORIGIN ?? "http://127.0.0.1:4173"

const context = await webkit.launchPersistentContext(mkdtempSync(join(tmpdir(), "moq-probe-")), {
  args: ["--features=+WebTransport"],
})

try {
  const page = await context.newPage()
  // A secure origin, or the feature detection below is meaningless.
  await page.goto(ORIGIN, { waitUntil: "domcontentloaded", timeout: 30_000 })

  const result = await page.evaluate(async () => {
    const codec = async (config) => {
      try {
        return (await VideoEncoder.isConfigSupported(config)).supported === true
      } catch {
        return false
      }
    }
    return {
      secureContext: window.isSecureContext,
      webTransport: typeof WebTransport,
      videoEncoder: typeof VideoEncoder,
      h264_720p:
        typeof VideoEncoder === "function"
          ? await codec({ codec: "avc1.42001f", width: 1280, height: 720 })
          : false,
      // The limitation, asserted so it fails loudly when it is fixed. WebKit has
      // no MediaStreamTrackProcessor, so @moq/publish falls back to driving a
      // <video> with requestVideoFrameCallback — which its own source calls
      // "gross" and which stops producing frames when the window is not
      // composited. A coach who backgrounds the app mid-game is on that path.
      mediaStreamTrackProcessor: typeof MediaStreamTrackProcessor,
      requestVideoFrameCallback: "requestVideoFrameCallback" in HTMLVideoElement.prototype,
    }
  })

  console.log(JSON.stringify(result))
} finally {
  await context.close()
}
