// Hook-shaped accessors over the app's data.
//
// Each of these used to be ~20 lines of hand-rolled machine: a
// `useState<Async<T>>`, a `useEffect`, a `let live = true` race guard, and
// paired `.then/.catch` setState calls. Those went when TanStack arrived — but
// an `Async<T>` shim stayed behind, re-wrapping the query result into
// `{data, loading, error}` so pages did not have to change.
//
// The shim is gone now too. It was lossy: a page holding it could not reach
// `isFetching`, `refetch`, `isPlaceholderData` or any mutation state without
// unwrapping something. With ~50 pages coming, every one of them would have
// been written against the smaller surface.
//
// What is left is `useQuery` with the key and the fetcher supplied by the
// contract, so a resource costs one call and nothing here can drift from the
// API.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "./orpc";
import { toEvent, toTeam } from "./api";
import { useLocalizer } from "./locale";
import {
  BRACKET, LIVE_GAME, ROSTER, STANDINGS, FEED,
  type EventStatus, type EventType,
} from "../data";

export interface EventFilters {
  status?: EventStatus;
  type?: EventType;
  city?: string;
  limit?: number;
}

/**
 * Localisation happens in `select`, not in the query key.
 *
 * The cache therefore holds the raw API response, which is language-neutral,
 * and the view models are derived per render for whichever locale is current.
 * Switching language is instant and refetches nothing — keying by locale would
 * have stored the same event twice and gone to the network to change language.
 */
export function useEvents({ status, type, city, limit }: EventFilters = {}) {
  const loc = useLocalizer();
  return useQuery(
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
  );
}

export function useEvent(id: string | undefined) {
  const loc = useLocalizer();
  return useQuery(
    orpc.events.get.queryOptions({
      input: { id: id! },
      enabled: id !== undefined,
      select: (e) => toEvent(e, loc),
    }),
  );
}

export function useTeams() {
  const loc = useLocalizer();
  return useQuery(
    orpc.teams.list.queryOptions({ select: ({ teams }) => teams.map((t) => toTeam(t, loc)) }),
  );
}

export function useTeam(id: string | undefined) {
  const loc = useLocalizer();
  return useQuery(
    orpc.teams.get.queryOptions({
      input: { id: id! },
      enabled: id !== undefined,
      select: (t) => toTeam(t, loc),
    }),
  );
}

/**
 * Prefetch on hover, for list -> detail.
 *
 * `onFocus` as well as `onMouseEnter` is not optional: hover does not exist on
 * the touch targets most of this app's traffic comes from, and a keyboard user
 * gets nothing from `onMouseEnter` alone.
 *
 *   <a {...prefetchEvent(id)} onClick={…}>
 */
export function usePrefetch() {
  const qc = useQueryClient();
  const on = (run: () => void) => ({ onMouseEnter: run, onFocus: run });
  return {
    event: (id: string) =>
      on(() => void qc.prefetchQuery(orpc.events.get.queryOptions({ input: { id } }))),
    team: (id: string) =>
      on(() => void qc.prefetchQuery(orpc.teams.get.queryOptions({ input: { id } }))),
  };
}


// ── Not yet real ───────────────────────────────────────────────────────────
//
// Brackets, live games, rosters, standings and the feed have no tables and no
// endpoints (roadmap phases 3, 4 and 6). These return the fixtures directly and
// are deliberately NOT dressed up as queries: a `useQuery` here would imply a
// network call that does not exist and a loading state that never happens.
//
// Each one leaves this file the way events and teams did — an endpoint lands, a
// procedure appears in src/api/, and the fixture is deleted. Anything rendered
// from them must be labelled SAMPLE DATA (AGENTS.md).

export const useBracket = (_eventId?: string) => BRACKET;
export const useLiveGame = (_gameId?: string) => LIVE_GAME;
export const useRoster = (_teamId?: string) => ROSTER;
export const useStandings = (_eventId?: string) => STANDINGS;
export const useFeed = () => FEED;
