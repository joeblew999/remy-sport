// Hook-shaped accessors over the app's data.
//
// Events and teams come from the Workers API (ADR 008). Everything below them
// still reads the fixtures in data.ts because no endpoint backs it yet —
// brackets, live games, rosters, standings and the feed have no tables. Each
// one swaps to a query the same way events and teams did, as its endpoint lands.
//
// Each of these used to be ~20 lines of the same machine: a `useState<Async<T>>`,
// a `useEffect`, a `let live = true` race guard, and paired `.then/.catch`
// setState calls — four hand-rolled copies with no caching and no dedup, where a
// wrong dependency array left a stale view after a language switch. The query
// key and the fetcher now come from the contract via `orpc.*.queryOptions()`,
// so a resource costs one call and nothing here can drift from the API.

import { useQuery } from "@tanstack/react-query";
import { orpc } from "./orpc";
import { toEvent, toTeam } from "./api";
import { useLocalizer } from "./locale";
import {
  BRACKET, LIVE_GAME, ROSTER, STANDINGS, FEED,
  type Team, type Event, type EventStatus, type EventType,
  type Bracket, type LiveGame, type RosterPlayer, type Standing, type FeedItem,
} from "../data";

export interface EventFilters {
  status?: EventStatus;
  type?: EventType;
  city?: string;
  limit?: number;
}

/**
 * What an async accessor returns.
 *
 * Kept as this shape rather than exposing TanStack's result directly, so pages
 * did not have to change and can move to `isPending`/`refetch` when they have a
 * reason to.
 */
export interface Async<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | undefined;
}

const asAsync = <T,>(q: { data: T | undefined; isPending: boolean; error: Error | null }): Async<T> => ({
  data: q.data,
  loading: q.isPending,
  error: q.error ?? undefined,
});

/**
 * Localisation happens in `select`, not in the query key.
 *
 * The cache therefore holds the raw API response, which is language-neutral,
 * and the view models are derived per render for whichever locale is current.
 * Switching language is instant and refetches nothing — keying by locale would
 * have stored the same event twice and gone to the network to change language.
 */
export function useEvents({ status, type, city, limit }: EventFilters = {}): Async<Event[]> {
  const loc = useLocalizer();
  return asAsync(
    useQuery(
      orpc.events.list.queryOptions({
        select: ({ events }) => {
          let r = events.map((e) => toEvent(e, loc));
          if (status) r = r.filter((e) => e.status === status);
          if (type) r = r.filter((e) => e.type === type);
          if (city) r = r.filter((e) => e.city === city);
          if (limit) r = r.slice(0, limit);
          return r;
        },
      }),
    ),
  );
}

export function useEvent(id: string | undefined): Async<Event | undefined> {
  const loc = useLocalizer();
  const q = useQuery(
    orpc.events.get.queryOptions({
      input: { id: id! },
      enabled: id !== undefined,
      select: (e) => toEvent(e, loc),
    }),
  );
  return id === undefined ? { data: undefined, loading: false, error: undefined } : asAsync(q);
}

export function useTeams(): Async<Team[]> {
  const loc = useLocalizer();
  return asAsync(
    useQuery(orpc.teams.list.queryOptions({ select: ({ teams }) => teams.map((t) => toTeam(t, loc)) })),
  );
}

export function useTeam(id: string | undefined): Async<Team | undefined> {
  const loc = useLocalizer();
  const q = useQuery(
    orpc.teams.get.queryOptions({
      input: { id: id! },
      enabled: id !== undefined,
      select: (t) => toTeam(t, loc),
    }),
  );
  return id === undefined ? { data: undefined, loading: false, error: undefined } : asAsync(q);
}

export function useBracket(_eventId?: string): Bracket {
  return BRACKET;
}

export function useLiveGame(_gameId?: string): LiveGame {
  return LIVE_GAME;
}

export function useRoster(_teamId?: string): RosterPlayer[] {
  return ROSTER;
}

export function useStandings(_eventId?: string): Standing[] {
  return STANDINGS;
}

export function useFeed(): FeedItem[] {
  return FEED;
}
