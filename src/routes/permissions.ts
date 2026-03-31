import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi"
import type { AppEnv } from "../types"
import { roles } from "../auth/access-control"

const RESOURCES = {
  event:      ["create", "read", "update", "delete"],
  team:       ["create", "read", "update", "delete"],
  player:     ["create", "read", "update"],
  roster:     ["manage"],
  score:      ["enter", "read"],
  bracket:    ["generate", "read"],
  fixture:    ["generate", "read"],
  session:    ["define", "read"],
  attendance: ["record", "read"],
  court:      ["assign", "read"],
  user:       ["manage"],
} as const

/** Which event types each resource applies to (from matrix.md) */
const EVENT_TYPE_SCOPE: Record<string, string[]> = {
  event:      ["tournament", "league", "camp", "showcase"],
  team:       ["tournament", "league", "showcase"],
  player:     ["tournament", "league", "camp", "showcase"],
  roster:     ["tournament", "league", "showcase"],
  score:      ["tournament", "league", "showcase"],
  bracket:    ["tournament", "showcase"],
  fixture:    ["tournament", "league"],
  session:    ["camp"],
  attendance: ["camp"],
  court:      ["tournament", "league", "showcase"],
  user:       ["tournament", "league", "camp", "showcase"],
}

/** API routes for each resource+action */
const ROUTE_MAP: Record<string, { method: string; path: string }> = {
  "event:create":      { method: "POST",   path: "/api/events" },
  "event:read":        { method: "GET",    path: "/api/events" },
  "event:update":      { method: "PUT",    path: "/api/events/{id}" },
  "event:delete":      { method: "DELETE", path: "/api/events/{id}" },
  "team:create":       { method: "POST",   path: "/api/teams" },
  "team:read":         { method: "GET",    path: "/api/teams" },
  "team:update":       { method: "PUT",    path: "/api/teams/{id}" },
  "team:delete":       { method: "DELETE", path: "/api/teams/{id}" },
  "player:create":     { method: "POST",   path: "/api/players" },
  "player:read":       { method: "GET",    path: "/api/players" },
  "player:update":     { method: "PUT",    path: "/api/players/{id}" },
  "roster:manage":     { method: "POST",   path: "/api/rosters" },
  "score:enter":       { method: "POST",   path: "/api/scores" },
  "score:read":        { method: "GET",    path: "/api/scores" },
  "bracket:generate":  { method: "POST",   path: "/api/brackets" },
  "bracket:read":      { method: "GET",    path: "/api/brackets" },
  "fixture:generate":  { method: "POST",   path: "/api/fixtures" },
  "fixture:read":      { method: "GET",    path: "/api/fixtures" },
  "session:define":    { method: "POST",   path: "/api/sessions" },
  "session:read":      { method: "GET",    path: "/api/sessions" },
  "attendance:record": { method: "POST",   path: "/api/attendance" },
  "attendance:read":   { method: "GET",    path: "/api/attendance" },
  "court:assign":      { method: "POST",   path: "/api/courts" },
  "court:read":        { method: "GET",    path: "/api/courts" },
  "user:manage":       { method: "GET",    path: "/api/users" },
}

function resolvePermissions(userRole: string) {
  const roleDef = roles[userRole as keyof typeof roles]
  const resources: Record<string, {
    actions: Record<string, boolean>
    eventTypes: string[]
    routes: Record<string, { method: string; path: string }>
  }> = {}

  for (const [resource, actions] of Object.entries(RESOURCES)) {
    const actionMap: Record<string, boolean> = {}
    const routeMap: Record<string, { method: string; path: string }> = {}

    for (const action of actions) {
      let allowed = false
      if (roleDef) {
        const result = (roleDef.authorize as Function)({ [resource]: [action] })
        allowed = !result.error
      }
      actionMap[action] = allowed

      const routeKey = `${resource}:${action}`
      if (ROUTE_MAP[routeKey]) {
        routeMap[action] = ROUTE_MAP[routeKey]
      }
    }

    resources[resource] = {
      actions: actionMap,
      eventTypes: EVENT_TYPE_SCOPE[resource] || [],
      routes: routeMap,
    }
  }

  return resources
}

const PermissionSchema = z.object({
  role: z.string(),
  resources: z.record(z.string(), z.object({
    actions: z.record(z.string(), z.boolean()),
    eventTypes: z.array(z.string()),
    routes: z.record(z.string(), z.object({
      method: z.string(),
      path: z.string(),
    })),
  })),
})

const permissions = new OpenAPIHono<AppEnv>()

const getPermissionsRoute = createRoute({
  method: "get",
  path: "/api/permissions",
  responses: {
    200: {
      description: "Resolved permissions for the current user's role",
      content: { "application/json": { schema: PermissionSchema } },
    },
    401: {
      description: "Unauthorized",
      content: { "application/json": { schema: z.object({ error: z.string() }) } },
    },
  },
  security: [{ Session: [] }, { ApiKey: [] }],
})

permissions.openapi(getPermissionsRoute, async (c) => {
  const user = c.get("user")
  if (!user) return c.json({ error: "Unauthorized" }, 401)

  const role = (user.role || "user") as string
  const resources = resolvePermissions(role)

  return c.json({ role, resources })
})

export default permissions
