import { useEffect, useRef, useState } from "react"
import type MoqWatch from "@moq/watch/element"
import { Audio, Broadcast, Net, Signals, Source, Video } from "@moq/publish"
import * as WatchSupport from "@moq/watch/support"
import * as PublishSupport from "@moq/publish/support"
import { api } from "./orpc"
import { broadcastName, ENCODER, errorName, relayUrl, remoteErrorCode, RECONNECT, reportSession, type MoqConfig } from "./moq"
import { BroadcastHeartbeat, CaptureSession, WatchProgress, type WatchState } from "./moq-lifecycle"
import "@moq/watch/element"

/** Capability probes come from MoQ; browser capture availability is checked separately. */
export function useMediaSupport(role: "watch" | "publish") {
  const [support, setSupport] = useState<{ video: boolean; audio: boolean; fallback: boolean; camera: boolean; screen: boolean }>()
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    setSupport(undefined)
    setError(false)
    const codecs = (value: WatchSupport.Video | undefined) => !!value && Object.values(value).some(codec => codec.software || codec.hardware)
    const probe = async () => {
      if (role === "watch") {
        const s = await WatchSupport.isSupported()
        return { video: s.video.render && codecs(s.video.decoding), audio: s.audio.render, fallback: s.webtransport !== "full", camera: false, screen: false }
      }
      const s = await PublishSupport.isSupported()
      return { video: s.video.capture !== "none" && codecs(s.video.encoding), audio: s.audio.capture, fallback: s.webtransport !== "full" || s.video.capture === "partial", camera: typeof navigator.mediaDevices?.getUserMedia === "function", screen: typeof navigator.mediaDevices?.getDisplayMedia === "function" }
    }
    void probe().then(value => { if (active) setSupport(value) }, () => { if (active) setError(true) })
    return () => { active = false }
  }, [role, attempt])
  return { support, error, retry: () => setAttempt(value => value + 1) }
}

function sessionReport(connection: Net.Connection.Reload, role: "watch" | "publish", gameId: string) {
  const started = performance.now()
  let transport = connection.established.peek()?.transport ?? "none"
  let reported = false
  const unsubscribe = connection.established.subscribe(value => { if (value) transport = value.transport })
  const report = (error?: unknown) => {
    if (reported) return
    reported = true
    reportSession({ role, gameId, transport, seconds: Math.round((performance.now() - started) / 1000), errorCode: remoteErrorCode(error), errorName: error ? errorName(error) : undefined })
  }
  void connection.closed.catch(report)
  const hide = () => report()
  window.addEventListener("pagehide", hide)
  return () => { unsubscribe(); window.removeEventListener("pagehide", hide); report() }
}

/** Read installed element signals every 250 ms; never invent DOM media events. */
export function useWatchAdapter(gameId: string) {
  const [element, setElement] = useState<MoqWatch | null>(null)
  const [attempt, setAttempt] = useState(0)
  const intent = useRef({ paused: false, muted: true, volume: 1 })
  const volumeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const audibleVolume = useRef(0.5)
  const [controls, setControls] = useState(intent.current)
  const [state, setState] = useState<WatchState>("connecting")
  const [audioBlocked, setAudioBlocked] = useState(false)
  const [controlError, setControlError] = useState<"audio" | "fullscreen" | null>(null)
  useEffect(() => {
    if (!element) return
    element.connection.delay = RECONNECT
    element.paused = intent.current.paused
    element.muted = intent.current.muted
    const restoredVolume = intent.current.volume
    if (!intent.current.muted) volumeTimer.current = setTimeout(() => { element.volume = restoredVolume }, 0)
    const report = sessionReport(element.connection, "watch", gameId)
    const progress = new WatchProgress()
    let frames = 0
    let progressedAt = Date.now()
    const read = () => {
      const count = element.video.out.stats.peek()?.frameCount ?? 0
      const paused = element.paused
      const current = { paused, muted: element.muted, volume: element.volume }
      if (!current.muted && current.volume > 0) audibleVolume.current = current.volume
      intent.current = current
      setControls(previous => previous.paused === current.paused && previous.muted === current.muted && previous.volume === current.volume ? previous : current)
      setAudioBlocked(!element.muted && element.audio.out.context.peek()?.state === "suspended")
      setState(progress.read({ frames: count, connected: element.connection.status.peek() === "connected", broadcast: element.broadcast.out.status.peek(), paused }, Date.now()))
      // Discovery-less relays cannot reattach an ended blind subscription.
      if (element.connection.established.peek()?.discovery !== false || document.hidden || paused || count !== frames) {
        progressedAt = Date.now()
        frames = count
      } else if (Date.now() - progressedAt >= 10_000) {
        progressedAt = Date.now()
        setAttempt(value => value + 1)
      }
    }
    read()
    const timer = setInterval(read, 250)
    return () => { clearInterval(timer); clearTimeout(volumeTimer.current); report() }
  }, [element, gameId])

  const change = (next: Partial<typeof controls>) => {
    intent.current = { ...intent.current, ...next }
    setControls(intent.current)
    if (element) {
      clearTimeout(volumeTimer.current)
      if (next.paused !== undefined) element.paused = next.paused
      if (next.muted !== undefined) element.muted = next.muted
      if (next.volume !== undefined) {
        // Watch restores its remembered volume asynchronously on unmute. Let
        // that settle before applying the user's slider value, or it snaps back.
        const volume = next.volume
        if (volume > 0) audibleVolume.current = volume
        element.muted = volume === 0
        volumeTimer.current = setTimeout(() => { element.volume = volume }, 0)
      }
    }
  }
  const enableAudio = async () => {
    change({ muted: false, volume: audibleVolume.current })
    setControlError(null)
    try { await element?.audio.out.context.peek()?.resume() }
    catch { setControlError("audio") }
  }
  const fullscreen = async (target: HTMLElement | null) => {
    setControlError(null)
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await target?.requestFullscreen()
    } catch { setControlError("fullscreen") }
  }
  return { element, setElement, attempt, controls, state, audioBlocked, controlError, change, enableAudio, fullscreen, retry: () => setAttempt(value => value + 1) }
}

export type PublishState = "idle" | "requesting" | "connecting" | "broadcasting" | "reconnecting" | "stopped" | "error"

/** Browser acquisition stays here because the upstream element discards permission errors. */
export function usePublishAdapter(gameId: string, config: MoqConfig, audio: boolean) {
  const [preview, setPreview] = useState<HTMLVideoElement | null>(null)
  const [state, setState] = useState<PublishState>("idle")
  const [error, setError] = useState<unknown>(null)
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  const [camera, setCamera] = useState("environment")
  const cameraRef = useRef(camera)
  const [source, setSource] = useState<"camera" | "screen" | null>(null)
  const [cameraLabel, setCameraLabel] = useState("")
  const controller = useRef<{ start: (source: "camera" | "screen") => void; stop: () => void; connection: Net.Connection.Reload } | null>(null)
  const configRef = useRef(config)
  configRef.current = config
  useEffect(() => {
    if (!preview) return
    let alive = true
    let request = 0
    let stream: MediaStream | undefined
    let wasReady = false
    let requestedSource: "camera" | "screen" = "camera"
    const devices = navigator.mediaDevices ? new Source.Device("video") : undefined
    const unsubscribeDevices = devices?.out.available.subscribe(value => { if (alive) setCameras(value ?? []) })
    let releaseDevice: (() => void) | undefined
    const videoSource = new Signals.Signal<Video.Source | undefined>(undefined)
    const audioSource = new Signals.Signal<Audio.Source | undefined>(undefined)
    const enabled = new Signals.Signal(false)
    const connection = new Net.Connection.Reload({ enabled, url: new URL(relayUrl(configRef.current)), delay: RECONNECT })
    const capture = new Video.Capture({ source: videoSource })
    const broadcast = new Broadcast({ connection: connection.established, enabled, name: Net.Path.from(broadcastName(gameId)), display: capture.out.display })
    const video = new Video.Encoder("video", { broadcast, capture, enabled: true, config: ENCODER })
    const sound = new Audio.Encoder("audio", { broadcast, source: audioSource, enabled: true })
    const report = sessionReport(connection, "publish", gameId)
    const heartbeat = new BroadcastHeartbeat(
      () => api.games.startBroadcast({ id: gameId }),
      () => api.games.stopBroadcast({ id: gameId }),
      failure => { stop(); if (alive) { setError(failure); setState("error") } },
    )
    const session = new CaptureSession(next => {
      releaseDevice?.()
      releaseDevice = undefined
      stream = next
      const track = next?.getVideoTracks()[0]
      const mic = next?.getAudioTracks()[0]
      if (track && requestedSource === "camera") releaseDevice = devices?.capture(track.getSettings().deviceId)
      if (alive) {
        setSource(track ? requestedSource : null)
        setCameraLabel(track && requestedSource === "camera" ? track.label : "")
      }
      // The browser guarantees each getter's track kind; MoQ narrows its DOM types further.
      videoSource.set(track as Video.Source | undefined)
      audioSource.set(mic as Audio.Source | undefined)
      enabled.set(!!track)
      preview.srcObject = next ?? null
      if (!next) {
        heartbeat.setReady(false)
        if (alive) setState("stopped")
      }
    })
    function stop() {
      request++
      session.stop()
      heartbeat.setReady(false)
      if (alive) setState("stopped")
    }
    const start = (source: "camera" | "screen") => {
      const current = ++request
      // Phones may only open one camera at a time. Release before requesting
      // the replacement, and withdraw the heartbeat during the switch.
      session.stop()
      requestedSource = source
      setError(null)
      setState("requesting")
      wasReady = false
      void session.start(() => source === "camera"
        ? navigator.mediaDevices.getUserMedia({ video: {
          width: { ideal: 1280 }, height: { ideal: 720 },
          ...(cameraRef.current.startsWith("device:")
            ? { deviceId: { exact: cameraRef.current.slice(7) } }
            : { facingMode: { ideal: cameraRef.current } }),
        }, audio })
        : navigator.mediaDevices.getDisplayMedia({ video: true, audio })
      ).then(captured => {
        if (alive && current === request && captured) setState("connecting")
      }, failure => {
        if (alive && current === request) { setError(failure); setState("error") }
      })
    }
    controller.current = { start, stop, connection }
    const tick = () => {
      if (!stream) return
      const ready = stream.getVideoTracks().some(track => track.readyState === "live") &&
        connection.status.peek() === "connected" && !!broadcast.net.peek() && !!capture.out.frame.peek()
      heartbeat.setReady(ready)
      setState(ready ? "broadcasting" : wasReady ? "reconnecting" : "connecting")
      wasReady ||= ready
    }
    const timer = setInterval(tick, 250)
    const hide = () => {
      stop()
      void fetch(`/api/games/${gameId}/broadcast`, { method: "DELETE", keepalive: true, credentials: "same-origin" }).catch(() => undefined)
    }
    window.addEventListener("pagehide", hide)
    return () => {
      alive = false
      stop()
      clearInterval(timer)
      window.removeEventListener("pagehide", hide)
      void heartbeat.close()
      unsubscribeDevices?.(); releaseDevice?.(); devices?.close()
      video.close(); sound.close(); broadcast.close(); capture.close(); connection.close(); report()
      controller.current = null
    }
  }, [preview, gameId, audio])
  useEffect(() => { controller.current?.connection.url.set(new URL(relayUrl(config))) }, [config.url, config.token])
  const chooseCamera = (value: string) => {
    cameraRef.current = value
    setCamera(value)
    if (source === "camera") controller.current?.start("camera")
  }
  return { setPreview, state, error, cameras, camera, cameraLabel, chooseCamera, start: (source: "camera" | "screen") => controller.current?.start(source), stop: () => controller.current?.stop() }
}
