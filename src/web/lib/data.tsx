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
  BRACKET, LIVE_GAME, ROSTER, FEED,
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

/**
 * The games in an event, in kick-off order.
 *
 * `canEnterScore` arrives per game from the server — see src/api/games.ts. The
 * page never works it out from the viewer's role, because a referee is assigned
 * to one game and not the next, and a rule in the client could not know that
 * without a copy of the model.
 */
export function useGames(eventId: string | undefined) {
  const loc = useLocalizer();
  return useQuery(
    orpc.games.list.queryOptions({
      input: { eventId },
      enabled: eventId !== undefined,
      select: ({ games }) =>
        games.map((g) => ({
          ...g,
          homeTeam: loc.name(g.homeTeamNames),
          awayTeam: loc.name(g.awayTeamNames),
          venue: g.venueNames ? loc.name(g.venueNames) : null,
          statusLabel: loc.label("gameStatuses", g.statusCode),
        })),
    }),
  );
}

/**
 * The league table for an event, derived server-side from the games.
 *
 * Replaces a `STANDINGS` constant of eight invented schools. The rows arrive
 * ranked; the only thing done here is resolving names into the reader's
 * language.
 */
export function useStandings(eventId: string | undefined) {
  const loc = useLocalizer();
  return useQuery(
    orpc.standings.list.queryOptions({
      input: { eventId: eventId! },
      enabled: eventId !== undefined,
      select: ({ standings }) =>
        standings.map((s) => ({
          ...s,
          team: loc.name(s.teamNames),
          division: s.divisionNames ? loc.name(s.divisionNames) : null,
        })),
    }),
  );
}

/**
 * Organisations, with the city resolved the way every other list resolves it.
 *
 * No mapper in lib/api.ts: an org is already the shape a page renders — the
 * only derived fields are the localised name and city label, which the
 * localizer gives directly. A `toOrg` here would be a function that renames
 * three keys.
 */
export function useOrgs() {
  const loc = useLocalizer();
  return useQuery(
    orpc.orgs.list.queryOptions({
      select: ({ orgs }) =>
        orgs.map((o) => ({ ...o, name: loc.name(o.names), city: loc.label("cities", o.cityCode) })),
    }),
  );
}

export function useOrg(id: string | undefined) {
  const loc = useLocalizer();
  return useQuery(
    orpc.orgs.get.queryOptions({
      input: { id: id! },
      enabled: id !== undefined,
      select: (o) => ({ ...o, name: loc.name(o.names), city: loc.label("cities", o.cityCode) }),
    }),
  );
}

/**
 * An organisation's roster.
 *
 * 403s for anyone who is not its owner or admin, and that is the page's only
 * source of truth about whether to show the section — see pages/org.tsx. The
 * `retry: false` matters: main.tsx already declines to retry a 4xx, and this
 * restates it because a *denied* query that stayed `pending` through retries
 * would render as "loading" instead of "not yours".
 */
export function useOrgMembers(id: string | undefined) {
  return useQuery(
    orpc.orgs.members.queryOptions({
      input: { id: id! },
      enabled: id !== undefined,
      retry: false,
      select: ({ members }) => members,
    }),
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



// ── Not yet real ───────────────────────────────────────────────────────────
//
// Brackets, live games, rosters and the feed have no tables and no endpoints
// (roadmap phases 3, 4 and 6). Standings left this list on 2026-08-27: they are
// derived from the games, so nothing had to be stored for them to become real. These return the fixtures directly and
// are deliberately NOT dressed up as queries: a `useQuery` here would imply a
// network call that does not exist and a loading state that never happens.
//
// Each one leaves this file the way events and teams did — an endpoint lands, a
// procedure appears in src/api/, and the fixture is deleted. Anything rendered
// from them must be labelled SAMPLE DATA (AGENTS.md).

export const useBracket = (_eventId?: string) => BRACKET;
export const useLiveGame = (_gameId?: string) => LIVE_GAME;
export const useRoster = (_teamId?: string) => ROSTER;
export const useFeed = () => FEED;
