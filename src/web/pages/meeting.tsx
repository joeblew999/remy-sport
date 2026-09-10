import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { orpc } from "../lib/orpc";
import { m } from "../lib/i18n";
import { useSession } from "../lib/session";
import { parseRoute, routeHref, signInRoute, type Route } from "../lib/router";
import { PageHeader, PageInner, Muted } from "../components/page";
import { EmptyState, Loading } from "../components/states";
import { ButtonLink } from "../components/button-link";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MoqPublisher, MoqWatcher } from "../components/moq-video";

/**
 * @answers RESPOND_TO_MEETING_INVITE
 *
 * The room: you, and everyone else who is in this meeting.
 *
 * The media is the same publisher and watcher the dev two-seat test proved —
 * this is the feature that test was proving the transport for. What differs is
 * that the room is a stored meeting, your seat is your own user id, and the
 * people you may watch come from `meeting_participant` rather than from being
 * the only other letter of the alphabet.
 *
 * Joining is explicit. A page that opened a camera on arrival would be a
 * surprise, and the credentials are only minted once you ask.
 * docs/done/2026-09-09-13-meetings.md.
 */
export function MeetingPage({ route }: { route: Route }) {
  const { user, loading } = useSession();
  const [joined, setJoined] = useState(false);
  const meetingId = route.id ?? "";

  const mine = useQuery({ ...orpc.meetings.mine.queryOptions(), enabled: Boolean(user) });
  const meeting = mine.data?.meetings.find((x) => x.id === meetingId);

  const relay = useQuery({
    ...orpc.moq.meetingRoom.queryOptions({ input: { meetingId } }),
    enabled: Boolean(user) && joined && Boolean(meetingId),
    // The token is short-lived, so it is renewed while the room is open —
    // the same cadence the two-seat test uses.
    refetchInterval: joined ? 40_000 : false,
    refetchIntervalInBackground: true,
    staleTime: 0,
    retry: false,
    gcTime: 0,
  });

  if (loading) return <PageInner><Loading /></PageInner>;
  if (!user) {
    return (
      <PageInner>
        <EmptyState data-testid="meeting-signed-out">
          <p>{m.meetings_sub()}</p>
          <ButtonLink href={routeHref(signInRoute(parseRoute(window.location.hash)))}>{m.sign_in()}</ButtonLink>
        </EmptyState>
      </PageInner>
    );
  }

  const config = relay.isError ? undefined : relay.data;
  return (
    <div data-testid="meeting-page">
      <PageHeader
        crumbs={[{ label: m.meetings(), href: routeHref({ page: "meetings" }) }]}
        title={meeting?.title ?? m.meetings()}
        sub={meeting ? meeting.participants.map((p) => p.name).join(" · ") : undefined}
      >
        <div className="mt-3">
          <Button onClick={() => setJoined(!joined)} data-testid="meeting-join">
            {joined ? m.meeting_leave() : m.meeting_join()}
          </Button>
        </div>
      </PageHeader>
      <PageInner className="flex flex-col gap-4">
        {mine.isPending && <Loading />}
        {!mine.isPending && !meeting && <EmptyState data-testid="meeting-not-found">{m.meeting_not_found()}</EmptyState>}
        {joined && relay.isPending && <Loading />}
        {joined && relay.isError && (
          <Alert variant="destructive" data-testid="meeting-failed">
            <AlertDescription>{m.meeting_connect_failed()}</AlertDescription>
          </Alert>
        )}
        {joined && config === null && <EmptyState>{m.video_not_configured()}</EmptyState>}
        {joined && config && (
          <div className="grid gap-4 lg:grid-cols-2" data-testid="meeting-media">
            <MoqPublisher name={config.publish.name} config={config.publish} meeting title={m.meeting_you()} description={m.meeting_local_hint()} />
            {config.watch.map((w) => (
              // Named, because a room can hold more than two people: "the other
              // participant" is the two-seat test's sentence and says nothing
              // about which of four tiles is still dark.
              <MoqWatcher key={w.name} name={w.name} config={w} title={w.who} description={m.meeting_waiting({ name: w.who })} />
            ))}
            {!config.watch.length && <Muted data-testid="meeting-alone">{m.meeting_alone()}</Muted>}
          </div>
        )}
      </PageInner>
    </div>
  );
}
