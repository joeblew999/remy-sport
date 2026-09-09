/** Shadcn presentation only; the adapter owns capture, transport and observed media state. */
import { useRef, type ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import { CameraIcon, MaximizeIcon, MicIcon, MicOffIcon, PauseIcon, PlayIcon, ScreenShareIcon, SquareIcon, Volume2Icon, VolumeXIcon } from "lucide-react"
import { orpc } from "../lib/orpc"
import { useGame } from "../lib/data"
import { m } from "../lib/i18n"
import { formErrors } from "../lib/form-errors"
import { broadcastName, relayUrl, type MoqConfig } from "../lib/moq"
import { useMediaSupport, usePublishAdapter, useWatchAdapter, type PublishState } from "../lib/moq-adapter"
import type { WatchState } from "../lib/moq-lifecycle"
import { Can } from "./can"
import { EmptyState } from "./states"
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Skeleton } from "@/components/ui/skeleton"
import { Slider } from "@/components/ui/slider"

function useRelay(role: "watch" | "publish", gameId: string) {
  const query = useQuery({ ...orpc.moq.config.queryOptions({ input: { role, gameId } }), refetchInterval: 40_000, refetchIntervalInBackground: true, staleTime: 0, retry: false })
  // A denied renewal releases media instead of retaining the last successful token.
  const data = query.isError ? undefined : query.data
  return { ...query, config: data?.url && data.token ? { url: data.url, token: data.token } : undefined }
}

function MediaError({ message, retry, testId }: { message: string; retry: () => unknown; testId?: string }) {
  return <Alert variant="destructive" data-testid={testId}>
    <AlertDescription>{message}</AlertDescription>
    <AlertAction><Button variant="outline" onClick={() => { void retry() }}>{m.push_retry()}</Button></AlertAction>
  </Alert>
}

function MediaLoading() {
  return <Card data-testid="moq-loading" aria-busy="true" aria-label={m.loading()}>
    <CardHeader><CardTitle>{m.loading()}</CardTitle></CardHeader>
    <CardContent><Skeleton className="aspect-video w-full" /></CardContent>
  </Card>
}

/** Use the installed preset unchanged; only the media rectangle has a fixed aspect ratio. */
function MediaFrame({ title, description, state, children, controls, "data-testid": testId, frameRef }: {
  title: string; description: string; state: WatchState | PublishState; children: ReactNode;
  controls: ReactNode; "data-testid": string; frameRef?: React.Ref<HTMLDivElement>;
}) {
  const labels = {
    idle: m.video_ready(), waiting: m.video_waiting(), connecting: m.video_connecting(),
    playing: m.video_playing(), paused: m.video_paused(), reconnecting: m.video_reconnecting(),
    ended: m.video_ended(), requesting: m.video_requesting(), broadcasting: m.video_on_air(),
    stopped: m.video_stopped(), error: m.video_failed(),
  }
  return <Card data-testid={testId} ref={frameRef}>
    <CardHeader>
      <CardTitle>{title}</CardTitle>
      <CardDescription>{description}</CardDescription>
      <div role="status" aria-live="polite" data-testid="moq-status"><Badge variant={state === "error" ? "destructive" : "secondary"}>{labels[state]}</Badge></div>
    </CardHeader>
    <CardContent className="flex flex-col gap-4">{children}</CardContent>
    <CardFooter className="flex flex-wrap gap-4">{controls}</CardFooter>
  </Card>
}

function SupportNotice({ support }: { support: NonNullable<ReturnType<typeof useMediaSupport>["support"]> }) {
  if (!support.video) return <Alert variant="destructive" data-testid="moq-unsupported"><AlertDescription>{m.video_unsupported()}</AlertDescription></Alert>
  if (!support.audio || support.fallback) return <Alert><AlertDescription>{!support.audio ? m.video_no_audio() : m.video_fallback()}</AlertDescription></Alert>
  return null
}

export function GameVideo({ gameId }: { gameId: string }) {
  const relay = useRelay("watch", gameId)
  if (relay.isPending) return <MediaLoading />
  if (relay.error) return <MediaError testId="moq-renewal-denied" message={formErrors(relay.error).form ?? m.video_not_permitted()} retry={relay.refetch} />
  if (!relay.config) return <EmptyState data-testid="moq-unconfigured">{m.video_not_configured()}</EmptyState>
  return <MoqWatcher key={gameId} gameId={gameId} name={broadcastName(gameId)} config={relay.config} />
}

export function MoqWatcher({ gameId, name, config, title = m.video_watch_heading(), description = m.video_watch_hint() }: { gameId?: string; name: string; config: MoqConfig; title?: string; description?: string }) {
  const capability = useMediaSupport("watch")
  const watch = useWatchAdapter(gameId)
  const frame = useRef<HTMLDivElement>(null)
  const { support } = capability
  if (capability.error) return <MediaError message={m.video_support_failed()} retry={capability.retry} />
  if (!support) return <MediaLoading />
  return <MediaFrame title={title} description={description} state={watch.state} data-testid="moq-watch" frameRef={frame}
    controls={<>
      <Button variant="outline" disabled={!support.video} data-testid="moq-play" onClick={() => watch.change({ paused: !watch.controls.paused })}>
        {watch.controls.paused ? <PlayIcon /> : <PauseIcon />}{watch.controls.paused ? m.video_play() : m.video_pause()}
      </Button>
      <Button variant="outline" disabled={!support.video || !support.audio} data-testid="moq-mute" onClick={() => watch.controls.muted ? void watch.enableAudio() : watch.change({ muted: true })}>
        {watch.controls.muted ? <VolumeXIcon /> : <Volume2Icon />}{watch.controls.muted ? m.video_unmute() : m.video_mute()}
      </Button>
      <Field className="min-w-32 flex-1">
        <FieldLabel id="video-volume-label">{m.video_volume()}</FieldLabel>
        <Slider aria-labelledby="video-volume-label" value={[watch.controls.volume * 100]} min={0} max={100} step={1} disabled={!support.video || !support.audio}
          onValueChange={value => watch.change({ volume: (Array.isArray(value) ? value[0] : value) / 100 })} />
      </Field>
      {document.fullscreenEnabled && <Button variant="outline" data-testid="moq-fullscreen" onClick={() => void watch.fullscreen(frame.current)}><MaximizeIcon />{m.video_fullscreen()}</Button>}
      {support.video && (watch.state === "connecting" || watch.state === "reconnecting" || watch.state === "ended") && <Button variant="outline" onClick={watch.retry}>{m.push_retry()}</Button>}
    </>}>
    <SupportNotice support={support} />
    <div className="moq-media">
      {support.video && <moq-watch key={watch.attempt} ref={watch.setElement} url={relayUrl(config)} name={name} muted>
        <canvas data-testid="moq-canvas" />
      </moq-watch>}
    </div>
    {(watch.audioBlocked || watch.controlError === "audio") && <Alert><AlertDescription>{m.video_audio_blocked()}</AlertDescription><AlertAction><Button onClick={() => void watch.enableAudio()}><MicIcon />{m.video_unmute()}</Button></AlertAction></Alert>}
    {watch.controlError === "fullscreen" && <MediaError message={m.video_fullscreen_failed()} retry={() => watch.fullscreen(frame.current)} />}
  </MediaFrame>
}

/** @answers BROADCAST_GAME */
export function GameBroadcast({ gameId }: { gameId: string }) {
  const relay = useRelay("publish", gameId)
  const game = useGame(gameId, { refetchInterval: 10_000 })
  if (relay.isPending) return <MediaLoading />
  if (relay.error) return <MediaError testId="moq-renewal-denied" message={formErrors(relay.error).form ?? m.video_not_permitted()} retry={relay.refetch} />
  if (!relay.config) return <EmptyState data-testid="moq-unconfigured">{m.video_not_configured()}</EmptyState>
  if (game.isPending) return <MediaLoading />
  return <Can of={game.data} action="BROADCAST_GAME" fallback={<EmptyState data-testid="moq-not-permitted">{m.video_not_permitted()}</EmptyState>}>
    <MoqPublisher key={gameId} gameId={gameId} name={broadcastName(gameId)} config={relay.config} />
  </Can>
}

function captureMessage(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") return m.video_capture_denied()
    if (error.name === "NotFoundError" || error.name === "NotReadableError") return m.video_capture_unavailable()
  }
  return formErrors(error).form ?? m.video_capture_failed()
}

export function MoqPublisher({ gameId, name, config, meeting = false, title = m.video_broadcast_heading(), description = m.video_broadcast_hint() }: { gameId?: string; name: string; config: MoqConfig; meeting?: boolean; title?: string; description?: string }) {
  const capability = useMediaSupport("publish")
  const { support } = capability
  const publish = usePublishAdapter({ gameId, name, frontCamera: meeting }, config, support?.audio ?? false)
  if (capability.error) return <MediaError message={m.video_support_failed()} retry={capability.retry} />
  if (!support) return <MediaLoading />
  const active = ["requesting", "connecting", "broadcasting", "reconnecting"].includes(publish.state)
  return <MediaFrame title={title} description={description} state={publish.state} data-testid="moq-publish"
    controls={<>{active ? <><Button variant="outline" onClick={publish.stop} data-testid="moq-stop"><SquareIcon />{m.video_stop()}</Button>
      {meeting && <Button variant="outline" disabled={!support.audio || publish.state === "requesting"} onClick={publish.mute} data-testid="moq-microphone">{publish.micMuted ? <MicOffIcon /> : <MicIcon />}{publish.micMuted ? m.meeting_unmute_mic() : m.meeting_mute_mic()}</Button>}
      {meeting && support.screen && <Button variant="outline" disabled={publish.state === "requesting"} onClick={() => publish.start("screen")} data-testid="moq-share-screen"><ScreenShareIcon />{m.video_start_screen()}</Button>}
      {meeting && <Button variant="outline" disabled={publish.state === "requesting" || !support.camera} onClick={() => publish.start("camera")} data-testid="moq-use-camera"><CameraIcon />{m.video_start_camera()}</Button>}
    </> : <>
      <Button disabled={!support.video || !support.camera} onClick={() => publish.start("camera")} data-testid="moq-start-camera"><CameraIcon />{m.video_start_camera()}</Button>
      {meeting && support.screen && <Button variant="outline" disabled={!support.video} onClick={() => publish.start("screen")} data-testid="moq-start-screen"><ScreenShareIcon />{m.video_start_screen()}</Button>}
    </>}</>}>
    <SupportNotice support={support} />
    <div className="moq-media"><video ref={publish.setPreview} data-testid="moq-preview" muted autoPlay playsInline /></div>
    {support.camera && <Field>
      <FieldLabel htmlFor="broadcast-camera">{m.video_camera()}</FieldLabel>
      <NativeSelect id="broadcast-camera" data-testid="moq-camera" className="w-full" value={publish.camera}
        disabled={!support.video || publish.state === "requesting"} onChange={event => publish.chooseCamera(event.target.value)}>
        <NativeSelectOption value="environment">{m.video_camera_rear()}</NativeSelectOption>
        <NativeSelectOption value="user">{m.video_camera_front()}</NativeSelectOption>
        {publish.cameras.map((camera, index) => <NativeSelectOption key={camera.deviceId} value={`device:${camera.deviceId}`}>{camera.label || m.video_camera_number({ number: index + 1 })}</NativeSelectOption>)}
      </NativeSelect>
      <FieldDescription>{publish.cameraLabel || (publish.cameras.length === 0 ? m.video_camera_permission() : "")} {m.video_camera_switch_hint()}</FieldDescription>
    </Field>}
    {publish.error != null && <Alert variant="destructive" data-testid="moq-broadcast-error"><AlertDescription>{captureMessage(publish.error)}</AlertDescription></Alert>}
  </MediaFrame>
}
