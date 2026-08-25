// Hook-shaped accessors over the app's data.
//
// Events and teams come from the Workers API (ADR 008). Everything below them
// still reads the fixtures in data.ts because no endpoint backs it yet —
// brackets, live games, rosters, standings and the feed have no tables. Each
// one swaps to a fetch the same way events and teams did, as its endpoint lands.

import { useEffect, useState } from "react";
import { fetchEvent, fetchEvents, fetchTeam, fetchTeams } from "./api";
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

/** What an async accessor returns. `data` is undefined until the first load settles. */
export interface Async<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | undefined;
}

export function useEvents(filters: EventFilters = {}): Async<Event[]> {
  const loc = useLocalizer();
  const [state, setState] = useState<Async<Event[]>>({
    data: undefined, loading: true, error: undefined,
  });

  // Depend on the filter *values*, not the object — callers pass an inline
  // literal, so a reference dependency would refetch on every render.
  const { status, type, city, limit } = filters;

  useEffect(() => {
    let live = true;
    setState(s => ({ ...s, loading: true }));
    fetchEvents(loc)
      .then(events => {
        if (!live) return;
        let r = events;
        if (status) r = r.filter(e => e.status === status);
        if (type)   r = r.filter(e => e.type === type);
        if (city)   r = r.filter(e => e.city === city);
        if (limit)  r = r.slice(0, limit);
        setState({ data: r, loading: false, error: undefined });
      })
      .catch(error => {
        if (live) setState({ data: undefined, loading: false, error });
      });
    // Ignore a response that arrives after the inputs changed or the component
    // unmounted — otherwise a slow first request overwrites a fast second one.
    return () => { live = false; };
  }, [status, type, city, limit, loc]);

  return state;
}

export function useEvent(id: string | undefined): Async<Event | undefined> {
  const loc = useLocalizer();
  const [state, setState] = useState<Async<Event | undefined>>({
    data: undefined, loading: id !== undefined, error: undefined,
  });

  useEffect(() => {
    if (!id) {
      setState({ data: undefined, loading: false, error: undefined });
      return;
    }
    let live = true;
    setState(s => ({ ...s, loading: true }));
    fetchEvent(id, loc)
      .then(event => { if (live) setState({ data: event, loading: false, error: undefined }); })
      .catch(error => { if (live) setState({ data: undefined, loading: false, error }); });
    return () => { live = false; };
  }, [id, loc]);

  return state;
}

export function useTeams(): Async<Team[]> {
  const loc = useLocalizer();
  const [state, setState] = useState<Async<Team[]>>({
    data: undefined, loading: true, error: undefined,
  });
  useEffect(() => {
    let live = true;
    fetchTeams(loc)
      .then(teams => { if (live) setState({ data: teams, loading: false, error: undefined }); })
      .catch(error => { if (live) setState({ data: undefined, loading: false, error }); });
    return () => { live = false; };
  }, [loc]);
  return state;
}

export function useTeam(id: string | undefined): Async<Team | undefined> {
  const loc = useLocalizer();
  const [state, setState] = useState<Async<Team | undefined>>({
    data: undefined, loading: id !== undefined, error: undefined,
  });
  useEffect(() => {
    if (!id) {
      setState({ data: undefined, loading: false, error: undefined });
      return;
    }
    let live = true;
    setState(s => ({ ...s, loading: true }));
    fetchTeam(id, loc)
      .then(team => { if (live) setState({ data: team, loading: false, error: undefined }); })
      .catch(error => { if (live) setState({ data: undefined, loading: false, error }); });
    return () => { live = false; };
  }, [id, loc]);
  return state;
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
