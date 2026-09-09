import { ChevronRightIcon } from "lucide-react";
import { CreateEvent } from "../components/create-event";
import { PlatformCan } from "../components/can";
import { PageHeader, PageInner } from "../components/page";
import { EmptyState, Loading } from "../components/states";
import { StatusBadge } from "../components/status-badge";
import { ButtonLink } from "../components/button-link";
import { useEvents, useLiveGames } from "../lib/data";
import { routeHref, type Route } from "../lib/router";
import { m } from "../lib/i18n";
import { useLocale } from "../lib/locale";
import type { EventStatus, EventType } from "../data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

interface DiscoverProps {
  goto: (r: Route) => void;
  spoiler: boolean;
  /** The filters, from the address bar. See `Route.query` in lib/router.tsx. */
  query: Record<string, string> | undefined;
  setParam: (key: string, value: string | null) => void;
}

// No "open" tab: nothing can have that status — see src/web/data.ts.
type Tab = "all" | "live" | "upcoming" | "closed";
const TABS: Tab[] = ["all", "live", "upcoming", "closed"];

/**
 * @answers BROWSE_EVENTS, VIEW_RESULTS_ARCHIVE
 *
 * The Past tab is the archive — finished events with their results, which is
 * what a results archive is. A separate screen would be a second home for it.
 */
export function DiscoverPage({ goto, spoiler, query, setParam }: DiscoverProps) {
  const { locale, reference, name, label } = useLocale();

  /**
   * Every filter reads from the address bar, and nothing here holds state.
   *
   * `main.tsx` renders `<App key={locale}>`, so a language switch remounts the
   * whole tree — which used to reset all four of these to nothing while the
   * chips carried on looking selected. The hash survives the remount, and a
   * filtered view becomes a link somebody can send.
   */
  const tab = (query?.tab as Tab | undefined) ?? "all";
  const filterCity = query?.city ?? null;
  const filterProvince = query?.province ?? null;
  const filterType = (query?.type as EventType | undefined) ?? null;
  const setTab = (next: Tab) => setParam("tab", next === "all" ? null : next);
  const setFilterCity = (next: string | null) => setParam("city", next);
  const setFilterProvince = (next: string | null) => setParam("province", next);
  const setFilterType = (next: EventType | null) => setParam("type", next);
  const { data, isPending, error } = useEvents();
  const allEvents = data ?? [];

  let events = allEvents;
  if (tab !== "all") events = events.filter(e => e.status === (tab as EventStatus));
  // By code, not by the label this compared before. A filter holds an identity,
  // and `e.city` is a display string that changes with the reader's language —
  // so the stored value and the row's value were the same thing written two
  // ways, and only agreed by accident of locale. (It is not what broke the
  // filter on a language switch; that was the remount, fixed above.)
  if (filterCity) events = events.filter(e => e.cityCode === filterCity);
  if (filterProvince) events = events.filter(e => e.provinceCode === filterProvince);
  if (filterType) events = events.filter(e => e.typeCode === filterType);

  const counts: Record<Tab, number> = {
    all: allEvents.length,
    live: allEvents.filter(e => e.status === "live").length,
    upcoming: allEvents.filter(e => e.status === "upcoming").length,
    closed: allEvents.filter(e => e.status === "closed").length,
  };
  const tabLabel: Record<Tab, string> = {
    all: m.tab_all(), live: m.tab_live(), upcoming: m.tab_upcoming(), closed: m.tab_past(),
  };

  // From /api/reference, in the reader's language. This was four hardcoded
  // English labels — the kind of second copy of the PO's vocabulary that ADR
  // 015 exists to stop, and one a Thai reader could never see translated.
  /** A type's name in the reader's language, falling back to its code. */
  const typeLabel = (code: string) =>
    name(reference?.eventTypes.find((t) => t.code === code)?.names, code);

  const CITIES = (reference?.cities ?? []).map((c) => ({
    code: c.code,
    label: name(c.names, c.nameEn),
  }));

  const TYPES = (reference?.eventTypes ?? []).map((t) => ({
    label: name(t.names, t.nameEn),
    key: t.code as EventType,
  }));

  /**
   * Provinces that actually have an event, with how many.
   *
   * Not all 77 — the model defines every province in Thailand, and offering a
   * reader seventy-four choices that return nothing is worse than offering
   * none. This is the same reason the city chips are filtered upstream, and the
   * same reason the count is on the option: a filter that can empty the page
   * should say so before it is clicked.
   */
  const PROVINCES = (() => {
    const counts = new Map<string, number>();
    for (const e of allEvents) {
      if (e.provinceCode) counts.set(e.provinceCode, (counts.get(e.provinceCode) ?? 0) + 1);
    }
    return [...counts]
      .map(([code, count]) => ({ code, count, label: label("provinces", code) || code }))
      .sort((a, b) => a.label.localeCompare(b.label, locale));
  })();

  return (
    <>
      <PageHeader
        crumbs={[{ label: m.nav_home() }, { label: m.nav_discover() }]}
        title={m.discover_heading()}
        sub={m.discover_sub()}
        subLang={locale === "th" ? "th" : undefined}
      />

      <PlatformCan action="CREATE_EVENT">
        <PageInner className="pb-0">
          <Collapsible data-testid="discover-create-event">
            <CollapsibleTrigger render={<Button variant="outline" data-testid="discover-create-event-toggle" />}>
              {m.create_event()}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4">
              <CreateEvent onCreated={(id) => goto({ page: "event", id })} />
            </CollapsibleContent>
          </Collapsible>
        </PageInner>
      </PlatformCan>

      <LiveBanner goto={goto} spoiler={spoiler}/>

      <PageInner className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <Tabs value={tab} onValueChange={(next) => setTab(next as Tab)}>
            <TabsList variant="line" aria-label={m.status()} className="w-full justify-start overflow-x-auto lg:w-fit">
              {TABS.map(id => (
                <TabsTrigger key={id} value={id} className="flex-none" data-testid={`discover-tab-${id}`}>
                  {tabLabel[id]}
                  <Badge variant="secondary" className="tabular-nums">{counts[id]}</Badge>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {/* One chip per type and per city, from /api/reference in the
              reader's language. This was five city names typed here, three of
              which the PO has never defined. The province is a select rather
              than chips: the model defines 77 provinces, and a row of chips is
              a control for five things, not for seventy. Native, so the phone
              keeps its picker. */}
          <div className="flex min-w-0 flex-wrap items-center gap-2" data-testid="event-filters">
            <ToggleGroup
              variant="outline"
              aria-label={m.type()}
              value={filterType ? [filterType] : []}
              onValueChange={(groupValue: unknown[]) => setFilterType((groupValue.at(-1) as EventType | undefined) ?? null)}
            >
              {TYPES.map(t => (
                <ToggleGroupItem key={t.key} value={t.key} className="whitespace-nowrap" data-testid={`filter-type-${t.key}`}>{t.label}</ToggleGroupItem>
              ))}
            </ToggleGroup>
            <ToggleGroup
              variant="outline"
              aria-label={m.venue()}
              value={filterCity ? [filterCity] : []}
              onValueChange={(groupValue: unknown[]) => setFilterCity((groupValue.at(-1) as string | undefined) ?? null)}
            >
              {CITIES.map(c => (
                <ToggleGroupItem key={c.code} value={c.code} className="whitespace-nowrap" data-testid={`filter-city-${c.code}`}>{c.label}</ToggleGroupItem>
              ))}
            </ToggleGroup>
            {PROVINCES.length > 1 && (
              <NativeSelect
                data-testid="province-filter"
                aria-label={m.filter_by_province()}
                value={filterProvince ?? ""}
                onChange={(e) => setFilterProvince(e.target.value || null)}
              >
                <NativeSelectOption value="">{m.all_provinces()}</NativeSelectOption>
                {PROVINCES.map(p => (
                  <NativeSelectOption key={p.code} value={p.code}>
                    {m.filter_option_count({ name: p.label, count: p.count })}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
          </div>
        </div>

        <ItemGroup data-testid="event-list">
          {events.map(e => (
            <Item className="py-4 sm:px-5" key={e.id} data-testid="event-row" render={<a href={routeHref({ page: "event", id: e.id })} />}>
              <ItemMedia className="w-12 flex-col items-start self-start">
                <span className="text-2xl leading-none font-semibold tabular-nums" data-testid="event-day">
                  {e.day ? String(e.day).padStart(2, "0") : "--"}
                </span>
                <span className="mt-0.5 text-xs font-medium text-muted-foreground" data-testid="event-month">{e.month}</span>
              </ItemMedia>
              <ItemContent>
                <ItemTitle data-testid="event-title">{e.title}</ItemTitle>
                <ItemDescription>{e.organizer}</ItemDescription>
                {/* City and province, because "Mueang" alone does not locate an
                    event — every province in Thailand has one. */}
                <ItemDescription className="hidden sm:block">
                  {e.venue}
                  {" · "}
                  <span data-testid="event-city">
                    {e.city}
                    {e.province !== "—" && e.province !== e.city && <> · {e.province}</>}
                  </span>
                  {" · "}
                  {e.division}
                </ItemDescription>
              </ItemContent>
              <ItemActions className="flex-wrap justify-end">
                <Badge variant="outline" data-testid="event-type">{typeLabel(e.typeCode)}</Badge>
                <StatusBadge status={e.status} data-testid="event-status">{e.statusLabel}</StatusBadge>
                <ChevronRightIcon className="size-4 text-muted-foreground" aria-hidden />
              </ItemActions>
            </Item>
          ))}
          {isPending && <Loading className="rounded-none border-0">{m.loading_events()}</Loading>}
          {error && <EmptyState className="rounded-none border-0">{m.events_load_failed()}</EmptyState>}
          {!isPending && !error && events.length === 0 && (
            <EmptyState className="rounded-none border-0">
              {allEvents.length === 0 ? m.no_events_yet() : m.no_events_match()}
            </EmptyState>
          )}
        </ItemGroup>
      </PageInner>
    </>
  );
}

/**
 * What is being played right now, at the top of the page.
 *
 * Was one invented game: two school names, a 54–49 scoreline, "Q3 04:21", a
 * pulsing LIVE dot. Deployed and public, with nothing to say it was not real —
 * and convincing precisely because somebody had written it to look like a real
 * Bangkok quarterfinal.
 *
 * Now the first genuinely live game, or nothing at all. Rendering nothing is
 * the correct answer most of the time, which is the whole difference: an empty
 * banner is information, and an invented one is not.
 */
function LiveBanner({ goto: _goto, spoiler }: { goto: (r: Route) => void; spoiler: boolean }) {
  const { data } = useLiveGames();
  const game = (data?.games ?? [])[0];
  if (!game) return null;
  const scored = game.homeScore !== null && game.awayScore !== null;

  return (
    <PageInner className="py-0 pb-0">
      <Item variant="muted" className="flex-wrap gap-4 px-4 py-4" data-testid="live-banner">
        <ItemContent className="basis-full sm:basis-auto">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status="live">
              <span className="size-1.5 animate-pulse rounded-full bg-current motion-reduce:animate-none" aria-hidden />
              {m.live_now_badge()}
            </StatusBadge>
            {game.venue && <ItemDescription>{game.venue}</ItemDescription>}
          </div>
          <ItemTitle className="line-clamp-2">
            {game.homeTeam} <span className="font-normal text-muted-foreground">{m.versus()}</span> {game.awayTeam}
          </ItemTitle>
        </ItemContent>
        {/* Spoiler mode hides the score and nothing else: someone avoiding the
            result still needs to find the game. */}
        {scored && !spoiler && (
          <div className="text-2xl font-semibold tabular-nums" data-testid="live-banner-score">
            <span className={game.homeScore! >= game.awayScore! ? "text-primary" : undefined}>{game.homeScore}</span>
            <span className="mx-2 font-normal text-muted-foreground">·</span>
            <span className={game.awayScore! > game.homeScore! ? "text-primary" : undefined}>{game.awayScore}</span>
          </div>
        )}
        <span className="text-sm font-medium">{game.statusLabel}</span>
        <ItemActions>
          <ButtonLink href={routeHref({ page: "game", id: game.id })}>
            {game.isBroadcasting ? m.video_watch() : m.open_game()}
          </ButtonLink>
        </ItemActions>
      </Item>
    </PageInner>
  );
}
