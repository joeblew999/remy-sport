import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi"
import type { AppEnv } from "../types"

const home = new OpenAPIHono<AppEnv>()

home.get("/", (c) => {
  const user = c.get("user")
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Remy Sport</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #0a0a0a; color: #fafafa; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .container { text-align: center; max-width: 600px; padding: 2rem; }
    h1 { font-size: 3rem; margin-bottom: 0.5rem; }
    p { color: #888; font-size: 1.1rem; margin-bottom: 2rem; }
    .actions { display: flex; gap: 1rem; justify-content: center; }
    a { display: inline-block; padding: 0.75rem 1.5rem; border-radius: 8px; text-decoration: none; font-weight: 500; transition: opacity 0.2s; }
    a:hover { opacity: 0.8; }
    .primary { background: #fff; color: #0a0a0a; }
    .secondary { background: transparent; color: #fff; border: 1px solid #333; }
    .user-info { background: #1a1a1a; padding: 1rem; border-radius: 8px; margin-bottom: 2rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Remy Sport</h1>
    <p>Sports platform for basketball</p>
    ${
      user
        ? `<div class="user-info">Signed in as <strong>${user.name || user.email}</strong></div>
           <div class="actions">
             <a href="/api/auth/sign-out" class="secondary">Sign Out</a>
           </div>`
        : `<div class="actions">
             <a href="/login" class="primary">Sign In</a>
             <a href="/login?mode=signup" class="secondary">Create Account</a>
           </div>`
    }
  </div>
</body>
</html>`)
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

export default home
