import { execFileSync } from "node:child_process"
import { resolve } from "node:path"
import { test, expect } from "./fixture"

/**
 * What WebKit can actually do about live video — and one thing it cannot.
 *
 * The probe runs as a child process rather than in this worker. The identical
 * `launchPersistentContext` call fails inside a Playwright test worker and
 * succeeds when spawned from it, with a byte-identical MiniBrowser command line
 * compared via `ps`. The cause was not found; the workaround is reliable.
 * scripts/moq-probe.mjs carries the three things WebTransport needs here.
 *
 * WebKit is the baseline on purpose (see the config comment on why Chromium hid
 * a real cookie bug), which makes it the browser whose limits matter most.
 */

const ROOT = resolve(import.meta.dirname, "../..")

function probe(): Record<string, unknown> {
  try {
    // `cwd` explicitly, and stderr captured below: without both, a failure is a
    // bare "Command failed" with nothing to debug.
    const out = execFileSync("node", ["scripts/moq-probe.mjs"], {
      cwd: ROOT,
      encoding: "utf-8",
      timeout: 120_000,
      env: { ...process.env, PROBE_ORIGIN: "http://127.0.0.1:4173" },
    })
    return JSON.parse(out.trim().split("\n").pop()!) as Record<string, unknown>
  } catch (err) {
    const e = err as { stderr?: Buffer | string; stdout?: Buffer | string; message?: string }
    throw new Error(
      `moq-probe failed: ${e.message}\n--- stderr ---\n${String(e.stderr ?? "")}\n` +
        `--- stdout ---\n${String(e.stdout ?? "")}`,
    )
  }
}

let result: Record<string, unknown>

test.beforeAll(() => {
  result = probe()
})

test.describe("What WebKit brings to live video", () => {
  test("runs the probe on a secure origin, or nothing below means anything", () => {
    // On about:blank or a data: URL both WebTransport and WebCodecs are
    // undefined however the browser was launched, so a probe that skipped this
    // would report "unsupported" for a browser that supports it.
    expect(result.secureContext).toBe(true)
  })

  test("has WebTransport once the feature flag is on", () => {
    // Compiled in but shipped disabled — `--features=+WebTransport`, and only
    // through launchPersistentContext, or the flag is silently ignored.
    expect(result.webTransport).toBe("function")
  })

  test("can encode H.264 at 720p", () => {
    expect(result.videoEncoder).toBe("function")
    expect(result.h264_720p).toBe(true)
  })

  /**
   * The most important thing this build found, and a product risk rather than a
   * test detail.
   *
   * WebKit has no MediaStreamTrackProcessor, so `@moq/publish` falls back to
   * driving a `<video>` with `requestVideoFrameCallback` — which its own source
   * calls "gross" and which **stops producing frames when the window is not
   * composited**. A coach who pockets the phone at half time stops broadcasting.
   *
   * Asserted as a limitation so it fails loudly the day Safari ships the native
   * path, which is the day the fallback can be dropped.
   */
  test("still lacks the native capture path, so publishing runs on the fallback", () => {
    expect(
      result.mediaStreamTrackProcessor,
      "MediaStreamTrackProcessor exists now — the rVFC fallback in @moq/publish can go, " +
        "and with it the risk that backgrounding the app stops the broadcast",
    ).toBe("undefined")
    expect(result.requestVideoFrameCallback).toBe(true)
  })
})
