import { QueryError, isNotFound } from "../components/query-error";
import { useState } from "react";
import { Share2Icon } from "lucide-react";
import { EventSettings } from "../components/event-settings";
import { EventVenues } from "../components/event-venues";
import { EventDivisions } from "../components/event-divisions";
import { EventSessions } from "../components/event-sessions";
import { EventPlayers } from "../components/event-players";
import { downloadICS } from "../lib/calendar";
import { FollowButton } from "../components/follow";
import { Schedule, AddFixture } from "../components/schedule";
import { Entries } from "../components/entries";
import { PageHeader, PageInner, Row, RowGroup, SectionHeading } from "../components/page";
import { EmptyState, Loading } from "../components/states";
import { StatusBadge } from "../components/status-badge";
import { useEntries, useEvent, useGames, useStandings } from "../lib/data";
import type { Event } from "../data";
import { routeHref, type Route } from "../lib/router";
import { useLocale } from "../lib/locale";
import { m } from "../lib/i18n";
import { CourtBoard } from "../components/court-board";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Card, CardContent } from "@/components/ui/card";
import { ItemContent, ItemDescription } from "@/components/ui/item";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type EventTab = "games" | "standings" | "teams" | "players" | "places" | "sessions" | "about" | "manage";

/** @answers VIEW_EVENT, VIEW_FIXTURE_SCHEDULE, VIEW_GAME_RESULTS, VIEW_STANDINGS, VIEW_RANK_MOVEMENT, VIEW_SEASON_RECORDS */
export function EventPage({ id, goto, spoiler, query = {}, setParam }: {
  id?: string; goto: (r: Route) => void; spoiler: boolean;
  query?: Record<string, string>; setParam: (key: string, value: string | null) => void;
}) {
  const eventQuery = useEvent(id);
  const { data: e, isPending } = eventQuery;
  const entries = useEntries(id);
  const { data: games } = useGames(id);
  if (eventQuery.error && !e && !isNotFound(eventQuery.error)) return <PageInner><QueryError error={eventQuery.error} retry={eventQuery.refetch} pending={eventQuery.isFetching} /></PageInner>;
  if (id && isPending) return <PageInner><Loading>{m.loading_event()}</Loading></PageInner>;
  if (!id || !e) return <PageInner><EmptyState data-testid="not-found"><p>{m.not_found_event()}</p><a href={routeHref({ page: "discover" })}>{m.back_to_discover()}</a></EmptyState></PageInner>;
  const camp = e.typeCode === "CAMP";
  const canManage = e.can.EDIT_EVENT || e.can.MANAGE_DIVISIONS;
  const tabs: [EventTab, string][] = [
    ...(camp ? [["sessions", m.event_sessions()]] : [["games", m.games()], ["standings", m.nav_standings()], ["teams", m.tab_teams()]]) as [EventTab, string][],
    ...((camp || e.typeCode === "SHOWCASE") ? [["players", m.tab_players()]] : []) as [EventTab, string][],
    ["places", m.event_places()], ["about", m.event_about()],
    ...(canManage ? [["manage", m.event_manage()]] : []) as [EventTab, string][],
  ];
  const aliases: Record<string, EventTab> = { overview: "games", schedule: "games", courts: "places", venues: "places", rules: "about", divisions: "manage", settings: "manage" };
  const requested = aliases[query.tab ?? ""] ?? query.tab;
  const tab = tabs.find(([key]) => key === requested)?.[0] ?? tabs[0]![0];
  const division = entries.data?.divisions.find(d => d.id === query.division)?.id;
  const divisionInvalid = !!query.division && !!entries.data && !division;
  const total = games?.games.length ?? 0;
  const played = games?.games.filter(g => g.statusCode === "FINISHED").length ?? 0;
  const changeTab = (tab: EventTab) => setParam("tab", tab);
  return <div data-testid="event-page">
    <PageHeader
      data-testid="event-hero"
      crumbs={[{ label: m.nav_discover(), href: routeHref({ page: "discover" }) }]}
      aside={<StatusBadge status={e.status} data-testid="event-status">{e.statusLabel}</StatusBadge>}
      title={e.title}
      sub={`${e.date} · ${e.venue} · ${e.city}`}
    >
      {/* One row that never wraps and scrolls when it must — the phone plan's
          rule — as the registry's ButtonGroup. */}
      <div className="mt-4 overflow-x-auto">
        <ButtonGroup data-testid="event-actions">
          {e.status !== "closed" && <Button variant="outline" data-testid="hero-register" onClick={() => changeTab(camp || e.typeCode === "SHOWCASE" ? "players" : "teams")}>{camp || e.typeCode === "SHOWCASE" ? m.tab_players() : m.register_team()}</Button>}
          <FollowButton objectTypeCode="EVENT" objectId={e.id}/>
          {e.startDate && <Button variant="outline" data-testid="add-to-calendar" onClick={() => downloadICS({ id: e.id, title: e.title, startDate: e.startDate, endDate: e.endDate, location: [e.venue, e.city].join(", "), url: `${location.origin}/#/event/${e.id}` })}>{m.add_to_calendar()}</Button>}
          <ShareButton title={e.title}/>
        </ButtonGroup>
      </div>
    </PageHeader>
    {/* Sticky at the top of the page's scroller while the header scrolls away
        (the phone plan's other rule) — on the Tabs root, because a sticky
        element only moves within its parent, and the list's parent is the
        root. The list scrolls sideways when the tabs are wider than the
        screen. */}
    <Tabs value={tab} onValueChange={(next) => changeTab(next as EventTab)} className="sticky top-0 z-10 gap-0 bg-background">
      <TabsList variant="line" aria-label={m.nav_event()} className="h-auto w-full justify-start overflow-x-auto rounded-none border-b px-4 sm:px-8">
        {tabs.map(([key, title]) => (
          <TabsTrigger key={key} value={key} className="flex-none" data-testid={`tab-${key}`} aria-current={tab === key ? "page" : undefined}>{title}</TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
    {!camp && ["games", "standings", "teams"].includes(tab) && (
      <PageInner className="flex flex-wrap items-center gap-3 border-b py-4 pb-4" data-testid="event-filters">
        <Label htmlFor="event-division">{m.division()}</Label>
        <NativeSelect id="event-division" data-testid="event-division" className="min-w-0 flex-1 sm:flex-none" value={division ?? ""} onChange={event => setParam("division", event.target.value || null)}>
          <NativeSelectOption value="">{m.all_divisions()}</NativeSelectOption>
          {entries.data?.divisions.map(d => <NativeSelectOption key={d.id} value={d.id}>{d.division}</NativeSelectOption>)}
        </NativeSelect>
        {divisionInvalid && <span role="status" className="text-sm text-muted-foreground">{m.invalid_division()}</span>}
      </PageInner>
    )}
    {tab === "games" && <PageInner className="flex flex-col gap-4">
      {total > 0 && <p className="text-muted-foreground" data-testid="event-progress">{m.event_progress({ played, total })}</p>}
      <Schedule eventId={e.id} can={e.can} spoiler={spoiler} goto={goto} divisionId={division}/>
      <AddFixture eventId={e.id} can={e.can} timezone={e.timezone}/>
    </PageInner>}
    {tab === "standings" && <PageInner><StandingsTable eventId={e.id} divisionId={division} spoiler={spoiler}/></PageInner>}
    {tab === "teams" && <PageInner className="flex flex-col gap-4"><Entries eventId={e.id} divisionId={division}/></PageInner>}
    {tab === "players" && <PageInner><EventPlayers eventId={e.id}/></PageInner>}
    {tab === "sessions" && <PageInner><EventSessions eventId={e.id} can={e.can} timezone={e.timezone}/></PageInner>}
    {tab === "places" && <PageInner className="flex flex-col gap-6"><CourtBoard eventId={e.id} spoiler={spoiler} courtId={query.court}/><EventVenues eventId={e.id} venueId={query.venue}/></PageInner>}
    {tab === "about" && <PageInner className="flex flex-col gap-6">
      <div className="flex flex-col gap-2"><p>{m.organised_by({ name: e.organizer })}</p><p className="text-muted-foreground">{e.division} · {m.teams()}: {e.teamCount} · {m.venue_count()}: {e.venueCount} · {m.followers()}: {e.followerCount}</p></div>
      <EventRules event={e}/>
    </PageInner>}
    {tab === "manage" && <PageInner className="flex flex-col gap-6">
      {!camp && e.can.MANAGE_DIVISIONS && <EventDivisions eventId={e.id} can={e.can}/>}
      {e.can.EDIT_EVENT && <EventSettings key={e.id} event={e}/>}
    </PageInner>}
  </div>;
}

/** Rank values are computed inside divisions by the API, never renumbered by a UI filter. */
export function StandingsTable({ eventId, divisionId, spoiler = false }: { eventId?: string; divisionId?: string; spoiler?: boolean }) {
  const { data, isPending } = useStandings(eventId);
  if (isPending) return <Loading />;
  const rows = (data ?? []).filter(s => !divisionId || s.divisionId === divisionId);
  if (!rows.length) return <EmptyState data-testid="standings-empty">{m.standings_empty()}</EmptyState>;
  if (spoiler) return <p>{m.spoiler_hidden()}</p>;
  const groups = Map.groupBy(rows, row => row.divisionId);
  const right = "text-right";
  const wide = "hidden text-right sm:table-cell";
  return <div className="flex flex-col gap-6" data-testid="standings">
    {[...groups].map(([key, group]) => <section key={key ?? "unassigned"}>
      <SectionHeading className="mt-0 mb-3" title={group[0]?.division ?? m.division_unassigned()} />
      <Table className="tabular-nums">
        <TableHeader><TableRow>
          <TableHead className={right}>{m.rank_label()}</TableHead>
          <TableHead>{m.team()}</TableHead>
          <TableHead className={right}>{m.col_won()}</TableHead>
          <TableHead className={right}>{m.col_lost()}</TableHead>
          <TableHead className={wide}>{m.col_points_for()}</TableHead>
          <TableHead className={wide}>{m.col_points_against()}</TableHead>
          <TableHead className={wide}>±</TableHead>
          <TableHead className={right}>{m.col_points()}</TableHead>
        </TableRow></TableHeader>
        <TableBody>{group.map(s => <TableRow key={s.teamId} data-testid={`standing-${s.teamId}`}>
          <TableCell className={right}>#{s.rank}{s.movement !== null && s.movement !== 0 && <span data-testid={`movement-${s.teamId}`} title={m.rank_movement_note()}>{s.movement > 0 ? " ▲" : " ▼"}{Math.abs(s.movement)}</span>}</TableCell>
          <TableCell className="min-w-[150px] font-medium whitespace-normal"><a className="hover:underline" href={routeHref({ page: "team", id: s.teamId })}>{s.team}</a></TableCell>
          <TableCell className={right}>{s.won}</TableCell>
          <TableCell className={right}>{s.lost}</TableCell>
          <TableCell className={wide}>{s.pointsFor}</TableCell>
          <TableCell className={wide}>{s.pointsAgainst}</TableCell>
          <TableCell className={wide}>{s.pointsDiff > 0 ? "+" : ""}{s.pointsDiff}</TableCell>
          <TableCell className={right}>{s.leaguePoints}</TableCell>
        </TableRow>)}</TableBody>
      </Table>
    </section>)}
    <p className="text-sm text-muted-foreground">{m.rank_movement_note()}</p>
  </div>;
}

/**
 * Share this page.
 *
 * `navigator.share` where the browser has it — on a phone that is the system
 * sheet, which is what somebody means when they press Share — and the clipboard
 * everywhere else, with a word to say it worked. A copy with no feedback is
 * indistinguishable from a button that does nothing, which is what this
 * replaced.
 *
 * An `AbortError` is the person changing their mind, not a failure, so the
 * catch is silent rather than apologetic.
 */
function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Dismissed, or a clipboard the browser will not give us. Neither is
      // worth an error message about a link.
    }
  };

  return (
    <Button variant="outline" data-testid="share" onClick={() => void share()}>
      <Share2Icon data-icon="inline-start" />
      {copied ? m.share_copied() : m.share()}
    </Button>
  );
}

/**
 * The terms the competition is played under.
 *
 * This tab said "not built yet" while three columns on `event` said exactly
 * this and were rendered nowhere at all: `formatCode` — whether it is 5-on-5 or
 * 3x3, which changes what a team even is — `isFibaCertified`, which decides
 * whether a result counts for anything outside this app, and `description`,
 * which is what the organiser wrote about their own tournament.
 *
 * Nothing here needed building. The page had never asked for any of it.
 *
 * The format reads from the reference vocabulary, so "5-on-5" and "5 ต่อ 5" are
 * the same row rather than two strings in a component.
 */
function EventRules({ event }: { event: Event }) {
  const { label } = useLocale();
  return (
    <>
      <Card data-testid="event-rules">
        <CardContent>
          <RowGroup boxed={false}>
            <Row className="px-0">
              <ItemContent><ItemDescription>{m.event_format()}</ItemDescription></ItemContent>
              <span data-testid="event-format">{label("eventFormats", event.formatCode)}</span>
            </Row>
            <Row className="px-0">
              <ItemContent><ItemDescription>{m.event_fiba()}</ItemDescription></ItemContent>
              {/* A certified event is a fact worth stating and an uncertified one
                  is not an absence — most school tournaments are not certified and
                  saying nothing would read as "we did not check". */}
              <span data-testid="event-fiba">{event.isFibaCertified ? m.yes() : m.no()}</span>
            </Row>
          </RowGroup>
        </CardContent>
      </Card>

      <section>
        <SectionHeading title={m.event_about()} className="mt-0" />
        <Card>
          {event.description ? (
            <CardContent><p className="max-w-[68ch] leading-relaxed" data-testid="event-description">{event.description}</p></CardContent>
          ) : (
            <EmptyState className="border-0" data-testid="event-no-details">{m.event_no_details()}</EmptyState>
          )}
        </Card>
      </section>
    </>
  );
}
