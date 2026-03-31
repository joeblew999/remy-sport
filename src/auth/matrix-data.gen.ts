// GENERATED from docs/matrix.json — do not edit manually.
// Regenerate: mise run matrix:generate

/** Typed matrix data from docs/matrix.json for runtime use. */

export const RESOURCES = ["event","team","player","roster","bracket","fixture","session","court","score","attendance","user"] as const
export type Resource = typeof RESOURCES[number]

/** Which event types each resource applies to. */
export const EVENT_TYPE_SCOPE: Record<Resource, string[]> = {
  "event": ["tournament","league","camp","showcase"],
  "team": ["tournament","league","showcase"],
  "player": ["tournament","league","camp","showcase"],
  "roster": ["tournament","league","showcase"],
  "bracket": ["tournament","showcase"],
  "fixture": ["tournament","league"],
  "session": ["camp"],
  "court": ["tournament","league","showcase"],
  "score": ["tournament","league","showcase"],
  "attendance": ["camp"],
  "user": ["tournament","league","camp","showcase"],
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
  "bracket:generate": [{"method":"POST","path":"/api/brackets"}],
  "bracket:read": [{"method":"GET","path":"/api/brackets"}],
  "fixture:generate": [{"method":"POST","path":"/api/fixtures"},{"method":"POST","path":"/api/matches"}],
  "fixture:read": [{"method":"GET","path":"/api/fixtures"}],
  "session:define": [{"method":"POST","path":"/api/sessions"}],
  "session:read": [{"method":"GET","path":"/api/sessions"}],
  "court:assign": [{"method":"POST","path":"/api/courts"}],
  "court:read": [{"method":"GET","path":"/api/courts"}],
  "score:enter": [{"method":"POST","path":"/api/scores"},{"method":"PUT","path":"/api/matches/{id}/status"}],
  "score:read": [{"method":"GET","path":"/api/scores"}],
  "attendance:record": [{"method":"POST","path":"/api/attendance"}],
  "attendance:read": [{"method":"GET","path":"/api/attendance"}],
  "user:manage": [{"method":"GET","path":"/api/users"},{"method":"PUT","path":"/api/users/{id}"}],
}

/** Public read endpoints (no auth required). */
export const PUBLIC_READS: { method: string; path: string }[] = [
  { method: "GET", path: "/api/events" },
  { method: "GET", path: "/api/teams" },
  { method: "GET", path: "/api/players" },
  { method: "GET", path: "/api/brackets" },
  { method: "GET", path: "/api/fixtures" },
  { method: "GET", path: "/api/sessions" },
  { method: "GET", path: "/api/courts" },
  { method: "GET", path: "/api/scores" },
  { method: "GET", path: "/api/attendance" },
  { method: "GET", path: "/api/match-referees" },
]

/** Implementation status for all resources (including planned/not_started). */
export type ResourceStatus = "implemented" | "planned" | "not_started"
export const RESOURCE_STATUS: Record<string, { status: ResourceStatus; group: string; designFeatures: string[] }> = {
  "event": { status: "implemented", group: "events", designFeatures: ["Browse events","Event detail page","Create event"] },
  "division": { status: "planned", group: "events", designFeatures: ["Age & gender divisions"] },
  "registration": { status: "planned", group: "events", designFeatures: ["Register team","Register as player"] },
  "team": { status: "implemented", group: "teams-players", designFeatures: ["Create team profile"] },
  "player": { status: "implemented", group: "teams-players", designFeatures: ["Create player profile"] },
  "roster": { status: "implemented", group: "teams-players", designFeatures: ["Manage roster"] },
  "find-team": { status: "planned", group: "teams-players", designFeatures: ["Find a team"] },
  "bracket": { status: "implemented", group: "schedules-brackets", designFeatures: ["View bracket","Generate brackets"] },
  "consolation-bracket": { status: "planned", group: "schedules-brackets", designFeatures: ["Consolation / back draw"] },
  "fixture": { status: "implemented", group: "schedules-brackets", designFeatures: ["View fixture schedule","Generate fixtures"] },
  "session": { status: "implemented", group: "schedules-brackets", designFeatures: ["Define session schedule"] },
  "court": { status: "implemented", group: "schedules-brackets", designFeatures: ["View court assignments","Assign courts"] },
  "score": { status: "implemented", group: "scores-results", designFeatures: ["Enter scores","View game results","Confirm match status","View match status"] },
  "attendance": { status: "implemented", group: "scores-results", designFeatures: ["Record attendance"] },
  "results-archive": { status: "planned", group: "scores-results", designFeatures: ["View results archive"] },
  "spoiler": { status: "planned", group: "scores-results", designFeatures: ["Spoiler mode"] },
  "standings": { status: "not_started", group: "rankings-standings", designFeatures: ["View standings table","View rank movement","View rankings history"] },
  "player-stats": { status: "not_started", group: "rankings-standings", designFeatures: ["View player stats"] },
  "season-records": { status: "not_started", group: "rankings-standings", designFeatures: ["View season records"] },
  "live-scores": { status: "not_started", group: "live-realtime", designFeatures: ["Live scores"] },
  "notifications": { status: "not_started", group: "live-realtime", designFeatures: ["Push notifications"] },
  "live-stream": { status: "not_started", group: "live-realtime", designFeatures: ["Live stream links"] },
  "court-status": { status: "not_started", group: "live-realtime", designFeatures: ["Court status board"] },
  "ai-assistant": { status: "not_started", group: "ai-assistant", designFeatures: ["Create event by chat","Bracket suggestions","Q&A"] },
  "user": { status: "implemented", group: "admin", designFeatures: ["Manage all users"] },
  "moderation": { status: "not_started", group: "admin", designFeatures: ["Moderate listings"] },
}
