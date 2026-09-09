/** Native capture ownership; MoQ handles the media after permission is granted. */
export class CaptureSession {
  private generation = 0
  private stream?: MediaStream
  private ended?: () => void

  constructor(private readonly changed: (stream: MediaStream | undefined) => void) {}

  async start(request: () => Promise<MediaStream>): Promise<boolean> {
    this.stop()
    const generation = this.generation
    const stream = await request()
    // Closing a permission dialog can resolve after Stop, unmount or revocation.
    if (generation !== this.generation) {
      stream.getTracks().forEach(track => track.stop())
      return false
    }
    const video = stream.getVideoTracks()[0]
    if (!video || video.readyState !== "live") {
      stream.getTracks().forEach(track => track.stop())
      throw new DOMException("No live video track", "NotFoundError")
    }
    this.stream = stream
    this.ended = () => this.stop()
    stream.getTracks().forEach(track => track.addEventListener("ended", this.ended!))
    this.changed(stream)
    return true
  }

  stop() {
    this.generation++
    const stream = this.stream
    this.stream = undefined
    if (stream) {
      for (const track of stream.getTracks()) {
        if (this.ended) track.removeEventListener("ended", this.ended)
        track.stop()
      }
      this.changed(undefined)
    }
    this.ended = undefined
  }
}

/** Serialize withdrawal after an in-flight start, so Stop cannot leave a ghost live row. */
export class BroadcastHeartbeat {
  private ready = false
  private queue = Promise.resolve()
  private timer?: ReturnType<typeof setInterval>

  constructor(
    private readonly start: () => Promise<unknown>,
    private readonly stop: () => Promise<unknown>,
    private readonly failed: (error: unknown) => void,
  ) {}

  setReady(ready: boolean) {
    if (ready === this.ready) return
    this.ready = ready
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
    if (ready) {
      this.beat()
      this.timer = setInterval(() => this.beat(), 20_000)
    } else {
      this.queue = this.queue.then(() => this.stop()).then(() => undefined, () => undefined)
    }
  }

  private beat() {
    this.queue = this.queue.then(async () => {
      if (!this.ready) return
      try { await this.start() }
      catch (error) {
        this.setReady(false)
        this.failed(error)
      }
    })
  }

  close() {
    this.setReady(false)
    return this.queue
  }
}

export type WatchState = "waiting" | "connecting" | "playing" | "paused" | "reconnecting" | "ended"

/** Decoded frames, not discovery or a connected socket, establish playback. */
export class WatchProgress {
  private frames = 0
  private progressed = 0
  private played = false

  read(sample: { frames: number; connected: boolean; broadcast: "offline" | "loading" | "live"; paused: boolean }, now: number): WatchState {
    if (sample.paused) {
      this.progressed = now
      this.frames = sample.frames
      return "paused"
    }
    if (sample.frames !== this.frames) {
      this.frames = sample.frames
      this.progressed = now
      this.played = true
    }
    if (!sample.connected) return this.played ? "reconnecting" : "connecting"
    if (this.played && now - this.progressed < 3000) return "playing"
    if (sample.broadcast === "offline") return this.played ? "ended" : "waiting"
    return this.played ? "reconnecting" : "waiting"
  }
}
