// Hook-shaped accessors over the mock data in data.ts.
// Synchronous today; production swap each body to a react-query call against
// the Workers API without changing call-sites.

import {
  TEAMS, EVENTS, BRACKET, LIVE_GAME, ROSTER, STANDINGS, FEED,
  type Team, type Event, type EventStatus, type EventType,
  type Bracket, type LiveGame, type RosterPlayer, type Standing, type FeedItem,
} from "../data";

export interface EventFilters {
  status?: EventStatus;
  type?: EventType;
  city?: string;
  limit?: number;
}

export function useEvents(filters: EventFilters = {}): Event[] {
  let r = EVENTS;
  if (filters.status) r = r.filter(e => e.status === filters.status);
  if (filters.type)   r = r.filter(e => e.type === filters.type);
  if (filters.city)   r = r.filter(e => e.city === filters.city);
  if (filters.limit)  r = r.slice(0, filters.limit);
  return r;
}

export function useEvent(id: string | undefined): Event | undefined {
  if (!id) return undefined;
  return EVENTS.find(e => e.id === id);
}

export function useTeams(): Team[] {
  return TEAMS;
}

export function useTeam(id: string | undefined): Team | undefined {
  if (!id) return undefined;
  return TEAMS.find(t => t.id === id);
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
