import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, orpc } from "../lib/orpc";
import { m } from "../lib/i18n";
import { useSession } from "../lib/session";
import { parseRoute, signInRoute, routeHref } from "../lib/router";
import { PageHeader, PageInner, SectionHeading, Muted } from "../components/page";
import { EmptyState, Loading } from "../components/states";
import { QueryError } from "../components/query-error";
import { ButtonLink } from "../components/button-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { PeoplePicker, type Person } from "../components/people-picker";

/**
 * @answers CREATE_MEETING, RESPOND_TO_MEETING_INVITE
 *
 * Meetings: anyone may ask anyone, and you decide.
 *
 * Two lists, because they are two different questions. *Invitations* is what
 * somebody wants from you and needs an answer; *Yours* is what you are already
 * in. A declined meeting leaves both — it is not deleted, and the room stays
 * open if you change your mind, which is the Product Owner's rule that the
 * invitee decides rather than the door being locked.
 *
 * docs/2026-09-09-13-meetings.md.
 */
export function MeetingsPage() {
  const { user, loading } = useSession();
  const qc = useQueryClient();
  const q = useQuery({ ...orpc.meetings.mine.queryOptions(), enabled: Boolean(user) });

  const respond = useMutation({
    mutationFn: (args: { meetingId: string; statusCode: "ACCEPTED" | "DECLINED" }) => api.meetings.respond(args),
    onSuccess: () => qc.invalidateQueries({ queryKey: orpc.meetings.mine.key() }),
  });

  if (loading) return <PageInner><Loading /></PageInner>;
  if (!user) {
    return (
      <PageInner>
        <EmptyState data-testid="meetings-signed-out">
          <p>{m.meetings_sub()}</p>
          <ButtonLink href={routeHref(signInRoute(parseRoute(window.location.hash)))}>{m.sign_in()}</ButtonLink>
        </EmptyState>
      </PageInner>
    );
  }

  const all = q.data?.meetings ?? [];
  const invitations = all.filter((mt) => mt.myStatusCode === "INVITED");
  const yours = all.filter((mt) => mt.myStatusCode !== "INVITED");

  const row = (mt: (typeof all)[number], invitation: boolean) => (
    <Item variant="outline" size="sm" key={mt.id} data-testid={`meeting-${mt.id}`}>
      <ItemContent>
        <ItemTitle>{mt.title}</ItemTitle>
        <ItemDescription>
          {[
            m.meeting_from({ name: mt.createdByName }),
            m.meeting_people_count({ count: mt.participants.length }),
          ].join(" · ")}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        {invitation ? (
          <>
            <Button
              size="sm"
              disabled={respond.isPending}
              onClick={() => respond.mutate({ meetingId: mt.id, statusCode: "ACCEPTED" })}
              data-testid={`accept-${mt.id}`}
            >
              {m.meeting_accept()}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={respond.isPending}
              onClick={() => respond.mutate({ meetingId: mt.id, statusCode: "DECLINED" })}
              data-testid={`decline-${mt.id}`}
            >
              {m.meeting_decline()}
            </Button>
          </>
        ) : (
          <>
            {mt.myStatusCode === "DECLINED" && (
              <Badge variant="outline">{m.meeting_declined()}</Badge>
            )}
            <ButtonLink variant="outline" href={routeHref({ page: "meeting", id: mt.id })}>
              {m.meeting_open()}
            </ButtonLink>
          </>
        )}
      </ItemActions>
    </Item>
  );

  return (
    <div data-testid="meetings-page">
      <PageHeader title={m.meetings()} sub={m.meetings_sub()}>
        <div className="mt-3">
          <NewMeeting onCreated={() => qc.invalidateQueries({ queryKey: orpc.meetings.mine.key() })} />
        </div>
      </PageHeader>
      <PageInner className="flex flex-col gap-6">
        <QueryError error={q.error} retry={q.refetch} pending={q.isFetching} />
        {q.isPending && <Loading />}

        {invitations.length > 0 && (
          <section>
            <SectionHeading title={m.meeting_invitations()} className="mt-0" />
            <ItemGroup data-testid="meeting-invitations">{invitations.map((mt) => row(mt, true))}</ItemGroup>
          </section>
        )}

        <section>
          <SectionHeading title={m.meeting_yours()} className="mt-0" />
          {yours.length ? (
            <ItemGroup data-testid="meeting-yours">{yours.map((mt) => row(mt, false))}</ItemGroup>
          ) : (
            !q.isPending && <EmptyState data-testid="meetings-none">{m.meeting_none()}</EmptyState>
          )}
        </section>
      </PageInner>
    </div>
  );
}

/**
 * Starting one: a title and the people.
 *
 * The people are the registry's `Combobox` in `multiple` + `inline` mode: the
 * chips are who is coming, typing narrows the list, and the list is part of the
 * dialog rather than a popup layered over it — on a phone that popup would
 * cover the form it belongs to.
 *
 * The first version was `Checkbox` rows, on the reasoning that a list you can
 * scan is honest. It is, at twenty accounts. `meetings.people` returns *every*
 * account with no restriction, so the control has to survive the day that list
 * is a thousand long, and scrolling a thousand checkboxes to find one coach is
 * not a thing anybody does twice. Filtering, keyboard navigation and the
 * announcement of how many matches remain are Base UI's, not ours — writing a
 * search box over a filtered `.map()` is the wheel this repo does not reinvent.
 */
function NewMeeting({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [picked, setPicked] = useState<Person[]>([]);
  const people = useQuery({ ...orpc.people.list.queryOptions(), enabled: open });

  const create = useMutation({
    mutationFn: () => api.meetings.create({ title, userIds: picked.map((p) => p.id) }),
    onSuccess: () => {
      setOpen(false);
      setTitle("");
      setPicked([]);
      onCreated();
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button data-testid="meeting-new" />}>{m.meeting_new()}</DialogTrigger>
      <DialogContent data-testid="meeting-form">
        <DialogHeader>
          <DialogTitle>{m.meeting_new()}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Field orientation="vertical">
            <FieldLabel htmlFor="meeting-title">{m.meeting_title_label()}</FieldLabel>
            <Input
              id="meeting-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              data-testid="meeting-title"
            />
          </Field>
          <Field orientation="vertical">
            <FieldLabel htmlFor="meeting-people-search">{m.meeting_people_label()}</FieldLabel>
            {people.isPending ? (
              <Loading />
            ) : (
              <PeoplePicker
                id="meeting-people-search"
                people={people.data?.people ?? []}
                value={picked}
                onValueChange={setPicked}
                placeholder={m.meeting_search()}
                data-testid="meeting-people"
              />
            )}
          </Field>
          {create.isError && <Muted data-testid="meeting-error">{create.error.message}</Muted>}
          {!picked.length && <Muted>{m.meeting_pick_someone()}</Muted>}
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>{m.cancel()}</DialogClose>
          <Button
            disabled={!title.trim() || !picked.length || create.isPending}
            onClick={() => create.mutate()}
            data-testid="meeting-send"
          >
            {m.meeting_send()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
