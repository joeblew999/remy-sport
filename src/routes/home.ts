import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi"
import type { AppEnv } from "../types"
import { layout } from "../views/layout"
import { homePage } from "../views/home"

const home = new OpenAPIHono<AppEnv>()

home.get("/", (c) => {
  return c.html(layout("Remy Sport", homePage(c.get("user"))))
})

const healthRoute = createRoute({
  method: "get",
  path: "/api/health",
  responses: {
    200: {
      description: "System health check",
      content: {
        "application/json": {
          schema: z.object({
            status: z.literal("ok"),
            timestamp: z.string(),
          }),
        },
      },
    },
  },
})

home.openapi(healthRoute, (c) => {
  return c.json({ status: "ok" as const, timestamp: new Date().toISOString() })
})

// Versions endpoint — serves versions.json for the GUI
home.get("/api/versions", async (c) => {
  try {
    const versions = await import("../../versions.json")
    return c.json(versions.default ?? versions)
  } catch {
    return c.json({ error: "versions.json not found — run: task versions" }, 404)
  }
})

export default home
