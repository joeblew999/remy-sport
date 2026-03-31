import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi"
import type { AppEnv } from "../types"
import { roles } from "../auth/access-control.gen"
import { RESOURCES, EVENT_TYPE_SCOPE, ROUTE_MAP } from "../auth/matrix-data.gen"

/** Derive resource→actions from ROUTE_MAP keys. */
function actionsFor(resource: string): string[] {
  const actions: string[] = []
  for (const key of Object.keys(ROUTE_MAP)) {
    if (key.startsWith(`${resource}:`)) {
      actions.push(key.split(":")[1])
    }
  }
  return actions
}

function resolvePermissions(userRole: string) {
  const roleDef = roles[userRole as keyof typeof roles]
  const resources: Record<string, {
    actions: Record<string, boolean>
    eventTypes: string[]
    routes: Record<string, { method: string; path: string }>
  }> = {}

  for (const resource of RESOURCES) {
    const actionMap: Record<string, boolean> = {}
    const routeMap: Record<string, { method: string; path: string }> = {}

    for (const action of actionsFor(resource)) {
      let allowed = false
      if (roleDef) {
        const result = (roleDef.authorize as Function)({ [resource]: [action] })
        allowed = !result.error
      }
      actionMap[action] = allowed

      const routeKey = `${resource}:${action}`
      const routes = ROUTE_MAP[routeKey]
      if (routes && routes.length > 0) {
        routeMap[action] = routes[0]
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
