import { afterEach, expect, it, vi } from "vitest"
import { BroadcastHeartbeat, CaptureSession, WatchProgress } from "../../src/web/lib/moq-lifecycle"

function media() {
  const track = Object.assign(new EventTarget(), { readyState: "live", stop: vi.fn() })
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream
  return { track, stream }
}
afterEach(() => vi.useRealTimers())

it("a denied request never presents a captured stream", async () => {
  const changed = vi.fn()
  const capture = new CaptureSession(changed)
  await expect(capture.start(() => Promise.reject(new DOMException("Denied", "NotAllowedError")))).rejects.toMatchObject({ name: "NotAllowedError" })
  expect(changed).not.toHaveBeenCalled()
})

it("permission granted after cancellation immediately releases every track", async () => {
  const changed = vi.fn()
  const capture = new CaptureSession(changed)
  const { track, stream } = media()
  let resolve!: (stream: MediaStream) => void
  const started = capture.start(() => new Promise(done => { resolve = done }))
  capture.stop()
  resolve(stream)
  expect(await started).toBe(false)
  expect(track.stop).toHaveBeenCalledOnce()
  expect(changed).not.toHaveBeenCalled()
})

it("browser-ended capture withdraws the source and releases tracks", async () => {
  const changed = vi.fn()
  const capture = new CaptureSession(changed)
  const { track, stream } = media()
  await capture.start(async () => stream)
  track.dispatchEvent(new Event("ended"))
  expect(changed.mock.calls).toEqual([[stream], [undefined]])
  expect(track.stop).toHaveBeenCalledOnce()
  capture.stop()
  expect(track.stop).toHaveBeenCalledOnce()
})

it("switching cameras releases the old camera before requesting the next one", async () => {
  const changed = vi.fn()
  const capture = new CaptureSession(changed)
  const rear = media()
  const front = media()
  await capture.start(async () => rear.stream)
  await capture.start(async () => {
    expect(rear.track.stop).toHaveBeenCalledOnce()
    expect(changed).toHaveBeenLastCalledWith(undefined)
    return front.stream
  })
  expect(changed).toHaveBeenLastCalledWith(front.stream)
  capture.stop()
  expect(front.track.stop).toHaveBeenCalledOnce()
})

it("a delayed start is withdrawn after Stop and cannot leave a live row", async () => {
  vi.useFakeTimers()
  const calls: string[] = []
  let finish!: () => void
  const heartbeat = new BroadcastHeartbeat(() => { calls.push("start"); return new Promise<void>(done => { finish = done }) }, async () => { calls.push("stop") }, vi.fn())
  heartbeat.setReady(true)
  await Promise.resolve()
  const closed = heartbeat.close()
  expect(calls).toEqual(["start"])
  finish()
  await closed
  await vi.advanceTimersByTimeAsync(60_000)
  expect(calls).toEqual(["start", "stop"])
})

it("a rejected heartbeat stops renewal and reports the denial", async () => {
  vi.useFakeTimers()
  const denied = new Error("Denied")
  const start = vi.fn().mockRejectedValue(denied)
  const stop = vi.fn().mockResolvedValue(undefined)
  const failed = vi.fn()
  const heartbeat = new BroadcastHeartbeat(start, stop, failed)
  heartbeat.setReady(true)
  await vi.advanceTimersByTimeAsync(60_000)
  expect(start).toHaveBeenCalledOnce()
  expect(failed).toHaveBeenCalledWith(denied)
  expect(stop).toHaveBeenCalledOnce()
  await heartbeat.close()
})

it("playback requires advancing frames and distinguishes pause, stall and end", () => {
  const progress = new WatchProgress()
  const sample = { frames: 0, connected: true, broadcast: "live" as const, paused: false }
  expect(progress.read(sample, 0)).toBe("waiting")
  expect(progress.read({ ...sample, frames: 1 }, 100)).toBe("playing")
  expect(progress.read({ ...sample, frames: 1 }, 3500)).toBe("reconnecting")
  expect(progress.read({ ...sample, frames: 1, paused: true }, 4000)).toBe("paused")
  expect(progress.read({ ...sample, frames: 1, broadcast: "offline" }, 8000)).toBe("ended")
  expect(progress.read({ ...sample, frames: 2 }, 9000)).toBe("playing")
})
