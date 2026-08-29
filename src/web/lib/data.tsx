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

import { useQuery } from "@tanstack/react-query";
import { orpc } from "./orpc";
import { toEvent, toTeam } from "./api";
import { useLocalizer } from "./locale";
import {
  BRACKET, LIVE_GAME, NEXT_GAME, FEED,
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
      select: ({ games, viewerTimezone }) => ({
        viewerTimezone,
        games: games.map((g) => ({
          ...g,
          homeTeam: loc.name(g.homeTeamNames),
          awayTeam: loc.name(g.awayTeamNames),
          venue: g.venueNames ? loc.name(g.venueNames) : null,
          statusLabel: loc.label("gameStatuses", g.statusCode),
        })),
      }),
    }),
  );
}

/**
 * The games being played right now, with whether anyone is broadcasting them.
 *
 * The discovery path for live video, and the reason it has to exist: Cloudflare's
 * relay does not support broadcast discovery, so no client can ask it what is
 * live. `isBroadcasting` comes from our own table, refreshed by the publisher's
 * heartbeat, and this is the only place a viewer can find out that a camera is
 * pointed at a game without opening the player and staring at black.
 *
 * Polled, because a game goes live while somebody is looking at the page.
 */
export function useLiveGames() {
  const loc = useLocalizer();
  return useQuery(
    orpc.games.list.queryOptions({
      input: {},
      refetchInterval: 10_000,
      select: ({ games, viewerTimezone }) => ({
        viewerTimezone,
        games: games
          // In play, or being filmed. A warm-up somebody has a camera on is
          // watchable; a live game nobody is filming is not, and a viewer who
          // came here to watch needs the first list, not the second. A
          // broadcaster arrives before tip-off, so their game is still
          // SCHEDULED when they start — it has to appear here the moment they
          // do, or nobody can find it.
          .filter(
            (g) =>
              g.statusCode === "LIVE" || g.statusCode === "HALF_TIME" || g.isBroadcasting,
          )
          .map((g) => ({
            ...g,
            homeTeam: loc.name(g.homeTeamNames),
            awayTeam: loc.name(g.awayTeamNames),
            venue: g.venueNames ? loc.name(g.venueNames) : null,
            statusLabel: loc.label("gameStatuses", g.statusCode),
          })),
      }),
    }),
  );
}

/**
 * The game to show somebody who did not choose one.
 *
 * A live game if there is one, then the next scheduled, then the most recent —
 * which is the order a person cares about. The video pages need it because the
 * sidebar cannot name a game: a menu entry is a page, and `#/broadcast` has to
 * mean something on its own for a visitor trying the thing out.
 *
 * Not `useLiveGame()`, which returns a hardcoded constant from the sample data
 * and always has.
 */
export function useDefaultGame() {
  return useQuery(
    orpc.games.list.queryOptions({
      input: {},
      select: ({ games }) => {
        const live = games.find((g) => g.statusCode === "LIVE" || g.statusCode === "HALF_TIME")
        if (live) return live
        const upcoming = games
          .filter((g) => g.statusCode === "SCHEDULED")
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0]
        return upcoming ?? games[games.length - 1]
      },
    }),
  );
}

/**
 * One game, for a page that has an id and nothing else.
 *
 * `useGames(undefined)` does not answer this: its query is disabled without an
 * event, so a page holding only a game id got an empty list and rendered no
 * heading at all.
 */
export function useGame(gameId: string | undefined, opts: { refetchInterval?: number } = {}) {
  const loc = useLocalizer();
  return useQuery(
    orpc.games.get.queryOptions({
      input: { id: gameId! },
      enabled: gameId !== undefined,
      ...opts,
      select: (g) => ({
        ...g,
        homeTeam: loc.name(g.homeTeamNames),
        awayTeam: loc.name(g.awayTeamNames),
        venue: g.venueNames ? loc.name(g.venueNames) : null,
        statusLabel: loc.label("gameStatuses", g.statusCode),
      }),
    }),
  );
}

/**
 * One team's games, from both sides of the fixture, seen from that team's end.
 *
 * The team page showed seven invented games until 2026-08-28 — "May 4 · Triam
 * Udom · 71–64 · WON" against a real team, on the same page as a Follow button
 * offering notifications about real scores. It was labelled as sample data,
 * which is not the same as being true.
 *
 * `opponent`, `us` and `them` are derived here rather than in the page, because
 * "did we win" depends on which end of the fixture this team was written on,
 * and that is exactly the sort of thing a component gets subtly wrong.
 */
export function useTeamGames(teamId: string | undefined) {
  const loc = useLocalizer();
  return useQuery(
    orpc.games.list.queryOptions({
      input: { teamId: teamId! },
      enabled: teamId !== undefined,
      select: ({ games, viewerTimezone }) => ({
        viewerTimezone,
        games: games.map((g) => {
          const home = g.homeTeamId === teamId;
          const us = home ? g.homeScore : g.awayScore;
          const them = home ? g.awayScore : g.homeScore;
          return {
            ...g,
            opponent: loc.name(home ? g.awayTeamNames : g.homeTeamNames),
            venue: g.venueNames ? loc.name(g.venueNames) : null,
            us,
            them,
            // Null until both scores exist — an unplayed game has no outcome,
            // and treating a missing score as zero would render every fixture
            // as a loss.
            won: us === null || them === null ? null : us > them,
            live: g.statusCode === "LIVE",
            statusLabel: loc.label("gameStatuses", g.statusCode),
          };
        }),
      }),
    }),
  );
}

/**
 * A team's current squad, with whether the viewer may change it.
 *
 * Replaces a `ROSTER` constant of six invented players with invented per-game
 * averages. Jersey number and position are real; the averages had no table and
 * are simply absent rather than made up again.
 */
export function useRoster(teamId: string | undefined) {
  const loc = useLocalizer();
  return useQuery(
    orpc.teams.roster.queryOptions({
      input: { teamId: teamId! },
      enabled: teamId !== undefined,
      select: (r) => ({
        canManage: r.canManage,
        players: r.players.map((p) => ({
          ...p,
          name: loc.name(p.names),
          position: loc.label("positions", p.positionCode),
        })),
        available: r.available.map((p) => ({ ...p, name: loc.name(p.names) })),
      }),
    }),
  );
}

/**
 * Who is entered in an event, and what this viewer could enter.
 *
 * `registrable` is the server's answer to "may I register this team for this
 * event" — a pair-shaped question the client cannot work out. It comes back
 * empty for everyone without a team to enter, which is what makes the form
 * appear for a coach and not for a spectator.
 */
export function useEntries(eventId: string | undefined) {
  const loc = useLocalizer();
  return useQuery(
    orpc.events.entries.queryOptions({
      input: { eventId: eventId! },
      enabled: eventId !== undefined,
      select: (r) => ({
        registered: r.registered.map((x) => ({
          ...x,
          team: loc.name(x.names),
          division: loc.name(x.divisionNames),
        })),
        registrable: r.registrable.map((x) => ({ ...x, team: loc.name(x.names) })),
        divisions: r.divisions.map((d) => ({ ...d, division: loc.name(d.names) })),
        canManageFixtures: r.canManageFixtures,
      }),
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
// Brackets, live games and the feed have no tables and no endpoints
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
export const useNextGame = () => NEXT_GAME;
export const useFeed = () => FEED;
