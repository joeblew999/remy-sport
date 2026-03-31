// GENERATED from docs/matrix.json — do not edit manually.
// Regenerate: mise run matrix:generate

/** Typed matrix data from docs/matrix.json for runtime use. */

export const RESOURCES = ["event","team","player","roster","score","bracket","fixture","session","attendance","court","user"] as const
export type Resource = typeof RESOURCES[number]

/** Which event types each resource applies to. */
export const EVENT_TYPE_SCOPE: Record<Resource, string[]> = {
  event       : ["tournament","league","camp","showcase"],
  team        : ["tournament","league","showcase"],
  player      : ["tournament","league","camp","showcase"],
  roster      : ["tournament","league","showcase"],
  score       : ["tournament","league","showcase"],
  bracket     : ["tournament","showcase"],
  fixture     : ["tournament","league"],
  session     : ["camp"],
  attendance  : ["camp"],
  court       : ["tournament","league","showcase"],
  user        : ["tournament","league","camp","showcase"],
}

/** API routes for each resource:action. */
export const ROUTE_MAP: Record<string, { method: string; path: string }[]> = {
  "event:create": [{"method":"POST","path":"/api/events"}],
  "event:read": [{"method":"GET","path":"/api/events"}],
  "event:update": [{"method":"PUT","path":"/api/events/{id}"}],
  "event:delete": [{"method":"DELETE","path":"/api/events/{id}"}],
  "team:create": [{"method":"POST","path":"/api/teams"}],
  "team:read": [{"method":"GET","path":"/api/teams"}],
  "team:update": [{"method":"PUT","path":"/api/teams/{id}"}],
  "team:delete": [{"method":"DELETE","path":"/api/teams/{id}"}],
  "player:create": [{"method":"POST","path":"/api/players"}],
  "player:read": [{"method":"GET","path":"/api/players"}],
  "player:update": [{"method":"PUT","path":"/api/players/{id}"}],
  "roster:manage": [{"method":"POST","path":"/api/rosters"},{"method":"DELETE","path":"/api/rosters/{id}"}],
  "score:enter": [{"method":"POST","path":"/api/scores"},{"method":"PUT","path":"/api/matches/{id}/status"}],
  "score:read": [{"method":"GET","path":"/api/scores"}],
  "bracket:generate": [{"method":"POST","path":"/api/brackets"}],
  "bracket:read": [{"method":"GET","path":"/api/brackets"}],
  "fixture:generate": [{"method":"POST","path":"/api/fixtures"},{"method":"POST","path":"/api/matches"}],
  "fixture:read": [{"method":"GET","path":"/api/fixtures"}],
  "session:define": [{"method":"POST","path":"/api/sessions"}],
  "session:read": [{"method":"GET","path":"/api/sessions"}],
  "attendance:record": [{"method":"POST","path":"/api/attendance"}],
  "attendance:read": [{"method":"GET","path":"/api/attendance"}],
  "court:assign": [{"method":"POST","path":"/api/courts"}],
  "court:read": [{"method":"GET","path":"/api/courts"}],
  "user:manage": [{"method":"GET","path":"/api/users"},{"method":"PUT","path":"/api/users/{id}"}],
}

/** Public read endpoints (no auth required). */
export const PUBLIC_READS: { method: string; path: string }[] = [
  { method: "GET", path: "/api/events" },
  { method: "GET", path: "/api/teams" },
  { method: "GET", path: "/api/players" },
  { method: "GET", path: "/api/scores" },
  { method: "GET", path: "/api/brackets" },
  { method: "GET", path: "/api/fixtures" },
  { method: "GET", path: "/api/sessions" },
  { method: "GET", path: "/api/attendance" },
  { method: "GET", path: "/api/courts" },
  { method: "GET", path: "/api/match-referees" },
]
