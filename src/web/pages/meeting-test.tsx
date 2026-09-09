/** Two-person Hang experiment. No meeting records, game grants or game presence. */
import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { PageHeader, PageInner } from "../components/page"
import { MoqPublisher, MoqWatcher } from "../components/moq-video"
import { ButtonLink } from "../components/button-link"
import { Loading, EmptyState } from "../components/states"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { orpc } from "../lib/orpc"
import { useSession } from "../lib/session"
import { formErrors } from "../lib/form-errors"
import { m } from "../lib/i18n"
import { routeHref, signInRoute, type Route } from "../lib/router"

export function MeetingTestPage({ route, goto }: { route: Route; goto: (route: Route) => void }) {
  return <>
    <PageHeader title={m.meeting_test_title()} />
    <PageInner>
      {__BUILD__.environment !== "dev" ? <EmptyState>{m.meeting_test_dev_only()}</EmptyState> :
        <MeetingLobby key={`${route.id ?? ""}:${route.query?.seat ?? "a"}`} route={route} goto={goto} />}
    </PageInner>
  </>
}

function MeetingLobby({ route, goto }: { route: Route; goto: (route: Route) => void }) {
  const { user, loading } = useSession()
  const [joined, setJoined] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const room = route.id ?? ""
  const seat = route.query?.seat === "b" ? "b" : "a"
  const valid = /^[a-f0-9]{32}$/.test(room) && (!route.query?.seat || ["a", "b"].includes(route.query.seat))
  const relay = useQuery({
    ...orpc.moq.meetingConfig.queryOptions({ input: { room, seat } }),
    enabled: valid && joined && !!user,
    refetchInterval: joined ? 40_000 : false, refetchIntervalInBackground: true,
    staleTime: 0, retry: false, gcTime: 0,
  })
  const create = () => goto({ page: "meeting-test", id: crypto.randomUUID().replaceAll("-", ""), query: { seat: "a" } })
  const invite = valid ? new URL(routeHref({ page: "meeting-test", id: room, query: { seat: seat === "a" ? "b" : "a" } }), window.location.href).href : ""
  const copy = async () => {
    try { await navigator.clipboard.writeText(invite); setCopied(true); setCopyError(false) }
    catch { setCopyError(true) }
  }
  // A denied renewal removes both engines immediately, including local capture.
  const config = !relay.isError ? relay.data : undefined
  if (loading) return <Loading />
  if (!user) return <Card><CardHeader><CardTitle>{m.meeting_test_title()}</CardTitle><CardDescription>{m.meeting_test_sign_in()}</CardDescription></CardHeader><CardFooter>
    <ButtonLink href={routeHref(signInRoute(route))}>{m.sign_in()}</ButtonLink>
  </CardFooter></Card>
  return <div className="flex flex-col gap-4">
    <Card data-testid="meeting-lobby">
      <CardHeader><CardTitle>{m.meeting_test_title()}</CardTitle><CardDescription>{m.meeting_test_experiment()}</CardDescription></CardHeader>
      {valid && <CardContent><Field>
        <FieldLabel htmlFor="meeting-invite">{m.meeting_test_invite()}</FieldLabel>
        <Input id="meeting-invite" readOnly value={invite} onFocus={event => event.target.select()} />
        <FieldDescription>{m.meeting_test_invite_hint()}</FieldDescription>
      </Field></CardContent>}
      <CardFooter className="flex flex-wrap gap-3">
        {!valid ? <Button onClick={create} data-testid="meeting-create">{m.meeting_test_create()}</Button> : <>
          <Button variant="outline" onClick={() => void copy()}>{copied ? m.meeting_test_copied() : m.meeting_test_copy()}</Button>
          <Button onClick={() => setJoined(!joined)} data-testid="meeting-join">{joined ? m.meeting_test_leave() : m.meeting_test_join()}</Button>
        </>}
      </CardFooter>
    </Card>
    {copyError && <Alert><AlertDescription>{m.meeting_test_copy_failed()}</AlertDescription></Alert>}
    {joined && relay.isPending && <Loading />}
    {joined && relay.isError && <Alert variant="destructive"><AlertDescription>{formErrors(relay.error).form ?? m.meeting_test_connect_failed()}</AlertDescription><Button variant="outline" onClick={() => void relay.refetch()}>{m.push_retry()}</Button></Alert>}
    {joined && config === null && <EmptyState>{m.video_not_configured()}</EmptyState>}
    {joined && config && <div className="grid gap-4 lg:grid-cols-2" data-testid="meeting-media">
      <MoqPublisher name={config.publish.name} config={config.publish} meeting title={m.meeting_test_you()} description={m.meeting_test_local_hint()} />
      <MoqWatcher name={config.watch.name} config={config.watch} title={m.meeting_test_peer()} description={m.meeting_test_peer_hint()} />
    </div>}
  </div>
}
