// claude-design: app/lib/data.jsx
// Hook-shaped accessors over the mock window.REMY data.
// These are synchronous today; the production swap will replace
// each body with a react-query call against the Workers API,
// without changing call-sites.
//
// Types are JSDoc — see data.js for typedef definitions.

/**
 * @typedef {Object} EventFilters
 * @property {import('../data.js').EventStatus} [status]
 * @property {import('../data.js').EventType}   [type]
 * @property {string}       [city]
 * @property {number}       [limit]
 */

/**
 * @param {EventFilters} [filters]
 * @returns {import('../data.js').Event[]}
 */
function useEvents(filters = {}) {
  let r = window.REMY.EVENTS;
  if (filters.status) r = r.filter(e => e.status === filters.status);
  if (filters.type)   r = r.filter(e => e.type === filters.type);
  if (filters.city)   r = r.filter(e => e.city === filters.city);
  if (filters.limit)  r = r.slice(0, filters.limit);
  return r;
}

/**
 * @param {string} id
 * @returns {import('../data.js').Event | undefined}
 */
function useEvent(id) {
  return window.REMY.EVENTS.find(e => e.id === id);
}

/** @returns {import('../data.js').Team[]} */
function useTeams() {
  return window.REMY.TEAMS;
}

/**
 * @param {string} id
 * @returns {import('../data.js').Team | undefined}
 */
function useTeam(id) {
  return window.REMY.TEAMS.find(t => t.id === id);
}

/** @returns {import('../data.js').Bracket} */
function useBracket(/* eventId */) {
  return window.REMY.BRACKET;
}

/** @returns {import('../data.js').LiveGame} */
function useLiveGame(/* gameId */) {
  return window.REMY.LIVE_GAME;
}

/** @returns {import('../data.js').RosterPlayer[]} */
function useRoster(/* teamId */) {
  return window.REMY.ROSTER;
}

/** @returns {import('../data.js').Standing[]} */
function useStandings(/* eventId */) {
  return window.REMY.STANDINGS;
}

/** @returns {import('../data.js').FeedItem[]} */
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
