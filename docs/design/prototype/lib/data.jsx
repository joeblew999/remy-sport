// claude-design: app/lib/data.jsx
// Hook-shaped accessors over the mock window.REMY data.
// These are synchronous today; the production swap will replace
// each body with a react-query call against the Workers API,
// without changing call-sites.

function useEvents(filters = {}) {
  let r = window.REMY.EVENTS;
  if (filters.status) r = r.filter(e => e.status === filters.status);
  if (filters.type)   r = r.filter(e => e.type === filters.type);
  if (filters.city)   r = r.filter(e => e.city === filters.city);
  if (filters.limit)  r = r.slice(0, filters.limit);
  return r;
}

function useEvent(id) {
  return window.REMY.EVENTS.find(e => e.id === id);
}

function useTeams() {
  return window.REMY.TEAMS;
}

function useTeam(id) {
  return window.REMY.TEAMS.find(t => t.id === id);
}

function useBracket(/* eventId */) {
  return window.REMY.BRACKET;
}

function useLiveGame(/* gameId */) {
  return window.REMY.LIVE_GAME;
}

function useRoster(/* teamId */) {
  return window.REMY.ROSTER;
}

function useStandings(/* eventId */) {
  return window.REMY.STANDINGS;
}

function useFeed() {
  return window.REMY.FEED;
}

window.RemyData = {
  useEvents, useEvent,
  useTeams, useTeam,
  useBracket, useLiveGame,
  useRoster, useStandings,
  useFeed,
};
